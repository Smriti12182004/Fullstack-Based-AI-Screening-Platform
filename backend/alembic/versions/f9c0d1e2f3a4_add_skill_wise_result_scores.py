
"""Persist skill-wise assessment result breakdowns."""

from alembic import op
import sqlalchemy as sa


revision = "f9c0d1e2f3a4"
down_revision = "f8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "results",
        sa.Column("skill_scores", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("results", "skill_scores")
