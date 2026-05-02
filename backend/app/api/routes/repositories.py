import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID
from pathlib import Path
import shutil

from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.repository import Repository, RepoStatus
from app.schemas.repository import RepositoryCreate, RepositoryResponse, GitHubRepoListItem
from app.services.github_oauth import get_user_repos
from app.services.auth_service import decrypt_token
from app.services.git.git_service import GitService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/repositories", tags=["Repositories"])
git_service = GitService()

def _get_github_token(user: User) -> str:
    if not user.github_access_token_encrypted:
        raise HTTPException(status_code=400, detail="GitHub token not available")
    return decrypt_token(user.github_access_token_encrypted)

@router.get("/github", response_model=list[GitHubRepoListItem])
async def list_github_repos(
    page: int = 1,
    per_page: int = 30,
    current_user: User = Depends(get_current_user),
):
    """List GitHub repositories of the authenticated user"""
    token = _get_github_token(current_user)
    repos = await get_user_repos(token, page=page, per_page=per_page)
    return repos

@router.get("/", response_model=list[RepositoryResponse])
async def list_local_repos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List locally cloned repositories"""
    result = await db.execute(
        select(Repository).where(Repository.owner_id == current_user.id)
    )
    return result.scalars().all()

@router.post("/clone", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
async def clone_repository(
    payload: RepositoryCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clone a GitHub repository locally"""
    # Check if already cloned
    result = await db.execute(
        select(Repository).where(
            Repository.owner_id == current_user.id,
            Repository.github_repo_id == payload.github_repo_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    
    repo = Repository(
        owner_id=current_user.id,
        github_repo_id=payload.github_repo_id,
        full_name=payload.full_name,
        name=payload.name,
        description=payload.description,
        default_branch=payload.default_branch,
        current_branch=payload.default_branch,
        is_private=payload.is_private,
        status=RepoStatus.CLONING,
        github_metadata=payload.github_metadata,
    )
    db.add(repo)
    await db.flush()
    
    # Clone in background
    token = _get_github_token(current_user)
    background_tasks.add_task(
        _clone_repo_background,
        str(repo.id),
        token,
        payload.full_name,
        str(current_user.id),
        payload.default_branch,
    )
    
    return repo

async def _clone_repo_background(
    repo_id: str, token: str, full_name: str, user_id: str, branch: str
):
    from app.db.base import AsyncSessionLocal
    from datetime import datetime, timezone
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Repository).where(Repository.id == repo_id))
            repo = result.scalar_one_or_none()
            if not repo:
                return
            
            path = await git_service.clone_repository(token, full_name, user_id, branch)
            repo.local_path = str(path)
            repo.status = RepoStatus.READY
            repo.last_synced_at = datetime.now(timezone.utc)
            await db.commit()
        except Exception as e:
            logger.error(f"Clone failed: {e}")
            async with AsyncSessionLocal() as db2:
                result = await db2.execute(select(Repository).where(Repository.id == repo_id))
                repo = result.scalar_one_or_none()
                if repo:
                    repo.status = RepoStatus.ERROR
                    await db2.commit()

@router.get("/{repo_id}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo

@router.get("/{repo_id}/files")
async def get_repository_files(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    if repo.status != RepoStatus.READY:
        raise HTTPException(status_code=400, detail=f"Repository is not ready (status: {repo.status})")
    
    files = git_service.get_file_tree(str(current_user.id), repo.full_name)
    return {"files": files}

@router.get("/{repo_id}/files/{file_path:path}")
async def read_repository_file(
    repo_id: UUID,
    file_path: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    try:
        content = git_service.read_file(str(current_user.id), repo.full_name, file_path)
        return {"path": file_path, "content": content}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")

from pydantic import BaseModel

class FileWriteRequest(BaseModel):
    content: str

@router.put("/{repo_id}/files/{file_path:path}")
async def write_repository_file(
    repo_id: UUID,
    file_path: str,
    payload: FileWriteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    try:
        git_service.write_file(str(current_user.id), repo.full_name, file_path, payload.content)
        return {"message": "File updated", "path": file_path}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")

class CommitPushRequest(BaseModel):
    message: str

@router.post("/{repo_id}/push")
async def commit_and_push(
    repo_id: UUID,
    payload: CommitPushRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    token = _get_github_token(current_user)
    
    try:
        sha = git_service.commit_and_push(
            token,
            repo.full_name,
            str(current_user.id),
            payload.message,
            current_user.github_name or current_user.github_login,
            current_user.github_email or "",
        )
        return {"message": "Pushed successfully", "commit_sha": sha}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Remove local files
    if repo.local_path and Path(repo.local_path).exists():
        shutil.rmtree(repo.local_path, ignore_errors=True)
    
    await db.delete(repo)
