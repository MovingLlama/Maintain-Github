"""Initial migration: base tables before global agents redesign.

Revision ID: 0001_initial
Revises: None
Create Date: 2025-01-01

Creates the core tables that existed before the global agents redesign:
- users, sessions, app_settings
- repositories (without issue_analysis columns — added in 0002)
- chats (with repository_id + is_agent_mode — removed in 0002)
- messages (with Enum MessageRole — altered to String in 0002)
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    """Check if a table exists in the current database."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :name)"
        ),
        {"name": table_name},
    )
    return result.scalar()


def upgrade() -> None:
    # ─── users ───────────────────────────────────────────────
    if not _table_exists("users"):
        op.create_table(
            "users",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("github_id", sa.Integer(), unique=True, nullable=False),
            sa.Column("github_login", sa.String(255), nullable=False),
            sa.Column("github_name", sa.String(255), nullable=True),
            sa.Column("github_email", sa.String(255), nullable=True),
            sa.Column("github_avatar_url", sa.Text(), nullable=True),
            sa.Column("github_access_token_encrypted", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
            sa.Column("is_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("settings", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_users_github_id", "users", ["github_id"])
        op.create_index("ix_users_github_login", "users", ["github_login"])

    # ─── app_settings ────────────────────────────────────────
    if not _table_exists("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("key", sa.String(255), unique=True, nullable=False),
            sa.Column("value", postgresql.JSONB(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_secret", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_app_settings_key", "app_settings", ["key"])

    # ─── repositories (pre-0002: without issue_analysis columns) ─
    if not _table_exists("repositories"):
        op.create_table(
            "repositories",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("owner_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("github_repo_id", sa.Integer(), nullable=False),
            sa.Column("full_name", sa.String(500), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("default_branch", sa.String(255), server_default="main", nullable=False),
            sa.Column("current_branch", sa.String(255), server_default="main", nullable=False),
            sa.Column("local_path", sa.Text(), nullable=True),
            sa.Column("status", sa.String(50), server_default="pending", nullable=False),
            sa.Column("is_private", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("github_metadata", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_repositories_owner_id", "repositories", ["owner_id"])
        op.create_index("ix_repositories_status", "repositories", ["status"])

    # ─── chats (pre-0002: with repository_id + is_agent_mode, without agent_id) ─
    if not _table_exists("chats"):
        op.create_table(
            "chats",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("repository_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True),
            sa.Column("title", sa.String(500), server_default="New Chat", nullable=False),
            sa.Column("model_provider", sa.String(50), server_default="ollama", nullable=False),
            sa.Column("model_name", sa.String(255), nullable=True),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("is_agent_mode", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_chats_user_id", "chats", ["user_id"])
        op.create_index("ix_chats_repository_id", "chats", ["repository_id"])

    # ─── messages (pre-0002: with Enum MessageRole) ──────────
    # Create enum type idempotently (may already exist from old create_all)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE messagerole AS ENUM ('user', 'assistant', 'system', 'tool');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    if not _table_exists("messages"):
        op.create_table(
            "messages",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("chat_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("chats.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.Enum("user", "assistant", "system", "tool", name="messagerole", create_type=False), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("tool_calls", postgresql.JSONB(), nullable=True),
            sa.Column("tool_result", postgresql.JSONB(), nullable=True),
            sa.Column("model_used", sa.String(255), nullable=True),
            sa.Column("token_count", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_messages_chat_id", "messages", ["chat_id"])

    # ─── sessions ────────────────────────────────────────────
    if not _table_exists("sessions"):
        op.create_table(
            "sessions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("refresh_token_hash", sa.String(255), unique=True, nullable=False),
            sa.Column("user_agent", sa.Text(), nullable=True),
            sa.Column("ip_address", sa.String(45), nullable=True),
            sa.Column("is_revoked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
        op.create_index("ix_sessions_refresh_token_hash", "sessions", ["refresh_token_hash"])


def downgrade() -> None:
    op.drop_index("ix_sessions_refresh_token_hash", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_messages_chat_id", table_name="messages")
    op.drop_table("messages")
    op.execute("DROP TYPE IF EXISTS messagerole")
    op.drop_index("ix_chats_repository_id", table_name="chats")
    op.drop_index("ix_chats_user_id", table_name="chats")
    op.drop_table("chats")
    op.drop_index("ix_repositories_status", table_name="repositories")
    op.drop_index("ix_repositories_owner_id", table_name="repositories")
    op.drop_table("repositories")
    op.drop_index("ix_app_settings_key", table_name="app_settings")
    op.drop_table("app_settings")
    op.drop_index("ix_users_github_login", table_name="users")
    op.drop_index("ix_users_github_id", table_name="users")
    op.drop_table("users")
