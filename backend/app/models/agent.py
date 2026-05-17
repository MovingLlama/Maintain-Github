from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class Agent(Base):
    """Agent configuration — globally defined (user_id=NULL) or user-owned."""
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    system_prompt = Column(Text, nullable=True)
    model_provider = Column(String(50), nullable=True)  # ollama | openrouter; NULL = inherit from chat
    model_name = Column(String(255), nullable=True)
    tools_config = Column(JSONB, default=list, nullable=False, server_default="[]")
    is_default = Column(Boolean, default=False, nullable=False)  # TRUE = system template, read-only
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user = relationship("User", back_populates="agents")
    chats = relationship("Chat", back_populates="agent")
