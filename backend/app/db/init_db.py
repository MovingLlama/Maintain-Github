"""
Database initialization: checks if schema exists and creates it if not.
Runs automatically on startup via Alembic migrations.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy import text
from app.db.base import engine, Base

logger = logging.getLogger(__name__)

async def init_db() -> None:
    """
    Check if tables exist; if not, create them.
    In production, Alembic handles migrations.
    This is a fallback for first-run setup.
    """
    async with engine.begin() as conn:
        # Check if the users table exists (as a proxy for DB being initialized)
        result = await conn.execute(
            text(
                "SELECT EXISTS (SELECT FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = 'users')"
            )
        )
        exists = result.scalar()
        
        if not exists:
            logger.info("Database schema not found. Creating tables...")
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Database schema created successfully.")
        else:
            logger.info("Database schema already exists. Skipping creation.")
