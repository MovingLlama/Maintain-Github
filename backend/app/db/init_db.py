"""
Database initialization: runs on EVERY startup.
- Creates missing database tables (on first run).
- Syncs default system agents on EVERY startup (names restored, details refreshed).
"""
import logging
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy import text, select
from app.db.base import engine, Base, AsyncSessionLocal
from app.models.agent import Agent
from app.services.ai.agent_definitions import DEFAULT_AGENTS

logger = logging.getLogger(__name__)


async def _seed_agents() -> None:
    """Seed and refresh default system agents.

    Creates missing agents and updates existing ones with the latest definitions.
    Agent names are ALWAYS restored to their defaults to maintain the delegation
    system integrity (agents reference each other by name).
    """
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

            logger.info("Syncing default system agents...")
            created = 0
            updated = 0

            for agent_data in DEFAULT_AGENTS:
                result = await session.execute(
                    select(Agent).where(Agent.id == agent_data["id"])
                )
                existing = result.scalar_one_or_none()

                if existing:
                    # Update existing agent — always restore name to default
                    existing.name = agent_data["name"]
                    existing.description = agent_data["description"]
                    existing.system_prompt = agent_data["system_prompt"]
                    existing.tools_config = agent_data["tools_config"]
                    existing.is_default = True
                    # Preserve is_active state (user may have disabled it)
                    # Preserve model_provider/model_name (user may have customized)
                    updated += 1
                else:
                    # Create new agent
                    agent = Agent(
                        id=agent_data["id"],
                        user_id=None,  # system default
                        name=agent_data["name"],
                        description=agent_data["description"],
                        system_prompt=agent_data["system_prompt"],
                        model_provider=agent_data["model_provider"],
                        model_name=agent_data["model_name"],
                        tools_config=agent_data["tools_config"],
                        is_default=True,
                        is_active=agent_data["is_active"],
                    )
                    session.add(agent)
                    created += 1

            await session.commit()
            logger.info(
                "Agent sync complete: %d created, %d updated.",
                created, updated,
            )

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
