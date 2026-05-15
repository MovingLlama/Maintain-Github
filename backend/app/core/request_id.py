"""
Request ID middleware for tracking requests across the entire system.

Generates a UUID4 per request, stores it in request.state.request_id,
injects it into the logging context, and returns it in the X-Request-ID
response header for client-side correlation.
"""

import uuid
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logging import request_id_var, user_id_var, client_ip_var, get_logger

logger = get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Middleware that assigns a unique ID to every incoming HTTP request.

    - Generates a UUID4 request ID
    - Stores it in request.state.request_id
    - Sets X-Request-ID response header
    - Sets context variables for logging (request_id, user_id, client_ip)
    - Logs request timing information
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate a unique request ID
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        request_id_var.set(request_id)

        # Extract client IP
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        elif request.client:
            client_ip = request.client.host
        else:
            client_ip = "unknown"
        request.state.client_ip = client_ip
        client_ip_var.set(client_ip)

        # User ID is not available until authentication middleware runs,
        # but we set a default here. The auth dependency will update it.
        request.state.user_id = None

        # Track timing
        start_time = time.time()

        try:
            response = await call_next(request)
        except Exception:
            # Log and re-raise; the global error handler will catch it
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                "Unhandled exception during request processing",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration_ms, 2),
                },
                exc_info=True,
            )
            raise

        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000

        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id

        # Log at DEBUG level (the RequestLoggingMiddleware handles INFO-level logging)
        logger.debug(
            "%s %s → %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )

        return response
