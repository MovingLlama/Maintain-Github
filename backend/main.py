import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.init_db import init_db
from app.api.routes import auth, repositories, chat, ai, settings, ws

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
settings_obj = get_settings()

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

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
