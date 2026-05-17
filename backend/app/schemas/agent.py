from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    model_provider: Optional[str] = None  # ollama | openrouter
    model_name: Optional[str] = None
    tools_config: Optional[list[str]] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    tools_config: Optional[list[str]] = None
    is_active: Optional[bool] = None


class AgentResponse(BaseModel):
    id: UUID
    user_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    model_provider: Optional[str] = None
    model_name: Optional[str] = None
    tools_config: list[str]
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
