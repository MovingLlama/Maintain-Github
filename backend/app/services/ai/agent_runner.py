"""
Agentic AI runner: implements the tool-calling loop.
Updated to support global agents and multiple repos per chat.
"""
import json
import logging
from typing import AsyncIterator, Optional, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.chat import Chat, Message
from app.models.agent import Agent
from app.models.issue import RepoSummary
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

    MAX_ITERATIONS = 15

    def __init__(self, db: AsyncSession):
        self.db = db

    async def run(
        self,
        chat: Chat,
        user_message: str,
        user_id: str,
        repo_full_names: Optional[list[str]] = None,
        on_chunk: Optional[Callable[[str], None]] = None,
    ) -> str:
        """
        Run the agent for one turn. Returns the final assistant response.
        `on_chunk` is called for streaming partial responses.
        `repo_full_names` is a list of repo full names (owner/name) attached to this chat.
        """
        # Build message history (includes agent system prompt and repo summaries)
        messages = await self._build_message_history(chat, user_message, repo_full_names)

        # Determine if agent mode (has agent_id) and at least one repo is available
        is_agent = chat.agent_id is not None
        has_repos = bool(repo_full_names)

        # Set up tools if agent mode and repos are available
        tools = AGENT_TOOLS if (is_agent and has_repos) else None
        # Use first repo for tool execution (primary repo)
        primary_repo = repo_full_names[0] if repo_full_names else None
        executor = AgentToolExecutor(user_id, primary_repo) if (tools and primary_repo) else None

        # Determine model/provider: agent overrides chat defaults
        model_provider = chat.model_provider
        model_name = chat.model_name
        if is_agent:
            agent = await self._load_agent(chat.agent_id)
            if agent:
                if agent.model_provider:
                    model_provider = agent.model_provider
                if agent.model_name:
                    model_name = agent.model_name

        final_response = ""

        for iteration in range(self.MAX_ITERATIONS):
            response = await ai_service.chat(
                provider=model_provider,
                model=model_name or self._default_model(model_provider),
                messages=messages,
                tools=tools,
            )

            assistant_msg, tool_calls = self._parse_response(response, model_provider)

            if tool_calls and executor:
                tool_names = [
                    tc.get("function", {}).get("name", "unknown")
                    for tc in tool_calls
                ]
                logger.info(
                    "Agent iteration %d/%d: executing %d tool(s) → %s",
                    iteration + 1, self.MAX_ITERATIONS,
                    len(tool_calls), tool_names,
                )
                messages.append(AIMessage("assistant", assistant_msg or "", tool_calls=tool_calls))

                for tc in tool_calls:
                    tool_name = tc.get("function", {}).get("name", "")
                    try:
                        args = json.loads(tc.get("function", {}).get("arguments", "{}"))
                    except json.JSONDecodeError:
                        args = {}

                    logger.debug("Agent tool call: %s args=%s", tool_name, args)
                    result = await executor.execute(tool_name, args)
                    result_preview = result[:200] + "..." if len(result) > 200 else result
                    logger.debug("Agent tool result: %s → %s", tool_name, result_preview)
                    messages.append(AIMessage(
                        "tool",
                        result,
                        tool_call_id=tc.get("id", "call_0"),
                    ))

                continue
            else:
                final_response = assistant_msg or ""
                logger.info(
                    "Agent finished after %d iteration(s), response length=%d chars",
                    iteration + 1, len(final_response),
                )
                if on_chunk:
                    on_chunk(final_response)
                break
        else:
            final_response = "Agent reached maximum iterations. Please refine your request."
            logger.warning("Agent hit MAX_ITERATIONS=%d limit", self.MAX_ITERATIONS)

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

    async def _load_agent(self, agent_id) -> Optional[Agent]:
        """Load agent configuration."""
        result = await self.db.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        return result.scalar_one_or_none()

    async def _load_repo_summary(self, repo_full_name: str) -> Optional[str]:
        """Load cached repo summary for context injection."""
        from app.models.repository import Repository
        result = await self.db.execute(
            select(RepoSummary).join(Repository).where(
                Repository.full_name == repo_full_name
            )
        )
        summary = result.scalar_one_or_none()
        if summary and summary.summary_text:
            return summary.summary_text
        if summary:
            # Build a structural summary from JSON fields
            parts = []
            if summary.file_tree_json:
                parts.append(f"Repository structure: {json.dumps(summary.file_tree_json, indent=2)[:2000]}")
            if summary.languages_json:
                parts.append(f"Languages: {json.dumps(summary.languages_json)}")
            if summary.key_files_json:
                parts.append(f"Key files: {json.dumps(summary.key_files_json, indent=2)[:2000]}")
            return "\n".join(parts)
        return None

    async def _build_message_history(
        self, chat: Chat, user_message: str, repo_full_names: Optional[list[str]] = None
    ) -> list[AIMessage]:
        messages = []

        # Determine system prompt: agent's system prompt > chat's system prompt > default
        system_prompt = DEFAULT_SYSTEM_PROMPT
        if chat.agent_id:
            agent = await self._load_agent(chat.agent_id)
            if agent and agent.system_prompt:
                system_prompt = agent.system_prompt
            elif chat.system_prompt:
                system_prompt = chat.system_prompt
        elif chat.system_prompt:
            system_prompt = chat.system_prompt

        # Inject repo summaries as context
        if repo_full_names:
            summary_parts = []
            for repo_name in repo_full_names:
                summary = await self._load_repo_summary(repo_name)
                if summary:
                    summary_parts.append(f"## Repository: {repo_name}\n{summary}")
            if summary_parts:
                repo_context = "\n\n---\n\n".join(summary_parts)
                system_prompt += f"\n\n## Repository Context (Pre-indexed Summaries)\n{repo_context}"

        messages.append(AIMessage("system", system_prompt))

        # Load existing messages from DB
        result = await self.db.execute(
            select(Message)
            .where(Message.chat_id == chat.id)
            .order_by(Message.created_at)
        )
        db_messages = result.scalars().all()

        for msg in db_messages[-50:]:
            ai_msg = AIMessage(msg.role, msg.content)
            if msg.tool_calls:
                ai_msg.tool_calls = msg.tool_calls
            messages.append(ai_msg)

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
