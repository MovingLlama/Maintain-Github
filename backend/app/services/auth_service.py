import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from cryptography.fernet import Fernet
import base64

from app.models.user import User
from app.models.session import Session
from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token

logger = logging.getLogger(__name__)
settings = get_settings()

def _get_fernet() -> Fernet:
    # Derive a 32-byte key from the secret
    key = hashlib.sha256(settings.app_secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))

def encrypt_token(token: str) -> str:
    f = _get_fernet()
    return f.encrypt(token.encode()).decode()

def decrypt_token(encrypted: str) -> str:
    f = _get_fernet()
    return f.decrypt(encrypted.encode()).decode()

async def get_or_create_user(db: AsyncSession, github_user_data: dict, github_token: str) -> User:
    github_id = github_user_data["id"]
    
    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()
    
    encrypted_token = encrypt_token(github_token)
    
    if user:
        user.github_login = github_user_data.get("login", user.github_login)
        user.github_name = github_user_data.get("name")
        user.github_avatar_url = github_user_data.get("avatar_url")
        user.github_email = github_user_data.get("email")
        user.github_access_token_encrypted = encrypted_token
        user.last_login_at = datetime.now(timezone.utc)
    else:
        user = User(
            github_id=github_id,
            github_login=github_user_data.get("login", ""),
            github_name=github_user_data.get("name"),
            github_email=github_user_data.get("email"),
            github_avatar_url=github_user_data.get("avatar_url"),
            github_access_token_encrypted=encrypted_token,
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.flush()
    
    return user

async def create_session(
    db: AsyncSession,
    user: User,
    user_agent: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> tuple[str, str]:
    """Returns (access_token, refresh_token)"""
    refresh_token = create_refresh_token(str(user.id))
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    
    session = Session(
        user_id=user.id,
        refresh_token_hash=token_hash,
        user_agent=user_agent,
        ip_address=ip_address,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
    )
    db.add(session)
    
    access_token = create_access_token(str(user.id))
    return access_token, refresh_token

async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    return result.scalar_one_or_none()
