"""
Global exception handlers for the FastAPI application.

Registers handlers for:
- HTTPException         → structured JSON with request_id
- RequestValidationError → field-level errors
- WebSocketException    → close with code + reason
- Exception (fallback)  → safe error with request_id (traceback in debug mode)
"""

import traceback
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocket
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()


def _get_request_id(request: Request) -> str:
    """Extract request_id from request state or return fallback."""
    return getattr(request.state, "request_id", None) or "-"


def _log_exception(request: Request, exc: Exception, exc_type: str = "unhandled") -> None:
    """Log exception with full context for debugging."""
    request_id = _get_request_id(request)
    logger.error(
        "%s exception: %s",
        exc_type,
        str(exc),
        extra={
            "method": request.method,
            "path": request.url.path,
            "exception_type": type(exc).__name__,
        },
        exc_info=True,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTPException with structured response."""
    request_id = _get_request_id(request)
    _log_exception(request, exc, exc_type="http")

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": type(exc).__name__,
            "detail": exc.detail,
            "request_id": request_id,
        },
        headers=dict(exc.headers) if exc.headers else {},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors with field-level details."""
    request_id = _get_request_id(request)

    errors = []
    for error in exc.errors():
        field = " → ".join(str(loc) for loc in error["loc"])
        errors.append(
            {
                "field": field,
                "message": error.get("msg", "Validation error"),
                "type": error.get("type", "value_error"),
            }
        )

    logger.warning(
        "Validation error on %s %s: %d errors",
        request.method,
        request.url.path,
        len(errors),
        extra={
            "method": request.method,
            "path": request.url.path,
            "validation_errors": errors,
        },
    )

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "ValidationError",
            "detail": "Request validation failed",
            "errors": errors,
            "request_id": request_id,
        },
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all unhandled exceptions. Shows traceback in debug mode."""
    request_id = _get_request_id(request)
    _log_exception(request, exc, exc_type="unhandled")

    response_content: dict = {
        "error": "InternalServerError",
        "detail": "An unexpected error occurred. Please try again later.",
        "request_id": request_id,
    }

    # In debug mode, include the traceback for developer visibility
    if settings.debug:
        response_content["detail"] = str(exc)
        response_content["traceback"] = traceback.format_exc().split("\n")

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=response_content,
    )


def register_error_handlers(app: FastAPI) -> None:
    """
    Register all exception handlers on the FastAPI app.

    Call this after all routers are included.
    """
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    logger.info("Global error handlers registered")
