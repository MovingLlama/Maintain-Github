from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import setup_logging, get_logger
from app.core.request_id import RequestIDMiddleware
from app.core.error_handlers import register_error_handlers
from app.core.metrics import MetricsMiddleware, metrics_endpoint
from app.db.init_db import init_db
from app.api.routes import auth, repositories, chat, ai, settings, ws

settings_obj = get_settings()

# Initialize structured logging before anything else
setup_logging(
    log_level=settings_obj.log_level,
    log_format=settings_obj.log_format,
)
logger = get_logger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Maintain@Github backend...")
    await init_db()
    logger.info("Database initialized.")
    yield
    logger.info("Shutting down...")

app = FastAPI(
    title="Maintain@Github",
    description="AI-powered GitHub repository management",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings_obj.debug else None,
    redoc_url="/api/redoc" if settings_obj.debug else None,
)

# Request ID — must be the first middleware
app.add_middleware(RequestIDMiddleware)

# Metrics — after request ID so we have request_id in logs
app.add_middleware(MetricsMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_obj.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(repositories.router)
app.include_router(chat.router)
app.include_router(ai.router)
app.include_router(settings.router)
app.include_router(ws.router)

# Register global error handlers (must be after routers)
register_error_handlers(app)

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}

@app.get("/api/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return await metrics_endpoint()
