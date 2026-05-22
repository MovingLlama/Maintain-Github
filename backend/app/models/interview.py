from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from app.db.base import Base


class InterviewPrepQuestion(Base):
    """AI-generated interview preparation questions for a repository."""
    __tablename__ = "interview_prep_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    repository_id = Column(
        UUID(as_uuid=True),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)  # The AI-generated model answer/rubric
    category = Column(String(100), nullable=False, index=True)  # Preset categories
    difficulty = Column(String(50), nullable=False, index=True)  # Easy, Medium, Hard
    user_answer = Column(Text, nullable=True)  # User's written response
    feedback = Column(Text, nullable=True)  # Natural language review from AI
    is_completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    repository = relationship("Repository", back_populates="interview_questions")
    user = relationship("User")
