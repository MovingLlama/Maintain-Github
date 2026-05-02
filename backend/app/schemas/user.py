from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID

class UserBase(BaseModel):
    github_login: str
    github_name: Optional[str] = None
    github_email: Optional[str] = None
    github_avatar_url: Optional[str] = None

class UserResponse(UserBase):
    id: UUID
    github_id: int
    is_active: bool
    is_admin: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    settings: Optional[dict] = None
