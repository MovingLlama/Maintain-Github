import logging
import json
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID

from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat import Chat, Message, ChatRepository
from app.models.repository import Repository, RepoStatus
from app.models.agent import Agent
from app.schemas.chat import ChatCreate, ChatResponse, MessageCreate, MessageResponse
from app.services.ai.agent_runner import AgentRunner
from app.services.ai.ai_service import AIService, AIMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chats", tags=["Chats"])
ai_service = AIService()


def _chat_to_response(chat: Chat) -> ChatResponse:
    repo_ids = [cr.repository_id for cr in chat.repositories] if chat.repositories else []
    return ChatResponse(
        id=chat.id,
        user_id=chat.user_id,
        agent_id=chat.agent_id,
        title=chat.title,
        model_provider=chat.model_provider,
        model_name=chat.model_name,
        system_prompt=chat.system_prompt,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        repository_ids=repo_ids,
    )


@router.get("/", response_model=list[ChatResponse])
async def list_chats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.repositories))
        .where(Chat.user_id == current_user.id)
        .order_by(Chat.updated_at.desc())
    )
    return [_chat_to_response(c) for c in result.scalars().all()]


@router.post("/", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
async def create_chat(
    payload: ChatCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate agent if provided
    if payload.agent_id:
        result = await db.execute(
            select(Agent).where(
                Agent.id == payload.agent_id,
                (Agent.user_id == None) | (Agent.user_id == current_user.id),
            )
        )
        agent = result.scalar_one_or_none()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

    # Validate repositories if provided
    repo_ids = payload.repository_ids or []
    if repo_ids:
        result = await db.execute(
            select(Repository.id).where(
                Repository.id.in_(repo_ids),
                Repository.owner_id == current_user.id,
            )
        )
        found_ids = {r[0] for r in result.fetchall()}
        missing = set(repo_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Repositories not found: {missing}",
            )

    chat = Chat(
        user_id=current_user.id,
        agent_id=payload.agent_id,
        title=payload.title,
        model_provider=payload.model_provider,
        model_name=payload.model_name,
        system_prompt=payload.system_prompt,
    )
    db.add(chat)
    await db.flush()

    # Attach repositories (many-to-many)
    for repo_id in repo_ids:
        db.add(ChatRepository(chat_id=chat.id, repository_id=repo_id))

    await db.flush()

    # Reload with eager-loaded relationships for response
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.repositories))
        .where(Chat.id == chat.id)
    )
    return _chat_to_response(result.scalar_one())


@router.get("/{chat_id}", response_model=ChatResponse)
async def get_chat(
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.repositories))
        .where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return _chat_to_response(chat)


@router.get("/{chat_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.repositories))
        .where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Save user message
    user_msg = Message(
        chat_id=chat.id,
        role="user",
        content=payload.content,
    )
    db.add(user_msg)
    await db.flush()

    # Collect repo full names from attached repositories
    repo_full_names: list[str] = []
    if chat.repositories:
        repo_ids = [cr.repository_id for cr in chat.repositories]
        repo_result = await db.execute(
            select(Repository).where(
                Repository.id.in_(repo_ids),
                Repository.status == RepoStatus.READY,
            )
        )
        repo_full_names = [r.full_name for r in repo_result.scalars().all()]

    # Determine if agent mode (agent_id is set)
    is_agent_mode = chat.agent_id is not None

    # Run agent or simple chat
    runner = AgentRunner(db)

    if stream and not is_agent_mode:
        async def generate():
            full_response = ""
            async for chunk in runner.stream_simple(chat, payload.content):
                full_response += chunk
                yield f"data: {json.dumps({'content': chunk})}\n\n"

            assistant_msg = Message(
                chat_id=chat.id,
                role="assistant",
                content=full_response,
                model_used=chat.model_name,
            )
            db.add(assistant_msg)
            await _maybe_generate_title(chat, current_user, db)
            await db.commit()
            yield f"data: {json.dumps({'done': True})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    else:
        response_text = await runner.run(
            chat=chat,
            user_message=payload.content,
            user_id=str(current_user.id),
            repo_full_names=repo_full_names,
        )

        assistant_msg = Message(
            chat_id=chat.id,
            role="assistant",
            content=response_text,
            model_used=chat.model_name,
        )
        db.add(assistant_msg)

        await _maybe_generate_title(chat, current_user, db)
        await db.commit()

        return {"role": "assistant", "content": response_text}


async def _maybe_generate_title(chat: Chat, current_user: User, db: AsyncSession):
    """Generate a title for the chat if it's the first message exchange."""
    if chat.title != "New Chat":
        return

    from sqlalchemy import func as sqlfunc
    result = await db.execute(
        select(sqlfunc.count(Message.id)).where(Message.chat_id == chat.id)
    )
    msg_count = result.scalar() or 0
    if msg_count != 2:
        return

    result = await db.execute(
        select(Message).where(Message.chat_id == chat.id).order_by(Message.created_at).limit(2)
    )
    msgs = result.scalars().all()
    if len(msgs) < 2:
        return

    conversation = "\n".join(f"{msg.role}: {msg.content[:200]}" for msg in msgs)

    user_settings = current_user.settings or {}
    title_model_key = user_settings.get("title_generation_model")
    if title_model_key:
        colon_idx = title_model_key.find(":")
        if colon_idx > 0:
            title_provider = title_model_key[:colon_idx]
            title_model_name = title_model_key[colon_idx + 1:]
        else:
            return
    else:
        title_provider = chat.model_provider
        title_model_name = chat.model_name or ("llama3:8b" if title_provider == "ollama" else "anthropic/claude-3-haiku")

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

        if title_provider == "ollama":
            title = response.get("message", {}).get("content", "").strip()
        else:
            title = response["choices"][0].get("message", {}).get("content", "").strip()

        title = title.strip('"\'').strip()
        if title and len(title) > 80:
            title = title[:77] + "..."

        if title:
            chat.title = title
            logger.info(f"Auto-generated title for chat {chat.id}: {title}")

    except Exception as e:
        logger.warning(f"Title generation failed (non-fatal): {e}")


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


class ChatUpdatePayload(BaseModel):
    title: Optional[str] = None
    system_prompt: Optional[str] = None


@router.patch("/{chat_id}/title")
async def update_chat_title(
    chat_id: UUID,
    payload: ChatUpdatePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    )
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if payload.title is not None:
        chat.title = payload.title
    if payload.system_prompt is not None:
        chat.system_prompt = payload.system_prompt
    await db.commit()
    return {"id": str(chat.id), "title": chat.title, "system_prompt": chat.system_prompt}


@router.post("/{chat_id}/generate-title")
async def generate_chat_title(
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

    result = await db.execute(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at).limit(4)
    )
    msgs = result.scalars().all()

    if not msgs:
        raise HTTPException(status_code=400, detail="No messages in chat")

    conversation = "\n".join(
        f"{msg.role}: {msg.content[:200]}" for msg in msgs
    )

    user_settings = current_user.settings or {}
    title_model_key = user_settings.get("title_generation_model")
    if title_model_key:
        colon_idx = title_model_key.find(":")
        title_provider = title_model_key[:colon_idx]
        title_model_name = title_model_key[colon_idx + 1:]
    else:
        title_provider = chat.model_provider
        title_model_name = chat.model_name or ("llama3:8b" if title_provider == "ollama" else "anthropic/claude-3-haiku")

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

        if title_provider == "ollama":
            title = response.get("message", {}).get("content", "").strip()
        else:
            title = response["choices"][0].get("message", {}).get("content", "").strip()

        title = title.strip('"\'').strip()
        if len(title) > 80:
            title = title[:77] + "..."

        chat.title = title or "New Chat"
        await db.commit()

        return {"id": str(chat.id), "title": chat.title}

    except Exception as e:
        logger.error(f"Title generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Title generation failed: {str(e)}")
