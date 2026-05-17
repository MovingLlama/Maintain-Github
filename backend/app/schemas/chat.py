from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from uuid import UUID


class ChatCreate(BaseModel):
    title: str = "New Chat"
    agent_id: Optional[UUID] = None
    repository_ids: Optional[list[UUID]] = None  # repos to attach as tools
    model_provider: str = "ollama"
    model_name: Optional[str] = None
    system_prompt: Optional[str] = None


class ChatResponse(BaseModel):
    id: UUID
    user_id: UUID
    agent_id: Optional[UUID] = None
    title: str
    model_provider: str
    model_name: Optional[str] = None
    system_prompt: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Denormalized: attached repo ids for convenience
    repository_ids: Optional[list[UUID]] = None

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: UUID
    chat_id: UUID
    role: str
    content: str
    tool_calls: Optional[Any] = None
    tool_result: Optional[Any] = None
    model_used: Optional[str] = None
    token_count: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
