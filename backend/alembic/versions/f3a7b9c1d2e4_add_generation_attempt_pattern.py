"""Add authoritative generation pattern to question generation attempts.

Revision ID: f3a7b9c1d2e4
Revises: d7e8f9a0b1c2
"""

from alembic import op
import sqlalchemy as sa


revision = "f3a7b9c1d2e4"
down_revision = "d7e8f9a0b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "question_generation_attempts",
        sa.Column(
            "pattern",
            sa.String(length=50),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_question_generation_attempts_pattern",
        "question_generation_attempts",
        ["pattern"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_question_generation_attempts_pattern",
        table_name="question_generation_attempts",
    )

    op.drop_column(
        "question_generation_attempts",
        "pattern",
    )