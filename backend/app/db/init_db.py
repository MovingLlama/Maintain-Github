"""
Database initialization: checks if schema exists and creates it if not.
Also seeds default system agents on first run.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy import text, select
from app.db.base import engine, Base, AsyncSessionLocal
from app.models.agent import Agent
from app.services.ai.agent_definitions import DEFAULT_AGENTS

logger = logging.getLogger(__name__)


async def _seed_agents() -> None:
    """Seed default system agents if they don't exist."""
    async with AsyncSessionLocal() as session:
        try:
            # Check if agents table exists
            try:
                result = await session.execute(
                    text(
                        "SELECT EXISTS (SELECT FROM information_schema.tables "
                        "WHERE table_schema = 'public' AND table_name = 'agents')"
                    )
                )
                if not result.scalar():
                    return  # Table doesn't exist yet
            except Exception:
                return

            # Check if any system agents exist
            result = await session.execute(
                select(Agent).where(Agent.is_default == True).limit(1)
            )
            if result.scalar_one_or_none():
                logger.info("System agents already seeded, skipping.")
                return

            logger.info("Seeding default system agents...")
            for agent_data in DEFAULT_AGENTS:
                agent = Agent(
                    id=agent_data["id"],
                    user_id=None,  # system default
                    name=agent_data["name"],
                    description=agent_data["description"],
                    system_prompt=agent_data["system_prompt"],
                    model_provider=agent_data["model_provider"],
                    model_name=agent_data["model_name"],
                    tools_config=agent_data["tools_config"],
                    is_default=agent_data["is_default"],
                    is_active=agent_data["is_active"],
                )
                session.add(agent)

            await session.commit()
            logger.info(f"Seeded {len(DEFAULT_AGENTS)} default system agents.")

        except Exception as e:
            await session.rollback()
            logger.warning(f"Agent seeding failed (non-fatal): {e}")


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

    # Seed agents after schema is confirmed
    await _seed_agents()
