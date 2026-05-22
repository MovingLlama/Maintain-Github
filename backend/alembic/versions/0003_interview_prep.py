"""Add interview prep questions table.

Revision ID: 0003_interview_prep
Revises: 0002_global_agents
Create Date: 2026-05-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003_interview_prep"
down_revision: Union[str, None] = "0002_global_agents"
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
    # Create interview_prep_questions table if it doesn't exist
    if not _table_exists("interview_prep_questions"):
        op.create_table(
            "interview_prep_questions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("repository_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True),
                      sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("question", sa.Text(), nullable=False),
            sa.Column("answer", sa.Text(), nullable=False),
            sa.Column("category", sa.String(100), nullable=False),
            sa.Column("difficulty", sa.String(50), nullable=False),
            sa.Column("user_answer", sa.Text(), nullable=True),
            sa.Column("feedback", sa.Text(), nullable=True),
            sa.Column("is_completed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("idx_interview_prep_repo_id", "interview_prep_questions", ["repository_id"])
        op.create_index("idx_interview_prep_user_id", "interview_prep_questions", ["user_id"])
        op.create_index("idx_interview_prep_category", "interview_prep_questions", ["category"])
        op.create_index("idx_interview_prep_difficulty", "interview_prep_questions", ["difficulty"])


def downgrade() -> None:
    if _table_exists("interview_prep_questions"):
        op.drop_index("idx_interview_prep_difficulty", table_name="interview_prep_questions")
        op.drop_index("idx_interview_prep_category", table_name="interview_prep_questions")
        op.drop_index("idx_interview_prep_user_id", table_name="interview_prep_questions")
        op.drop_index("idx_interview_prep_repo_id", table_name="interview_prep_questions")
        op.drop_table("interview_prep_questions")
