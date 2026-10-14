"""add assessment review state

Revision ID: d4e5f7a9c2b1
Revises: c2d4e6f8a1b3
Create Date: 2026-09-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f7a9c2b1"
down_revision: Union[str, Sequence[str], None] = "c2d4e6f8a1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "assessments",
        sa.Column(
            "review_status",
            sa.String(length=30),
            nullable=True,
        ),
    )

    op.add_column(
        "assessments",
        sa.Column(
            "reviewer_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessments",
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "assessments",
        sa.Column(
            "review_comment",
            sa.Text(),
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE assessments
        SET review_status = 'pending'
        WHERE review_status IS NULL
        """
    )

    op.alter_column(
        "assessments",
        "review_status",
        existing_type=sa.String(length=30),
        nullable=False,
    )

    op.create_foreign_key(
        "fk_assessments_reviewer_id_users",
        "assessments",
        "users",
        ["reviewer_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_assessments_reviewer_id",
        "assessments",
        ["reviewer_id"],
        unique=False,
    )

    op.create_check_constraint(
        "ck_assessments_review_status",
        "assessments",
        "review_status IN ('pending', 'approved', 'rejected')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_assessments_review_status",
        "assessments",
        type_="check",
    )

    op.drop_index(
        "ix_assessments_reviewer_id",
        table_name="assessments",
    )

    op.drop_constraint(
        "fk_assessments_reviewer_id_users",
        "assessments",
        type_="foreignkey",
    )

    op.drop_column(
        "assessments",
        "review_comment",
    )

    op.drop_column(
        "assessments",
        "reviewed_at",
    )

    op.drop_column(
        "assessments",
        "reviewer_id",
    )

    op.drop_column(
        "assessments",
        "review_status",
    )