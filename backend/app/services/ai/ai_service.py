import httpx
import json
import logging
from typing import AsyncIterator, Optional, Any
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

class AIMessage:
    def __init__(self, role: str, content: str, tool_calls: Optional[list] = None, tool_call_id: Optional[str] = None):
        self.role = role
        self.content = content
        self.tool_calls = tool_calls
        self.tool_call_id = tool_call_id

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"role": self.role, "content": self.content}
        if self.tool_calls:
            d["tool_calls"] = self.tool_calls
        if self.tool_call_id:
            d["tool_call_id"] = self.tool_call_id
        return d


class AIService:
    """Unified AI service supporting Ollama and OpenRouter."""

    async def list_ollama_models(self) -> list[dict]:
        """List available local Ollama models."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{settings.ollama_base_url}/api/tags")
                resp.raise_for_status()
                data = resp.json()
                return [
                    {"id": m["name"], "name": m["name"], "provider": "ollama", "size": m.get("size")}
                    for m in data.get("models", [])
                ]
        except Exception as e:
            logger.warning(f"Could not reach Ollama: {e}")
            return []

    async def list_openrouter_models(self) -> list[dict]:
        """List available OpenRouter models."""
        if not settings.openrouter_api_key:
            return []
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{OPENROUTER_BASE_URL}/models",
                    headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
                )
                resp.raise_for_status()
                data = resp.json()
                return [
                    {
                        "id": m["id"],
                        "name": m.get("name", m["id"]),
                        "provider": "openrouter",
                        "context_length": m.get("context_length"),
                        "pricing": m.get("pricing"),
                    }
                    for m in data.get("data", [])
                ]
        except Exception as e:
            logger.warning(f"Could not reach OpenRouter: {e}")
            return []

    async def chat_ollama(
        self,
        model: str,
        messages: list[AIMessage],
        tools: Optional[list[dict]] = None,
        stream: bool = False,
    ) -> dict:
        """Send chat request to Ollama."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.to_dict() for m in messages],
            "stream": stream,
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/chat",
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def pull_ollama_model(self, model_name: str) -> dict:
        """Pull a model from Ollama registry."""
        async with httpx.AsyncClient(timeout=600) as client:
            resp = await client.post(
                f"{settings.ollama_base_url}/api/pull",
                json={"name": model_name, "stream": False},
            )
            resp.raise_for_status()
            return resp.json()

    async def stream_ollama(
        self,
        model: str,
        messages: list[AIMessage],
        tools: Optional[list[dict]] = None,
    ) -> AsyncIterator[str]:
        """Stream chat response from Ollama."""
        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.to_dict() for m in messages],
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{settings.ollama_base_url}/api/chat",
                json=payload,
            ) as resp:
                async for line in resp.aiter_lines():
                    if line.strip():
                        try:
                            data = json.loads(line)
                            content = data.get("message", {}).get("content", "")
                            if content:
                                yield content
                            if data.get("done"):
                                break
                        except json.JSONDecodeError:
                            continue

    async def chat_openrouter(
        self,
        model: str,
        messages: list[AIMessage],
        tools: Optional[list[dict]] = None,
        stream: bool = False,
    ) -> dict:
        """Send chat request to OpenRouter."""
        if not settings.openrouter_api_key:
            raise ValueError("OpenRouter API key not configured")

        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.to_dict() for m in messages],
            "stream": stream,
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": f"https://{settings.domain}",
                    "X-Title": "Maintain@Github",
                },
            )
            resp.raise_for_status()
            return resp.json()

    async def stream_openrouter(
        self,
        model: str,
        messages: list[AIMessage],
        tools: Optional[list[dict]] = None,
    ) -> AsyncIterator[str]:
        """Stream chat response from OpenRouter."""
        if not settings.openrouter_api_key:
            raise ValueError("OpenRouter API key not configured")

        payload: dict[str, Any] = {
            "model": model,
            "messages": [m.to_dict() for m in messages],
            "stream": True,
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{OPENROUTER_BASE_URL}/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "HTTP-Referer": f"https://{settings.domain}",
                    "X-Title": "Maintain@Github",
                },
            ) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

    async def chat(
        self,
        provider: str,
        model: str,
        messages: list[AIMessage],
        tools: Optional[list[dict]] = None,
        stream: bool = False,
    ) -> dict:
        """Unified chat interface."""
        import time
        from app.core.debug import debug

        start = time.time()
        msg_count = len(messages)
        tool_count = len(tools) if tools else 0
        total_chars = sum(len(m.content) for m in messages)

        debug.log_http_request(
            "CHAT",
            f"{provider}/{model}",
            headers={"provider": provider},
            body={
                "messages": msg_count,
                "tools": tool_count,
                "total_chars": total_chars,
                "stream": stream,
            },
        )

        try:
            if provider == "ollama":
                result = await self.chat_ollama(model, messages, tools, stream)
            elif provider == "openrouter":
                result = await self.chat_openrouter(model, messages, tools, stream)
            else:
                raise ValueError(f"Unknown provider: {provider}")

            duration_ms = (time.time() - start) * 1000
            debug.log_http_response(200, duration_ms, body={"provider": provider, "model": model})
            logger.debug(
                "AI chat: provider=%s model=%s messages=%d tools=%d duration=%.0fms",
                provider, model, msg_count, tool_count, duration_ms,
            )
            return result
        except Exception as e:
            duration_ms = (time.time() - start) * 1000
            logger.error(
                "AI chat failed: provider=%s model=%s error=%s duration=%.0fms",
                provider, model, str(e), duration_ms,
            )
            raise

    async def stream(
        self,
        provider: str,
        model: str,
        messages: list[AIMessage],
        tools: Optional[list[dict]] = None,
    ) -> AsyncIterator[str]:
        """Unified streaming interface."""
        import time
        start = time.time()
        chunk_count = 0

        try:
            if provider == "ollama":
                async for chunk in self.stream_ollama(model, messages, tools):
                    chunk_count += 1
                    yield chunk
            elif provider == "openrouter":
                async for chunk in self.stream_openrouter(model, messages, tools):
                    chunk_count += 1
                    yield chunk
            else:
                raise ValueError(f"Unknown provider: {provider}")

            duration_ms = (time.time() - start) * 1000
            logger.debug(
                "AI stream complete: provider=%s model=%s chunks=%d duration=%.0fms",
                provider, model, chunk_count, duration_ms,
            )
        except Exception as e:
            duration_ms = (time.time() - start) * 1000
            logger.error(
                "AI stream failed: provider=%s model=%s error=%s duration=%.0fms",
                provider, model, str(e), duration_ms,
            )
            raise
