import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.base import get_db
from app.services.github_oauth import (
    generate_oauth_state, get_github_auth_url,
    exchange_code_for_token, get_github_user
)
from app.services.auth_service import get_or_create_user, create_session, get_user_by_id
from app.core.security import verify_token
from app.core.config import get_settings
from app.schemas.auth import TokenResponse
from app.schemas.user import UserResponse
from app.api.deps import get_current_user
from app.models.user import User
import hashlib
from sqlalchemy import select
from app.models.session import Session
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Authentication"])

# Simple in-memory state store (replace with Redis for production multi-instance)
_oauth_states: dict[str, bool] = {}

@router.get("/github/login")
async def github_login():
    """Redirect to GitHub OAuth"""
    state = generate_oauth_state()
    _oauth_states[state] = True
    url = get_github_auth_url(state)
    return RedirectResponse(url=url)

@router.get("/github/callback")
async def github_callback(
    code: str,
    state: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle GitHub OAuth callback"""
    # Validate state
    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    _oauth_states.pop(state, None)
    
    # Exchange code for token
    github_token = await exchange_code_for_token(code)
    if not github_token:
        raise HTTPException(status_code=400, detail="Failed to obtain GitHub token")
    
    # Get GitHub user info
    github_user = await get_github_user(github_token)
    
    # Get or create local user
    user = await get_or_create_user(db, github_user, github_token)
    
    # Create session
    access_token, refresh_token = await create_session(
        db, user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    
    # Redirect to frontend
    frontend_url = f"https://{settings.domain}" if not settings.debug else "http://localhost:5173"
    redirect = RedirectResponse(url=f"{frontend_url}/auth/success", status_code=302)
    
    # Set cookies directly on the RedirectResponse
    redirect.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        path="/",
        max_age=settings.jwt_access_token_expire_minutes * 60,
    )
    redirect.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        path="/",
        max_age=settings.jwt_refresh_token_expire_days * 24 * 3600,
    )
    
    return redirect

@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    
    user_id = verify_token(refresh_token, token_type="refresh")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(Session).where(
            Session.refresh_token_hash == token_hash,
            Session.is_revoked == False,
            Session.expires_at > datetime.now(timezone.utc),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Session revoked or expired")
    
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    from app.core.security import create_access_token
    new_access_token = create_access_token(str(user.id))
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        path="/",
        max_age=settings.jwt_access_token_expire_minutes * 60,
    )
    return {"message": "Token refreshed"}

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        result = await db.execute(select(Session).where(Session.refresh_token_hash == token_hash))
        session = result.scalar_one_or_none()
        if session:
            session.is_revoked = True
    
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}

@router.get("/ws-token")
async def get_ws_token(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Return the current access token so the frontend can authenticate a WebSocket
    connection via ?token=... (httpOnly cookies are not readable from JS)."""
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="No access token")
    return {"token": token}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
