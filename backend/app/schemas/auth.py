from pydantic import BaseModel
from typing import Optional
from app.schemas.user import UserResponse

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse

class TokenRefreshRequest(BaseModel):
    refresh_token: str

class GitHubCallbackRequest(BaseModel):
    code: str
    state: str
