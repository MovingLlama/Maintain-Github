from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.db.base import Base


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class Chat(Base):
    __tablename__ = "chats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(500), default="New Chat", nullable=False)
    model_provider = Column(String(50), default="ollama", nullable=False)  # ollama | openrouter
    model_name = Column(String(255), nullable=True)
    system_prompt = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="chats")
    agent = relationship("Agent", back_populates="chats")
    repositories = relationship("ChatRepository", back_populates="chat", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chat_id = Column(UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # user | assistant | system | tool
    content = Column(Text, nullable=False)
    tool_calls = Column(JSONB, nullable=True)
    tool_result = Column(JSONB, nullable=True)
    model_used = Column(String(255), nullable=True)
    token_count = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    chat = relationship("Chat", back_populates="messages")


class ChatRepository(Base):
    """Join table: many-to-many relationship between chats and repositories."""
    __tablename__ = "chat_repositories"

    chat_id = Column(UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True)
    repository_id = Column(UUID(as_uuid=True), ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True)

    chat = relationship("Chat", back_populates="repositories")
    repository = relationship("Repository", back_populates="chats")
