import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate, AgentResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agents", tags=["Agents"])


def _agent_to_response(agent: Agent) -> AgentResponse:
    return AgentResponse(
        id=agent.id,
        user_id=agent.user_id,
        name=agent.name,
        description=agent.description,
        system_prompt=agent.system_prompt,
        model_provider=agent.model_provider,
        model_name=agent.model_name,
        tools_config=agent.tools_config or [],
        is_default=agent.is_default,
        is_active=agent.is_active,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


@router.get("/", response_model=list[AgentResponse])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all available agents — system defaults + user's own agents."""
    result = await db.execute(
        select(Agent).where(
            (Agent.user_id == None) | (Agent.user_id == current_user.id)
        ).order_by(Agent.is_default.desc(), Agent.name)
    )
    return [_agent_to_response(a) for a in result.scalars().all()]


@router.get("/system", response_model=list[AgentResponse])
async def list_system_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List only system default agents."""
    result = await db.execute(
        select(Agent).where(Agent.user_id == None, Agent.is_default == True)
        .order_by(Agent.name)
    )
    return [_agent_to_response(a) for a in result.scalars().all()]


@router.get("/my", response_model=list[AgentResponse])
async def list_my_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List only the current user's custom agents."""
    result = await db.execute(
        select(Agent).where(Agent.user_id == current_user.id).order_by(Agent.name)
    )
    return [_agent_to_response(a) for a in result.scalars().all()]


@router.post("/", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: AgentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new user-owned agent."""
    agent = Agent(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        system_prompt=payload.system_prompt,
        model_provider=payload.model_provider,
        model_name=payload.model_name,
        tools_config=payload.tools_config or [],
        is_default=False,
        is_active=True,
    )
    db.add(agent)
    await db.flush()
    return _agent_to_response(agent)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific agent."""
    result = await db.execute(
        select(Agent).where(
            Agent.id == agent_id,
            (Agent.user_id == None) | (Agent.user_id == current_user.id),
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_response(agent)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: UUID,
    payload: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an agent. System agents (is_default=True) can be edited EXCEPT their name."""
    result = await db.execute(
        select(Agent).where(
            Agent.id == agent_id,
            (Agent.user_id == None) | (Agent.user_id == current_user.id),
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Check ownership: only user-owned agents or system agents
    if agent.user_id is not None and str(agent.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not your agent")

    is_system = agent.is_default and agent.user_id is None

    if payload.name is not None:
        if is_system:
            raise HTTPException(
                status_code=422,
                detail="Cannot rename system agents. Their names are fixed to ensure the delegation system works correctly.",
            )
        agent.name = payload.name
    if payload.description is not None:
        agent.description = payload.description
    if payload.system_prompt is not None:
        agent.system_prompt = payload.system_prompt
    if payload.model_provider is not None:
        agent.model_provider = payload.model_provider
    if payload.model_name is not None:
        agent.model_name = payload.model_name
    if payload.tools_config is not None:
        agent.tools_config = payload.tools_config
    if payload.is_active is not None:
        agent.is_active = payload.is_active

    await db.flush()
    return _agent_to_response(agent)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a user-owned agent. System agents cannot be deleted."""
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found or not owned by you")
    if agent.is_default:
        raise HTTPException(status_code=403, detail="System agents cannot be deleted")
    await db.delete(agent)
    return None
