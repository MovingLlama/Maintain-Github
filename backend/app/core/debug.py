"""
Debug utilities for development and troubleshooting.

Provides:
- DebugContext for conditional debug-only logging
- @timed decorator for measuring function execution time
- SQL query logging helpers
- HTTP request/response logging for httpx
"""

import time
import functools
from typing import Any, Callable, Optional
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


class DebugContext:
    """Context manager and utility class for debug-only operations."""

    @staticmethod
    def is_enabled() -> bool:
        """Check if debug mode is active."""
        return settings.debug

    @staticmethod
    def log_sql(query: str, params: Optional[dict] = None) -> None:
        """Log a SQL query with its parameters (debug mode only)."""
        if not settings.debug:
            return
        # Truncate very long queries
        query_display = query if len(query) <= 500 else query[:497] + "..."
        if params:
            logger.debug("[SQL] %s | params=%s", query_display, params)
        else:
            logger.debug("[SQL] %s", query_display)

    @staticmethod
    def log_http_request(
        method: str,
        url: str,
        headers: Optional[dict] = None,
        body: Optional[Any] = None,
    ) -> None:
        """Log an outbound HTTP request (debug mode only)."""
        if not settings.debug:
            return
        safe_headers = DebugContext._sanitize_headers(headers or {})
        body_preview = DebugContext._preview_body(body)
        logger.debug(
            "[HTTP →] %s %s | headers=%s | body=%s",
            method,
            url,
            safe_headers,
            body_preview,
        )

    @staticmethod
    def log_http_response(status_code: int, duration_ms: float, body: Optional[Any] = None) -> None:
        """Log an outbound HTTP response (debug mode only)."""
        if not settings.debug:
            return
        body_preview = DebugContext._preview_body(body)
        logger.debug(
            "[HTTP ←] %d (%.1fms) | body=%s",
            status_code,
            duration_ms,
            body_preview,
        )

    @staticmethod
    def _sanitize_headers(headers: dict) -> dict:
        """Remove sensitive headers before logging."""
        sensitive = {"authorization", "api-key", "x-api-key", "cookie", "set-cookie"}
        return {
            k: "***" if k.lower() in sensitive else v
            for k, v in headers.items()
        }

    @staticmethod
    def _preview_body(body: Optional[Any], max_length: int = 300) -> str:
        """Create a truncated preview of a request/response body."""
        if body is None:
            return "<empty>"
        body_str = str(body)
        if len(body_str) > max_length:
            return body_str[:max_length] + "..."
        return body_str


def timed(name: Optional[str] = None):
    """
    Decorator that measures and logs function execution time.
    Always logs at DEBUG level; use only for functions you want to profile.
    
    Usage:
        @timed("my_func")
        def my_func():
            ...
        
        @timed()  # Uses function name
        def my_func():
            ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            label = name or func.__name__
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                elapsed = (time.perf_counter() - start) * 1000
                logger.debug("[TIMING] %s completed in %.1fms", label, elapsed)
                return result
            except Exception:
                elapsed = (time.perf_counter() - start) * 1000
                logger.debug("[TIMING] %s failed after %.1fms", label, elapsed)
                raise

        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            label = name or func.__name__
            start = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                elapsed = (time.perf_counter() - start) * 1000
                logger.debug("[TIMING] %s completed in %.1fms", label, elapsed)
                return result
            except Exception:
                elapsed = (time.perf_counter() - start) * 1000
                logger.debug("[TIMING] %s failed after %.1fms", label, elapsed)
                raise

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# Module-level singleton for convenience
debug = DebugContext()
