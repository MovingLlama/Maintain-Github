import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from uuid import UUID
from typing import List

from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.repository import Repository
from app.models.interview import InterviewPrepQuestion
from app.schemas.interview import (
    InterviewPrepQuestionResponse,
    InterviewPrepQuestionGenerateRequest,
    UserAnswerSubmitRequest,
    UserAnswerFeedbackResponse,
)
from app.services.ai.interview_service import InterviewService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/interview", tags=["Interview Prep"])


@router.get("/repos/{repo_id}", response_model=List[InterviewPrepQuestionResponse])
async def list_repo_questions(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all interview preparation questions for a specific repository."""
    # Verify repository ownership
    repo_result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = await db.execute(
        select(InterviewPrepQuestion)
        .where(
            InterviewPrepQuestion.repository_id == repo_id,
            InterviewPrepQuestion.user_id == current_user.id
        )
        .order_by(InterviewPrepQuestion.created_at.desc())
    )
    return result.scalars().all()


@router.post("/repos/{repo_id}/generate", response_model=List[InterviewPrepQuestionResponse])
async def generate_repo_questions(
    repo_id: UUID,
    payload: InterviewPrepQuestionGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manually generate a batch of interview questions for a repository based on category and difficulty.
    This runs synchronously within the request (up to 120s timeout) to return the new questions immediately.
    """
    # Verify repository ownership
    repo_result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    service = InterviewService(db)
    try:
        questions = await service.generate_questions(
            repo_id=str(repo_id),
            user_id=str(current_user.id),
            count=payload.count,
            category=payload.category,
            difficulty=payload.difficulty,
        )
        return questions
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating questions via API: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/questions/{question_id}/answer", response_model=UserAnswerFeedbackResponse)
async def submit_question_answer(
    question_id: UUID,
    payload: UserAnswerSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a written candidate answer for AI review and feedback."""
    service = InterviewService(db)
    try:
        updated_question = await service.check_answer(
            question_id=str(question_id),
            user_answer=payload.user_answer,
            user_id=str(current_user.id),
        )
        return UserAnswerFeedbackResponse(
            question_id=updated_question.id,
            is_completed=updated_question.is_completed,
            user_answer=updated_question.user_answer,
            feedback=updated_question.feedback,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error checking answer via API: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


@router.delete("/repos/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_repo_questions(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all generated interview questions for a repository (Reset)."""
    # Verify repository ownership
    repo_result = await db.execute(
        select(Repository).where(
            Repository.id == repo_id,
            Repository.owner_id == current_user.id
        )
    )
    repo = repo_result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    await db.execute(
        delete(InterviewPrepQuestion).where(
            InterviewPrepQuestion.repository_id == repo_id,
            InterviewPrepQuestion.user_id == current_user.id
        )
    )
    await db.commit()
