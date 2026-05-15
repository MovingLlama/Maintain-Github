from pydantic_settings import BaseSettings
from pydantic import PostgresDsn, computed_field
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    # App
    app_secret_key: str = "change-me"
    debug: bool = False
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "console"  # "console" or "json"
    
    # Domain
    domain: str = "localhost"
    allowed_origins: str = "http://localhost:5173"
    
    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/auth/github/callback"
    
    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "maintain_github"
    postgres_user: str = "maintain"
    postgres_password: str = ""
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # JWT
    jwt_secret_key: str = "change-me-jwt"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 30
    
    # OpenRouter
    openrouter_api_key: Optional[str] = None
    
    # Ollama
    ollama_base_url: str = "http://ollama:11434"
    
    # Storage
    repos_storage_path: str = "/app/repos"
    max_repo_size_mb: int = 500
    
    # Rate limiting
    rate_limit_per_minute: int = 60

    # Metrics
    metrics_enabled: bool = True

    @computed_field
    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field
    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field
    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

@lru_cache()
def get_settings() -> Settings:
    return Settings()
