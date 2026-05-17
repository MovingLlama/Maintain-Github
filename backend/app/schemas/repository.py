from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from uuid import UUID


class RepositoryCreate(BaseModel):
    github_repo_id: int
    full_name: str
    name: str
    description: Optional[str] = None
    default_branch: str = "main"
    is_private: bool = False
    github_metadata: Optional[dict[str, Any]] = None


class RepositoryResponse(BaseModel):
    id: UUID
    owner_id: UUID
    github_repo_id: int
    full_name: str
    name: str
    description: Optional[str] = None
    default_branch: str
    current_branch: str
    status: str
    is_private: bool
    local_path: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    issue_analysis_model: Optional[str] = None
    issue_analysis_enabled: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RepositoryUpdate(BaseModel):
    issue_analysis_model: Optional[str] = None
    issue_analysis_enabled: Optional[bool] = None


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


class RepoSummaryResponse(BaseModel):
    id: UUID
    repository_id: UUID
    summary_text: Optional[str] = None
    file_tree_json: Any
    key_files_json: Any
    languages_json: Any
    total_files: int
    total_size: int
    last_indexed_at: datetime
    content_hash: Optional[str] = None

    class Config:
        from_attributes = True


class RepoIssueResponse(BaseModel):
    id: UUID
    repository_id: UUID
    github_issue_id: int
    number: int
    title: str
    body: Optional[str] = None
    state: str
    labels: list[str] = []
    assignee: Optional[str] = None
    html_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    fix_generated: bool = False
    fix_summary: Optional[str] = None
    fix_branch: Optional[str] = None
    fix_model_used: Optional[str] = None
    analyzed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class IssueAnalysisConfig(BaseModel):
    issue_analysis_model: Optional[str] = None
    issue_analysis_enabled: bool = False
