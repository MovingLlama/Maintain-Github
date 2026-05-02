import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any

from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.settings import AppSetting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["Settings"])


@router.get("/")
async def get_settings_api(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all non-secret application settings."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.is_secret == False)
    )
    settings = result.scalars().all()
    return {s.key: s.value for s in settings}


@router.get("/user")
async def get_user_settings(current_user: User = Depends(get_current_user)):
    return current_user.settings or {}


@router.put("/user")
async def update_user_settings(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_user.settings = {**(current_user.settings or {}), **payload}
    return current_user.settings
