import httpx
import secrets
import logging
from typing import Optional
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_BASE = "https://api.github.com"

def generate_oauth_state() -> str:
    return secrets.token_urlsafe(32)

def get_github_auth_url(state: str) -> str:
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "scope": "read:user user:email repo",
        "state": state,
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{GITHUB_OAUTH_URL}?{query}"

async def exchange_code_for_token(code: str) -> Optional[str]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        response = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
            },
            headers={"Accept": "application/json"},
        )
        data = response.json()
        return data.get("access_token")

async def get_github_user(token: str) -> dict:
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        response = await client.get(
            f"{GITHUB_API_BASE}/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.v3+json"},
        )
        response.raise_for_status()
        return response.json()

async def get_user_repos(token: str, page: int = 1, per_page: int = 30) -> list[dict]:
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        response = await client.get(
            f"{GITHUB_API_BASE}/user/repos",
            params={"page": page, "per_page": per_page, "sort": "updated", "affiliation": "owner"},
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.v3+json"},
        )
        response.raise_for_status()
        return response.json()
