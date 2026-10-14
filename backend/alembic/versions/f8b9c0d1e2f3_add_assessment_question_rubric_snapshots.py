
"""Add section and rubric snapshots to assessment questions.

Revision ID: f8b9c0d1e2f3
Revises: f7a8b9c0d1e2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assessment_questions",
        sa.Column("section_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "assessment_questions",
        sa.Column("section_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "assessment_questions",
        sa.Column("rubric", sa.JSON(), nullable=True),
    )
    op.create_index(
        op.f("ix_assessment_questions_section_id"),
        "assessment_questions",
        ["section_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_assessment_questions_section_id"),
        table_name="assessment_questions",
    )
    op.drop_column("assessment_questions", "rubric")
    op.drop_column("assessment_questions", "section_name")
    op.drop_column("assessment_questions", "section_id")
