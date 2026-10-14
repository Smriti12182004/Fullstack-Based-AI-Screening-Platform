"""add assessment review checklist

Revision ID: e7f8a9b0c1d2
Revises: d4e5f7a9c2b1
Create Date: 2026-09-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d2"

down_revision: Union[
    str,
    Sequence[str],
    None,
] = "d4e5f7a9c2b1"

branch_labels: Union[
    str,
    Sequence[str],
    None,
] = None

depends_on: Union[
    str,
    Sequence[str],
    None,
] = None


def upgrade() -> None:
    op.add_column(
        "assessments",
        sa.Column(
            "review_checklist",
            sa.JSON(),
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE assessments
        SET review_checklist = '{}'::json
        WHERE review_checklist IS NULL
        """
    )

    op.alter_column(
        "assessments",
        "review_checklist",
        existing_type=sa.JSON(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column(
        "assessments",
        "review_checklist",
    )