from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class InterviewPrepQuestionResponse(BaseModel):
    id: UUID
    repository_id: UUID
    user_id: UUID
    question: str
    answer: str
    category: str
    difficulty: str
    user_answer: Optional[str] = None
    feedback: Optional[str] = None
    is_completed: bool
    created_at: datetime

    class Config:
        from_attributes = True


class InterviewPrepQuestionGenerateRequest(BaseModel):
    count: int = 5
    category: Optional[str] = None
    difficulty: str = "Medium"  # Easy, Medium, Hard


class UserAnswerSubmitRequest(BaseModel):
    user_answer: str


class UserAnswerFeedbackResponse(BaseModel):
    question_id: UUID
    is_completed: bool
    user_answer: str
    feedback: str

    class Config:
        from_attributes = True
