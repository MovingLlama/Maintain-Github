from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from uuid import UUID
from app.models.repository import RepoStatus

class RepositoryBase(BaseModel):
    full_name: str
    name: str
    description: Optional[str] = None
    default_branch: str = "main"
    is_private: bool = False

class RepositoryCreate(RepositoryBase):
    github_repo_id: int
    github_metadata: dict = {}

class RepositoryResponse(RepositoryBase):
    id: UUID
    owner_id: UUID
    github_repo_id: int
    current_branch: str
    status: RepoStatus
    local_path: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class GitHubRepoListItem(BaseModel):
    id: int
    full_name: str
    name: str
    description: Optional[str] = None
    default_branch: str
    private: bool
    html_url: str
    language: Optional[str] = None
    stargazers_count: int = 0
    updated_at: Optional[str] = None
