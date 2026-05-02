from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.db.base import Base

class RepoStatus(str, enum.Enum):
    PENDING = "pending"
    CLONING = "cloning"
    READY = "ready"
    ERROR = "error"
    PUSHING = "pushing"

class Repository(Base):
    __tablename__ = "repositories"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    github_repo_id = Column(Integer, nullable=False)
    full_name = Column(String(500), nullable=False)  # owner/repo
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    default_branch = Column(String(255), default="main", nullable=False)
    current_branch = Column(String(255), default="main", nullable=False)
    local_path = Column(Text, nullable=True)  # local filesystem path
    status = Column(Enum(RepoStatus), default=RepoStatus.PENDING, nullable=False, index=True)
    is_private = Column(Boolean, default=False, nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    github_metadata = Column(JSONB, default=dict, nullable=False, server_default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    owner = relationship("User", back_populates="repositories")
    chats = relationship("Chat", back_populates="repository")
