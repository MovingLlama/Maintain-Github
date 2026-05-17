from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    github_id = Column(Integer, unique=True, nullable=False, index=True)
    github_login = Column(String(255), nullable=False, index=True)
    github_name = Column(String(255), nullable=True)
    github_email = Column(String(255), nullable=True)
    github_avatar_url = Column(Text, nullable=True)
    github_access_token_encrypted = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    settings = Column(JSONB, default=dict, nullable=False, server_default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    repositories = relationship("Repository", back_populates="owner", cascade="all, delete-orphan")
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    agents = relationship("Agent", back_populates="user", cascade="all, delete-orphan")
