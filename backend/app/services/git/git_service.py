import os
import logging
import asyncio
from pathlib import Path
from typing import Optional
from git import Repo, GitCommandError
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class GitService:
    def __init__(self, repos_base_path: Optional[str] = None):
        self.base_path = Path(repos_base_path or settings.repos_storage_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _get_repo_path(self, user_id: str, repo_full_name: str) -> Path:
        safe_name = repo_full_name.replace("/", "_")
        return self.base_path / str(user_id) / safe_name

    def _get_auth_url(self, github_token: str, repo_full_name: str) -> str:
        return f"https://{github_token}@github.com/{repo_full_name}.git"

    async def clone_repository(
        self,
        github_token: str,
        repo_full_name: str,
        user_id: str,
        branch: Optional[str] = None,
    ) -> Path:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        
        if repo_path.exists():
            logger.info(f"Repository {repo_full_name} already exists, pulling latest changes.")
            return await self.pull_repository(github_token, repo_full_name, user_id, branch)
        
        auth_url = self._get_auth_url(github_token, repo_full_name)
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: Repo.clone_from(
                auth_url,
                str(repo_path),
                branch=branch,
                depth=None,
            ),
        )
        logger.info(f"Cloned {repo_full_name} to {repo_path}")
        return repo_path

    async def pull_repository(
        self,
        github_token: str,
        repo_full_name: str,
        user_id: str,
        branch: Optional[str] = None,
    ) -> Path:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        auth_url = self._get_auth_url(github_token, repo_full_name)
        
        loop = asyncio.get_event_loop()
        def _pull():
            repo = Repo(str(repo_path))
            with repo.remotes.origin.config_writer as cw:
                cw.set("url", auth_url)
            repo.remotes.origin.pull(branch or repo.active_branch.name)
            return repo_path
        
        await loop.run_in_executor(None, _pull)
        return repo_path

    def get_file_tree(self, user_id: str, repo_full_name: str) -> list[dict]:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        if not repo_path.exists():
            return []
        
        result = []
        for item in sorted(repo_path.rglob("*")):
            if ".git" in item.parts:
                continue
            rel = item.relative_to(repo_path)
            result.append({
                "path": str(rel),
                "type": "directory" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else None,
            })
        return result

    def read_file(self, user_id: str, repo_full_name: str, file_path: str) -> str:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        # Security: prevent path traversal
        full_path = (repo_path / file_path).resolve()
        if not str(full_path).startswith(str(repo_path.resolve())):
            raise PermissionError("Path traversal attempt detected")
        return full_path.read_text(encoding="utf-8", errors="replace")

    def write_file(self, user_id: str, repo_full_name: str, file_path: str, content: str) -> None:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        full_path = (repo_path / file_path).resolve()
        if not str(full_path).startswith(str(repo_path.resolve())):
            raise PermissionError("Path traversal attempt detected")
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")

    def commit_and_push(
        self,
        github_token: str,
        repo_full_name: str,
        user_id: str,
        commit_message: str,
        author_name: str,
        author_email: str,
    ) -> str:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        auth_url = self._get_auth_url(github_token, repo_full_name)
        
        repo = Repo(str(repo_path))
        repo.config_writer().set_value("user", "name", author_name).release()
        repo.config_writer().set_value("user", "email", author_email or "noreply@example.com").release()
        
        repo.git.add(A=True)
        if not repo.index.diff("HEAD"):
            logger.info("No changes to commit.")
            return "No changes to commit."
        
        commit = repo.index.commit(commit_message)
        with repo.remotes.origin.config_writer as cw:
            cw.set("url", auth_url)
        repo.remotes.origin.push()
        logger.info(f"Pushed commit {commit.hexsha} to {repo_full_name}")
        return commit.hexsha

    def get_diff(self, user_id: str, repo_full_name: str) -> str:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        repo = Repo(str(repo_path))
        return repo.git.diff()

    def get_log(self, user_id: str, repo_full_name: str, max_count: int = 20) -> list[dict]:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        repo = Repo(str(repo_path))
        commits = []
        for commit in repo.iter_commits(max_count=max_count):
            commits.append({
                "sha": commit.hexsha[:8],
                "message": commit.message.strip(),
                "author": commit.author.name,
                "date": commit.authored_datetime.isoformat(),
            })
        return commits

    def list_branches(self, user_id: str, repo_full_name: str) -> list[str]:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        repo = Repo(str(repo_path))
        return [b.name for b in repo.branches]

    def checkout_branch(self, user_id: str, repo_full_name: str, branch: str, create: bool = False) -> None:
        repo_path = self._get_repo_path(user_id, repo_full_name)
        repo = Repo(str(repo_path))
        if create:
            repo.git.checkout("-b", branch)
        else:
            repo.git.checkout(branch)
