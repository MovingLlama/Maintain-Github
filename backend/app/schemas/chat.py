from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from uuid import UUID
from app.models.chat import MessageRole

class ChatCreate(BaseModel):
    title: str = "New Chat"
    repository_id: Optional[UUID] = None
    model_provider: str = "ollama"
    model_name: Optional[str] = None
    system_prompt: Optional[str] = None
    is_agent_mode: bool = False

class ChatResponse(BaseModel):
    id: UUID
    user_id: UUID
    repository_id: Optional[UUID] = None
    title: str
    model_provider: str
    model_name: Optional[str] = None
    is_agent_mode: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: UUID
    chat_id: UUID
    role: MessageRole
    content: str
    tool_calls: Optional[Any] = None
    tool_result: Optional[Any] = None
    model_used: Optional[str] = None
    token_count: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
