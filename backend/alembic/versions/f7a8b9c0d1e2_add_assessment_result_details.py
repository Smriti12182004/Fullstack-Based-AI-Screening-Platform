
"""Add persisted assessment grading details.

Revision ID: f7a8b9c0d1e2
Revises: f9a0b1c2d3e4
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Preserve existing scores while introducing the grading lifecycle.
    op.add_column(
        "results",
        sa.Column("status", sa.String(length=30), nullable=True),
    )

    op.execute(
        sa.text(
            """
            UPDATE results
            SET status = CASE
                WHEN score IS NOT NULL THEN 'completed'
                ELSE 'pending'
            END
            """
        )
    )

    op.alter_column(
        "results",
        "status",
        existing_type=sa.String(length=30),
        nullable=False,
        server_default="pending",
    )

    # Grading may be pending or require manual review, so score must be nullable.
    op.alter_column(
        "results",
        "score",
        existing_type=sa.Numeric(precision=5, scale=2),
        nullable=True,
    )

    op.add_column(
        "results",
        sa.Column("earned_points", sa.Numeric(7, 2), nullable=True),
    )
    op.add_column(
        "results",
        sa.Column("max_points", sa.Numeric(7, 2), nullable=True),
    )
    op.add_column(
        "results",
        sa.Column("section_scores", sa.JSON(), nullable=True),
    )
    op.add_column(
        "results",
        sa.Column("question_scores", sa.JSON(), nullable=True),
    )
    op.add_column(
        "results",
        sa.Column("feedback", sa.Text(), nullable=True),
    )
    op.add_column(
        "results",
        sa.Column("grading_job_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "results",
        sa.Column("graded_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        op.f("ix_results_status"),
        "results",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    # Do not silently convert ungraded attempts into fabricated zero scores.
    connection = op.get_bind()
    null_scores = connection.scalar(
        sa.text("SELECT COUNT(*) FROM results WHERE score IS NULL")
    )

    if null_scores:
        raise RuntimeError(
            "Cannot downgrade assessment results while null scores exist. "
            "Resolve pending or review-required results first."
        )

    op.drop_index(op.f("ix_results_status"), table_name="results")

    op.drop_column("results", "graded_at")
    op.drop_column("results", "grading_job_id")
    op.drop_column("results", "feedback")
    op.drop_column("results", "question_scores")
    op.drop_column("results", "section_scores")
    op.drop_column("results", "max_points")
    op.drop_column("results", "earned_points")
    op.drop_column("results", "status")

    op.alter_column(
        "results",
        "score",
        existing_type=sa.Numeric(precision=5, scale=2),
        nullable=False,
    )
