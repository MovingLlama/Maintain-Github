"""
Security middleware: Rate limiting, security headers, request logging.
"""
import time
import logging
from collections import defaultdict
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter. For production, use Redis-based limiter."""
    
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self._requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for health check
        if request.url.path == "/api/health":
            return await call_next(request)
        
        # Get client IP
        forwarded_for = request.headers.get("X-Forwarded-For")
        client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
            request.client.host if request.client else "unknown"
        )
        
        # Clean old requests (> 60 seconds)
        now = time.time()
        window_start = now - 60
        self._requests[client_ip] = [
            t for t in self._requests[client_ip] if t > window_start
        ]
        
        # Check rate limit
        if len(self._requests[client_ip]) >= self.requests_per_minute:
            logger.warning(f"Rate limit exceeded for {client_ip}")
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": "60"},
            )
        
        # Record request
        self._requests[client_ip].append(now)
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        
        # HSTS (only for HTTPS)
        if request.url.scheme == "https" or request.headers.get("X-Forwarded-Proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all incoming requests with request ID, user, and timing."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.time()
        
        # Get IP from request state (set by RequestIDMiddleware)
        ip = getattr(request.state, "client_ip", None)
        if not ip:
            forwarded_for = request.headers.get("X-Forwarded-For")
            ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
                request.client.host if request.client else "unknown"
            )
        
        response = await call_next(request)
        
        duration_ms = (time.time() - start) * 1000
        request_id = getattr(request.state, "request_id", "-")
        user_id = getattr(request.state, "user_id", None)
        
        # Build structured log message
        extra = {
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 1),
            "client_ip": ip,
            "user_id": user_id or "-",
        }
        
        log_msg = (
            f"{request.method} {request.url.path}"
            f" → {response.status_code}"
        )
        
        # Use appropriate log level based on status code
        if response.status_code >= 500:
            logger.error(log_msg, extra=extra)
        elif response.status_code >= 400:
            logger.warning(log_msg, extra=extra)
        else:
            logger.info(log_msg, extra=extra)
        
        return response
