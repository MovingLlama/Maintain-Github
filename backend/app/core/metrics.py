"""
Prometheus metrics for the Maintain@Github backend.

Exposes:
- HTTP request counter and duration histogram
- AI service call counter and duration histogram
- WebSocket connections gauge
- Git operations counter and duration histogram

Endpoint: GET /api/metrics (Prometheus text format)
"""

import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# Lazy-import prometheus_client to avoid hard dependency at import time
# (only required if METRICS_ENABLED=true)
_prometheus_available = False
try:
    from prometheus_client import (
        Counter,
        Histogram,
        Gauge,
        generate_latest,
        CONTENT_TYPE_LATEST,
        CollectorRegistry,
    )
    _prometheus_available = True
except ImportError:
    pass

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Registry
_registry = None
if _prometheus_available:
    _registry = CollectorRegistry()

# HTTP metrics
http_requests_total = None
http_request_duration_seconds = None
http_requests_in_flight = None

if _prometheus_available and _registry is not None:
    http_requests_total = Counter(
        "maintain_http_requests_total",
        "Total HTTP requests",
        ["method", "endpoint", "status_code"],
        registry=_registry,
    )
    http_request_duration_seconds = Histogram(
        "maintain_http_request_duration_seconds",
        "HTTP request duration in seconds",
        ["method", "endpoint"],
        buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
        registry=_registry,
    )
    http_requests_in_flight = Gauge(
        "maintain_http_requests_in_flight",
        "HTTP requests currently being processed",
        registry=_registry,
    )

# AI service metrics
ai_service_calls_total = None
ai_service_duration_seconds = None

if _prometheus_available and _registry is not None:
    ai_service_calls_total = Counter(
        "maintain_ai_service_calls_total",
        "Total AI service calls",
        ["provider", "model", "status"],
        registry=_registry,
    )
    ai_service_duration_seconds = Histogram(
        "maintain_ai_service_duration_seconds",
        "AI service call duration in seconds",
        ["provider", "model"],
        buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0],
        registry=_registry,
    )

# WebSocket metrics
websocket_connections_active = None

if _prometheus_available and _registry is not None:
    websocket_connections_active = Gauge(
        "maintain_websocket_connections_active",
        "Active WebSocket connections",
        registry=_registry,
    )

# Git operation metrics
git_operations_total = None
git_operation_duration_seconds = None

if _prometheus_available and _registry is not None:
    git_operations_total = Counter(
        "maintain_git_operations_total",
        "Total Git operations",
        ["operation", "status"],
        registry=_registry,
    )
    git_operation_duration_seconds = Histogram(
        "maintain_git_operation_duration_seconds",
        "Git operation duration in seconds",
        ["operation"],
        buckets=[0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 120.0],
        registry=_registry,
    )


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Middleware that tracks HTTP request metrics for Prometheus.

    Records:
    - http_requests_total (by method, endpoint, status_code)
    - http_request_duration_seconds (by method, endpoint)
    - http_requests_in_flight (gauge)
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip metrics endpoint itself to avoid recursion
        if request.url.path == "/api/metrics":
            return await call_next(request)

        if not settings.metrics_enabled or not _prometheus_available:
            return await call_next(request)

        method = request.method
        # Use route path pattern instead of actual path to avoid cardinality explosion
        endpoint = request.url.path

        # Increment in-flight
        if http_requests_in_flight:
            http_requests_in_flight.inc()

        start = time.time()
        try:
            response = await call_next(request)
            status_code = str(response.status_code)
        except Exception:
            status_code = "500"
            raise
        finally:
            duration = time.time() - start

            # Record metrics
            if http_requests_total:
                http_requests_total.labels(
                    method=method, endpoint=endpoint, status_code=status_code
                ).inc()
            if http_request_duration_seconds:
                http_request_duration_seconds.labels(
                    method=method, endpoint=endpoint
                ).observe(duration)
            if http_requests_in_flight:
                http_requests_in_flight.dec()

        return response


async def metrics_endpoint() -> Response:
    """Returns Prometheus metrics in text format."""
    if not settings.metrics_enabled or not _prometheus_available:
        return Response(
            content="Metrics disabled (prometheus_client not installed or METRICS_ENABLED=false)\n",
            media_type="text/plain",
            status_code=200,
        )
    return Response(
        content=generate_latest(_registry),
        media_type=CONTENT_TYPE_LATEST,
    )


def record_ai_call(provider: str, model: str, duration_s: float, success: bool = True) -> None:
    """Record an AI service call in Prometheus metrics."""
    if not settings.metrics_enabled or not _prometheus_available:
        return
    status = "success" if success else "error"
    if ai_service_calls_total:
        ai_service_calls_total.labels(
            provider=provider, model=model, status=status
        ).inc()
    if ai_service_duration_seconds:
        ai_service_duration_seconds.labels(
            provider=provider, model=model
        ).observe(duration_s)


def record_git_operation(operation: str, duration_s: float, success: bool = True) -> None:
    """Record a Git operation in Prometheus metrics."""
    if not settings.metrics_enabled or not _prometheus_available:
        return
    status = "success" if success else "error"
    if git_operations_total:
        git_operations_total.labels(
            operation=operation, status=status
        ).inc()
    if git_operation_duration_seconds:
        git_operation_duration_seconds.labels(
            operation=operation
        ).observe(duration_s)
