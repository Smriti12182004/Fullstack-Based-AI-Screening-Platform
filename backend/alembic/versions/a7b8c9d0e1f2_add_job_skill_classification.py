"""Persist job-specific skill category and mandatory/optional selection."""

from alembic import op
import sqlalchemy as sa


revision = "a7b8c9d0e1f2"
down_revision = "a8d1f4c6e902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "job_skills",
        sa.Column(
            "category",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'technical'"),
        ),
    )
    op.add_column(
        "job_skills",
        sa.Column(
            "is_mandatory",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("job_skills", "is_mandatory")
    op.drop_column("job_skills", "category")