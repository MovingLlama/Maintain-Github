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
    try:
        return decrypt_token(user.github_access_token_encrypted)
    except Exception as e:
        logger.error(f"Failed to decrypt GitHub token: {e}")
        raise HTTPException(status_code=500, detail="Failed to decrypt GitHub token. Please re-authenticate.")

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
    from app.services.git.repo_indexer import index_repository
    from app.models.issue import RepoSummary
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Repository).where(Repository.id == repo_id))
            repo = result.scalar_one_or_none()
            if not repo:
                return
            
            path = await git_service.clone_repository(token, full_name, user_id, branch)
            repo.local_path = str(path)
            repo.status = RepoStatus.READY
            repo.last_synced_at = datetime.now(timezone.utc)
            await db.flush()

            # Index the repository for token-efficient context
            try:
                index_data = index_repository(str(path))
                existing_summary = await db.execute(
                    select(RepoSummary).where(RepoSummary.repository_id == repo.id)
                )
                summary = existing_summary.scalar_one_or_none()
                if summary:
                    summary.summary_text = index_data["summary_text"]
                    summary.file_tree_json = index_data["file_tree_json"]
                    summary.key_files_json = index_data["key_files_json"]
                    summary.languages_json = index_data["languages_json"]
                    summary.total_files = index_data["total_files"]
                    summary.total_size = index_data["total_size"]
                    summary.last_indexed_at = datetime.now(timezone.utc)
                    summary.content_hash = index_data["content_hash"]
                else:
                    summary = RepoSummary(
                        repository_id=repo.id,
                        summary_text=index_data["summary_text"],
                        file_tree_json=index_data["file_tree_json"],
                        key_files_json=index_data["key_files_json"],
                        languages_json=index_data["languages_json"],
                        total_files=index_data["total_files"],
                        total_size=index_data["total_size"],
                        last_indexed_at=datetime.now(timezone.utc),
                        content_hash=index_data["content_hash"],
                    )
                    db.add(summary)
                logger.info(f"Indexed repository {full_name}: {index_data['total_files']} files")
            except Exception as idx_err:
                logger.warning(f"Repo indexing failed for {full_name} (non-fatal): {idx_err}")

            await db.commit()
    except Exception as e:
        logger.error(f"Clone failed for repo {repo_id}: {e}", exc_info=True)
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Repository).where(Repository.id == repo_id))
            repo = result.scalar_one_or_none()
            if repo:
                repo.status = RepoStatus.ERROR
                await db.commit()

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
    
    files = await git_service.get_file_tree(str(current_user.id), repo.full_name)
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
        content = await git_service.read_file(str(current_user.id), repo.full_name, file_path)
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
        await git_service.write_file(str(current_user.id), repo.full_name, file_path, payload.content)
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
        sha = await git_service.commit_and_push(
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


# ─── Repo Summary ──────────────────────────────────────────────

from app.schemas.repository import RepoSummaryResponse

@router.get("/{repo_id}/summary", response_model=RepoSummaryResponse)
async def get_repo_summary(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.issue import RepoSummary
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = await db.execute(
        select(RepoSummary).where(RepoSummary.repository_id == repo_id)
    )
    summary = result.scalar_one_or_none()
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not available. Repository may still be indexing.")
    return summary


@router.post("/{repo_id}/reindex")
async def reindex_repository(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.git.repo_indexer import index_repository
    from app.models.issue import RepoSummary
    from datetime import datetime, timezone

    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    if repo.status != RepoStatus.READY or not repo.local_path:
        raise HTTPException(status_code=400, detail="Repository is not ready")

    index_data = index_repository(repo.local_path)

    existing = await db.execute(
        select(RepoSummary).where(RepoSummary.repository_id == repo.id)
    )
    summary = existing.scalar_one_or_none()
    if summary:
        summary.summary_text = index_data["summary_text"]
        summary.file_tree_json = index_data["file_tree_json"]
        summary.key_files_json = index_data["key_files_json"]
        summary.languages_json = index_data["languages_json"]
        summary.total_files = index_data["total_files"]
        summary.total_size = index_data["total_size"]
        summary.last_indexed_at = datetime.now(timezone.utc)
        summary.content_hash = index_data["content_hash"]
    else:
        summary = RepoSummary(
            repository_id=repo.id,
            **{k: v for k, v in index_data.items() if k in (
                "summary_text", "file_tree_json", "key_files_json",
                "languages_json", "total_files", "total_size", "content_hash",
            )},
        )
        db.add(summary)

    await db.commit()
    return {"status": "ok", "files_indexed": index_data["total_files"]}


# ─── Issues ────────────────────────────────────────────────────

from app.schemas.repository import RepoIssueResponse, IssueAnalysisConfig

@router.get("/{repo_id}/issues", response_model=list[RepoIssueResponse])
async def list_repo_issues(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.issue import RepoIssue

    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = await db.execute(
        select(RepoIssue)
        .where(RepoIssue.repository_id == repo_id)
        .order_by(RepoIssue.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/{repo_id}/issues/sync")
async def sync_repo_issues(
    repo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sync issues from GitHub for this repository."""
    from app.models.issue import RepoIssue
    from datetime import datetime, timezone

    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    token = _get_github_token(current_user)
    owner, name = repo.full_name.split("/", 1)

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{name}/issues",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github.v3+json",
                },
                params={"state": "all", "per_page": 50},
            )
            resp.raise_for_status()
            issues_data = resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch issues for {repo.full_name}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch issues from GitHub: {e}")

    new_count = 0
    updated_count = 0

    for issue_data in issues_data:
        if "pull_request" in issue_data:
            continue  # Skip pull requests

        gh_id = issue_data["id"]

        result = await db.execute(
            select(RepoIssue).where(
                RepoIssue.repository_id == repo.id,
                RepoIssue.github_issue_id == gh_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.title = issue_data["title"]
            existing.body = issue_data.get("body")
            existing.state = issue_data["state"]
            existing.labels = [l["name"] for l in issue_data.get("labels", [])]
            existing.assignee = issue_data.get("assignee", {}).get("login") if issue_data.get("assignee") else None
            existing.updated_at = datetime.fromisoformat(issue_data["updated_at"].replace("Z", "+00:00"))
            if issue_data["state"] == "closed" and issue_data.get("closed_at"):
                existing.closed_at = datetime.fromisoformat(issue_data["closed_at"].replace("Z", "+00:00"))
            updated_count += 1
        else:
            issue = RepoIssue(
                repository_id=repo.id,
                github_issue_id=gh_id,
                number=issue_data["number"],
                title=issue_data["title"],
                body=issue_data.get("body"),
                state=issue_data["state"],
                labels=[l["name"] for l in issue_data.get("labels", [])],
                assignee=issue_data.get("assignee", {}).get("login") if issue_data.get("assignee") else None,
                html_url=issue_data.get("html_url"),
                created_at=datetime.fromisoformat(issue_data["created_at"].replace("Z", "+00:00")),
                updated_at=datetime.fromisoformat(issue_data["updated_at"].replace("Z", "+00:00")),
                closed_at=datetime.fromisoformat(issue_data["closed_at"].replace("Z", "+00:00")) if issue_data.get("closed_at") else None,
            )
            db.add(issue)
            new_count += 1

    await db.commit()
    return {"status": "ok", "new": new_count, "updated": updated_count, "total": len(issues_data)}


@router.post("/{repo_id}/issues/{issue_id}/analyze")
async def analyze_issue(
    repo_id: UUID,
    issue_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger AI analysis of a specific issue to generate a potential fix."""
    from app.models.issue import RepoIssue, RepoSummary
    from app.services.ai.agent_runner import AgentRunner
    from datetime import datetime, timezone

    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    result = await db.execute(
        select(RepoIssue).where(RepoIssue.id == issue_id, RepoIssue.repository_id == repo_id)
    )
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Determine model to use
    model_key = repo.issue_analysis_model
    if model_key:
        colon_idx = model_key.find(":")
        if colon_idx > 0:
            provider = model_key[:colon_idx]
            model_name = model_key[colon_idx + 1:]
        else:
            provider = "ollama"
            model_name = model_key
    else:
        provider = "ollama"
        model_name = "llama3:8b"

    # Build a temporary chat-like context for the agent
    from app.models.chat import Chat
    temp_chat = Chat(
        id=issue_id,  # reuse issue id as chat id
        user_id=current_user.id,
        agent_id=None,
        title=f"Issue Analysis: {issue.title}",
        model_provider=provider,
        model_name=model_name,
        system_prompt=None,
    )

    runner = AgentRunner(db)

    # Build analysis prompt
    issue_context = f"""Analyze the following GitHub issue and propose a fix.

Repository: {repo.full_name}
Issue #{issue.number}: {issue.title}
State: {issue.state}
Labels: {', '.join(issue.labels) if issue.labels else 'none'}
Assignee: {issue.assignee or 'unassigned'}

Description:
{issue.body or 'No description provided.'}

Please:
1. Analyze the root cause of this issue
2. Propose a concrete fix with code changes
3. Suggest a commit message for the fix
4. List any files that would need to be modified"""

    try:
        response_text = await runner.run(
            chat=temp_chat,
            user_message=issue_context,
            user_id=str(current_user.id),
            repo_full_names=[repo.full_name] if repo.full_name else None,
        )

        issue.fix_generated = True
        issue.fix_summary = response_text
        issue.fix_model_used = model_name
        issue.analyzed_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "issue_id": str(issue.id),
            "fix_generated": True,
            "fix_summary": response_text,
            "model_used": model_name,
        }
    except Exception as e:
        logger.error(f"Issue analysis failed for issue {issue.id}: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.patch("/{repo_id}/settings/issue-analysis")
async def update_issue_analysis_config(
    repo_id: UUID,
    payload: IssueAnalysisConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Configure issue analysis settings for a repository."""
    result = await db.execute(
        select(Repository).where(Repository.id == repo_id, Repository.owner_id == current_user.id)
    )
    repo = result.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if payload.issue_analysis_model is not None:
        repo.issue_analysis_model = payload.issue_analysis_model
    if payload.issue_analysis_enabled is not None:
        repo.issue_analysis_enabled = payload.issue_analysis_enabled

    await db.commit()
    return {
        "repository_id": str(repo.id),
        "issue_analysis_model": repo.issue_analysis_model,
        "issue_analysis_enabled": repo.issue_analysis_enabled,
    }
