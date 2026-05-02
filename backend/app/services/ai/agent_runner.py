"""
Agentic AI runner: implements the tool-calling loop.
"""
import json
import logging
from typing import AsyncIterator, Optional, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.chat import Chat, Message, MessageRole
from app.services.ai.ai_service import AIService, AIMessage
from app.services.ai.agent_tools import AGENT_TOOLS, AgentToolExecutor

logger = logging.getLogger(__name__)
ai_service = AIService()

DEFAULT_SYSTEM_PROMPT = """You are an expert software engineer assistant integrated with a GitHub repository management system.

You have access to tools that allow you to:
- Read and write files in the repository
- Search for patterns in code
- View git history and diffs
- Make changes that can be committed and pushed to GitHub

When helping with code tasks:
1. First understand the codebase by reading relevant files
2. Make targeted, high-quality changes
3. Explain what you changed and why
4. Suggest a clear commit message for your changes

Always be careful with file writes - double-check paths and content before writing."""


class AgentRunner:
    """Runs the AI agent loop with tool calling."""

    MAX_ITERATIONS = 15  # Prevent infinite loops

    def __init__(self, db: AsyncSession):
        self.db = db

    async def run(
        self,
        chat: Chat,
        user_message: str,
        user_id: str,
        repo_full_name: Optional[str] = None,
        on_chunk: Optional[Callable[[str], None]] = None,
    ) -> str:
        """
        Run the agent for one turn. Returns the final assistant response.
        `on_chunk` is called for streaming partial responses.
        """
        # Build message history
        messages = await self._build_message_history(chat, user_message)
        
        # Set up tools if agent mode and repo is available
        tools = AGENT_TOOLS if (chat.is_agent_mode and repo_full_name) else None
        executor = AgentToolExecutor(user_id, repo_full_name) if (tools and repo_full_name) else None
        
        final_response = ""
        
        for iteration in range(self.MAX_ITERATIONS):
            # Call AI
            response = await ai_service.chat(
                provider=chat.model_provider,
                model=chat.model_name or self._default_model(chat.model_provider),
                messages=messages,
                tools=tools,
            )
            
            # Parse response
            assistant_msg, tool_calls = self._parse_response(response, chat.model_provider)
            
            if tool_calls and executor:
                # Execute tool calls
                logger.info(f"Agent executing {len(tool_calls)} tool call(s)")
                messages.append(AIMessage("assistant", assistant_msg or "", tool_calls=tool_calls))
                
                # Execute each tool and add results
                for tc in tool_calls:
                    tool_name = tc.get("function", {}).get("name", "")
                    try:
                        args = json.loads(tc.get("function", {}).get("arguments", "{}"))
                    except json.JSONDecodeError:
                        args = {}
                    
                    result = await executor.execute(tool_name, args)
                    messages.append(AIMessage(
                        "tool",
                        result,
                        tool_call_id=tc.get("id", "call_0"),
                    ))
                
                # Continue loop for agent to process tool results
                continue
            else:
                # No tool calls → final response
                final_response = assistant_msg or ""
                if on_chunk:
                    on_chunk(final_response)
                break
        else:
            final_response = "Agent reached maximum iterations. Please refine your request."
        
        return final_response

    async def stream_simple(
        self,
        chat: Chat,
        user_message: str,
    ) -> AsyncIterator[str]:
        """Simple streaming (no tool calls)."""
        messages = await self._build_message_history(chat, user_message)
        
        async for chunk in ai_service.stream(
            provider=chat.model_provider,
            model=chat.model_name or self._default_model(chat.model_provider),
            messages=messages,
        ):
            yield chunk

    async def _build_message_history(self, chat: Chat, user_message: str) -> list[AIMessage]:
        messages = []
        
        # System prompt
        system = chat.system_prompt or DEFAULT_SYSTEM_PROMPT
        messages.append(AIMessage("system", system))
        
        # Load existing messages from DB
        result = await self.db.execute(
            select(Message)
            .where(Message.chat_id == chat.id)
            .order_by(Message.created_at)
        )
        db_messages = result.scalars().all()
        
        for msg in db_messages[-50:]:  # Last 50 messages for context
            ai_msg = AIMessage(msg.role.value, msg.content)
            if msg.tool_calls:
                ai_msg.tool_calls = msg.tool_calls
            messages.append(ai_msg)
        
        # Add new user message
        messages.append(AIMessage("user", user_message))
        return messages

    def _parse_response(self, response: dict, provider: str) -> tuple[Optional[str], Optional[list]]:
        """Parse AI response into (content, tool_calls)."""
        try:
            if provider == "ollama":
                msg = response.get("message", {})
                content = msg.get("content")
                tool_calls = msg.get("tool_calls")
                return content, tool_calls
            elif provider == "openrouter":
                choice = response["choices"][0]
                msg = choice.get("message", {})
                content = msg.get("content")
                tool_calls = msg.get("tool_calls")
                return content, tool_calls
        except (KeyError, IndexError):
            pass
        return None, None

    def _default_model(self, provider: str) -> str:
        if provider == "ollama":
            return "llama3:8b"
        elif provider == "openrouter":
            return "anthropic/claude-3-haiku"
        return "llama3:8b"
