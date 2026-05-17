from sqlalchemy import Column, String, DateTime, Text, Integer, BigInteger, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class RepoSummary(Base):
    """Cached repository summary for token-efficient context injection in chats."""
    __tablename__ = "repo_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repository_id = Column(
        UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    summary_text = Column(Text, nullable=True)  # Natural language summary (optional, via LLM)
    file_tree_json = Column(JSONB, nullable=False, default=dict)  # Structured file tree
    key_files_json = Column(JSONB, nullable=False, default=list)  # [{path, size, language, description}]
    languages_json = Column(JSONB, nullable=False, default=dict)  # {language: {count, percentage}}
    total_files = Column(Integer, default=0, nullable=False)
    total_size = Column(BigInteger, default=0, nullable=False)  # Total size in bytes
    last_indexed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    content_hash = Column(String(64), nullable=True)  # SHA-256 hash of file tree state

    repository = relationship("Repository", back_populates="summary")


class RepoIssue(Base):
    """GitHub issues tracked per repository."""
    __tablename__ = "repo_issues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repository_id = Column(
        UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    github_issue_id = Column(BigInteger, nullable=False)
    number = Column(Integer, nullable=False)
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=True)
    state = Column(String(20), default="open", nullable=False, index=True)  # open | closed
    labels = Column(JSONB, default=list, nullable=False, server_default="[]")
    assignee = Column(String(255), nullable=True)
    html_url = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # Auto-analysis results
    fix_generated = Column(Boolean, default=False, nullable=False)
    fix_summary = Column(Text, nullable=True)
    fix_branch = Column(String(500), nullable=True)
    fix_model_used = Column(String(255), nullable=True)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)

    repository = relationship("Repository", back_populates="issues")
