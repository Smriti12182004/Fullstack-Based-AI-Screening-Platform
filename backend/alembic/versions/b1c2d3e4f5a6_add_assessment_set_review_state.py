"""add assessment set review state

Revision ID: b1c2d3e4f5a6
Revises: a8b9c0d1e2f3
Create Date: 2026-10-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assessment_sets",
        sa.Column(
            "reviewer_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_sets",
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_sets",
        sa.Column(
            "review_comment",
            sa.Text(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_sets",
        sa.Column(
            "review_checklist",
            sa.JSON(),
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE assessment_sets
        SET review_checklist = '{}'::json
        WHERE review_checklist IS NULL
        """
    )

    op.alter_column(
        "assessment_sets",
        "review_checklist",
        existing_type=sa.JSON(),
        nullable=False,
    )

    op.create_foreign_key(
        "fk_assessment_sets_reviewer_id_users",
        "assessment_sets",
        "users",
        ["reviewer_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_assessment_sets_reviewer_id",
        "assessment_sets",
        ["reviewer_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assessment_sets_reviewer_id",
        table_name="assessment_sets",
    )

    op.drop_constraint(
        "fk_assessment_sets_reviewer_id_users",
        "assessment_sets",
        type_="foreignkey",
    )

    op.drop_column(
        "assessment_sets",
        "review_checklist",
    )

    op.drop_column(
        "assessment_sets",
        "review_comment",
    )

    op.drop_column(
        "assessment_sets",
        "reviewed_at",
    )

    op.drop_column(
        "assessment_sets",
        "reviewer_id",
    )