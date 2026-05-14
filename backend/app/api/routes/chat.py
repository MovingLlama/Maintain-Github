import logging
import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID

from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat import Chat, Message, MessageRole
from app.models.repository import Repository, RepoStatus
from app.schemas.chat import ChatCreate, ChatResponse, MessageCreate, MessageResponse
from app.services.ai.agent_runner import AgentRunner
from app.services.ai.ai_service import AIService, AIMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chats", tags=["Chats"])
ai_service = AIService()


@router.get("/", response_model=list[ChatResponse])
async def list_chats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Chat)
        .where(Chat.user_id == current_user.id)
        .order_by(Chat.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
async def create_chat(
    payload: ChatCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate repository if provided
    if payload.repository_id:
        result = await db.execute(
            select(Repository).where(
                Repository.id == payload.repository_id,
                Repository.owner_id == current_user.id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Repository not found")

    chat = Chat(
        user_id=current_user.id,
        title=payload.title,
        repository_id=payload.repository_id,
        model_provider=payload.model_provider,
        model_name=payload.model_name,
        system_prompt=payload.system_prompt,
        is_agent_mode=payload.is_agent_mode,
    )
    db.add(chat)
    await db.flush()
    return chat


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat


@router.get("/{chat_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify ownership
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chat not found")

    result = await db.execute(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    )
    return result.scalars().all()


@router.post("/{chat_id}/messages")
async def send_message(
    chat_id: UUID,
    payload: MessageCreate,
    stream: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message and get AI response. Supports streaming via ?stream=true"""
    # Load chat
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Save user message
    user_msg = Message(
        chat_id=chat.id,
        role=MessageRole.USER,
        content=payload.content,
    )
    db.add(user_msg)
    await db.flush()

    # Get repo context if needed
    repo_full_name = None
    if chat.repository_id:
        repo_result = await db.execute(
            select(Repository).where(
                Repository.id == chat.repository_id,
                Repository.status == RepoStatus.READY,
            )
        )
        repo = repo_result.scalar_one_or_none()
        if repo:
            repo_full_name = repo.full_name

    # Run agent or simple chat
    runner = AgentRunner(db)

    if stream and not chat.is_agent_mode:
        # Streaming response (simple chat only)
        async def generate():
            full_response = ""
            async for chunk in runner.stream_simple(chat, payload.content):
                full_response += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"
            
            # Save assistant message after streaming
            assistant_msg = Message(
                chat_id=chat.id,
                role=MessageRole.ASSISTANT,
                content=full_response,
                model_used=chat.model_name,
            )
            db.add(assistant_msg)
            await db.commit()
            yield f"data: {json.dumps({'done': True})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    else:
        # Non-streaming (also used for agent mode)
        response_text = await runner.run(
            chat=chat,
            user_message=payload.content,
            user_id=str(current_user.id),
            repo_full_name=repo_full_name,
        )

        # Save assistant message
        assistant_msg = Message(
            chat_id=chat.id,
            role=MessageRole.ASSISTANT,
            content=response_text,
            model_used=chat.model_name,
        )
        db.add(assistant_msg)
        await db.commit()

        return {"role": "assistant", "content": response_text}


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.delete(chat)


@router.patch("/{chat_id}/title")
async def update_chat_title(
    chat_id: UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.title = payload.get("title", chat.title)
    return {"id": str(chat.id), "title": chat.title}


@router.post("/{chat_id}/generate-title")
async def generate_chat_title(
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Auto-generate a title for the chat using AI based on the conversation."""
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Load first few messages for context
    result = await db.execute(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at).limit(4)
    )
    msgs = result.scalars().all()

    if not msgs:
        raise HTTPException(status_code=400, detail="No messages in chat")

    # Build conversation snippet
    conversation = "\n".join(
        f"{msg.role.value}: {msg.content[:200]}" for msg in msgs
    )

    # Determine which model to use for title generation
    user_settings = current_user.settings or {}
    title_model_key = user_settings.get("title_generation_model")
    if title_model_key:
        colon_idx = title_model_key.find(":")
        title_provider = title_model_key[:colon_idx]
        title_model_name = title_model_key[colon_idx + 1:]
    else:
        title_provider = chat.model_provider
        title_model_name = chat.model_name or ("llama3:8b" if title_provider == "ollama" else "anthropic/claude-3-haiku")

    # Generate title via AI
    try:
        title_prompt = f"""Generate a very short, concise title (max 6 words) for this conversation.
Respond with ONLY the title, no quotes, no explanation.

Conversation:
{conversation}

Title:"""

        response = await ai_service.chat(
            provider=title_provider,
            model=title_model_name,
            messages=[AIMessage("user", title_prompt)],
        )

        # Parse title from response
        if title_provider == "ollama":
            title = response.get("message", {}).get("content", "").strip()
        else:
            title = response["choices"][0].get("message", {}).get("content", "").strip()

        # Clean up: remove quotes, limit length
        title = title.strip('"\'').strip()
        if len(title) > 80:
            title = title[:77] + "..."

        chat.title = title or "New Chat"
        await db.commit()

        return {"id": str(chat.id), "title": chat.title}

    except Exception as e:
        logger.error(f"Title generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Title generation failed: {str(e)}")
