"""Global agents redesign: new models and schema changes.

Revision ID: 0002_global_agents
Revises: None
Create Date: 2026-05-17

Changes:
- Add agents table (global, user_id=NULL = system default)
- Add repo_summaries table (cached repo indexing)
- Add repo_issues table (GitHub issue tracking)
- Add chat_repositories join table (M:N chat↔repo)
- Modify chats: drop repository_id + is_agent_mode, add agent_id FK
- Modify repositories: add issue_analysis_model + issue_analysis_enabled
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002_global_agents"
down_revision: Union[str, None] = "0001_initial"
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


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table "
            "AND column_name = :column)"
        ),
        {"table": table_name, "column": column_name},
    )
    return result.scalar()


def _index_exists(index_name: str) -> bool:
    """Check if an index exists."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM pg_indexes "
            "WHERE schemaname = 'public' AND indexname = :name)"
        ),
        {"name": index_name},
    )
    return result.scalar()


def _constraint_exists(table_name: str, constraint_name: str) -> bool:
    """Check if a constraint exists on a table."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.table_constraints "
            "WHERE table_schema = 'public' AND table_name = :table "
            "AND constraint_name = :name)"
        ),
        {"table": table_name, "name": constraint_name},
    )
    return result.scalar()


def upgrade() -> None:
    # ─── New tables ──────────────────────────────────────────

    if not _table_exists("agents"):
        op.create_table(
            "agents",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("system_prompt", sa.Text(), nullable=True),
            sa.Column("model_provider", sa.String(50), nullable=True),
            sa.Column("model_name", sa.String(255), nullable=True),
            sa.Column("tools_config", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_agents_user_id", "agents", ["user_id"])

    if not _table_exists("repo_summaries"):
        op.create_table(
            "repo_summaries",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("repository_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("summary_text", sa.Text(), nullable=True),
            sa.Column("file_tree_json", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("key_files_json", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("languages_json", postgresql.JSONB(), server_default="{}", nullable=False),
            sa.Column("total_files", sa.Integer(), server_default="0", nullable=False),
            sa.Column("total_size", sa.BigInteger(), server_default="0", nullable=False),
            sa.Column("last_indexed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("content_hash", sa.String(64), nullable=True),
        )
        op.create_index("idx_repo_summaries_repo_id", "repo_summaries", ["repository_id"])

    if not _table_exists("repo_issues"):
        op.create_table(
            "repo_issues",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("repository_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
            sa.Column("github_issue_id", sa.BigInteger(), nullable=False),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(500), nullable=False),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("state", sa.String(20), server_default="open", nullable=False),
            sa.Column("labels", postgresql.JSONB(), server_default="[]", nullable=False),
            sa.Column("assignee", sa.String(255), nullable=True),
            sa.Column("html_url", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("fix_generated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("fix_summary", sa.Text(), nullable=True),
            sa.Column("fix_branch", sa.String(500), nullable=True),
            sa.Column("fix_model_used", sa.String(255), nullable=True),
            sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("idx_repo_issues_repo_id", "repo_issues", ["repository_id"])
        op.create_index("idx_repo_issues_state", "repo_issues", ["state"])

    if not _table_exists("chat_repositories"):
        op.create_table(
            "chat_repositories",
            sa.Column("chat_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("chats.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("repository_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True),
        )

    # ─── Schema changes on existing tables ───────────────────

    # Chats: drop repository_id + is_agent_mode, add agent_id
    if _constraint_exists("chats", "chats_repository_id_fkey"):
        op.drop_constraint("chats_repository_id_fkey", "chats", type_="foreignkey")
    if _index_exists("ix_chats_repository_id"):
        op.drop_index("ix_chats_repository_id", table_name="chats")
    if _column_exists("chats", "repository_id"):
        op.drop_column("chats", "repository_id")
    if _column_exists("chats", "is_agent_mode"):
        op.drop_column("chats", "is_agent_mode")
    if not _column_exists("chats", "agent_id"):
        op.add_column("chats", sa.Column("agent_id", postgresql.UUID(as_uuid=True),
                                         sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True))
    if not _index_exists("ix_chats_agent_id"):
        op.create_index("ix_chats_agent_id", "chats", ["agent_id"])

    # Repositories: add issue analysis config columns
    if not _column_exists("repositories", "issue_analysis_model"):
        op.add_column("repositories", sa.Column("issue_analysis_model", sa.String(255), nullable=True))
    if not _column_exists("repositories", "issue_analysis_enabled"):
        op.add_column("repositories", sa.Column("issue_analysis_enabled", sa.Boolean(),
                                                 server_default=sa.text("false"), nullable=False))

    # Messages: change role from Enum to String for flexibility
    # Only alter if the column is still using the enum type
    conn = op.get_bind()
    col_type = conn.execute(
        sa.text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'messages' "
            "AND column_name = 'role'"
        )
    ).scalar()
    if col_type and col_type.upper() == "USER-DEFINED":
        op.alter_column("messages", "role", type_=sa.String(50), existing_type=sa.Enum(
            "USER", "ASSISTANT", "SYSTEM", "TOOL", name="messagerole"), postgresql_using="role::text")


def downgrade() -> None:
    # ─── Revert messages role ────────────────────────────────
    op.alter_column("messages", "role", type_=sa.Enum(
        "USER", "ASSISTANT", "SYSTEM", "TOOL", name="messagerole"), existing_type=sa.String(50),
        postgresql_using="role::messagerole")

    # ─── Revert repositories ─────────────────────────────────
    op.drop_column("repositories", "issue_analysis_enabled")
    op.drop_column("repositories", "issue_analysis_model")

    # ─── Revert chats ────────────────────────────────────────
    op.drop_index("ix_chats_agent_id", table_name="chats")
    op.drop_column("chats", "agent_id")
    op.add_column("chats", sa.Column("is_agent_mode", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("chats", sa.Column("repository_id", postgresql.UUID(as_uuid=True),
                                     sa.ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_chats_repository_id", "chats", ["repository_id"])

    # ─── Drop new tables ─────────────────────────────────────
    op.drop_table("chat_repositories")
    op.drop_index("idx_repo_issues_state", table_name="repo_issues")
    op.drop_index("idx_repo_issues_repo_id", table_name="repo_issues")
    op.drop_table("repo_issues")
    op.drop_index("idx_repo_summaries_repo_id", table_name="repo_summaries")
    op.drop_table("repo_summaries")
    op.drop_index("idx_agents_user_id", table_name="agents")
    op.drop_table("agents")
