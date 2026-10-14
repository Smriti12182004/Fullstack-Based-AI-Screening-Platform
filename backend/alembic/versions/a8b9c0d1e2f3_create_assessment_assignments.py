"""create assessment assignments

Revision ID: a8b9c0d1e2f3
Revises: f3a7b9c1d2e4
Create Date: 2026-10-07
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8b9c0d1e2f3"

down_revision: Union[
    str,
    Sequence[str],
    None,
] = "f3a7b9c1d2e4"

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
    op.create_table(
        "assessment_assignments",
        sa.Column(
            "id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "assessment_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "assigned_by",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=30),
            nullable=False,
        ),
        sa.Column(
            "opens_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "closes_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["assessment_id"],
            ["assessments.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["candidate_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_by"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "assessment_id",
            "candidate_id",
            name="uq_assessment_assignment_candidate",
        ),
    )

    op.create_index(
        op.f("ix_assessment_assignments_id"),
        "assessment_assignments",
        ["id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_assessment_assignments_assessment_id"),
        "assessment_assignments",
        ["assessment_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_assessment_assignments_candidate_id"),
        "assessment_assignments",
        ["candidate_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_assessment_assignments_assigned_by"),
        "assessment_assignments",
        ["assigned_by"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_assessment_assignments_assigned_by"),
        table_name="assessment_assignments",
    )

    op.drop_index(
        op.f("ix_assessment_assignments_candidate_id"),
        table_name="assessment_assignments",
    )

    op.drop_index(
        op.f("ix_assessment_assignments_assessment_id"),
        table_name="assessment_assignments",
    )

    op.drop_index(
        op.f("ix_assessment_assignments_id"),
        table_name="assessment_assignments",
    )

    op.drop_table("assessment_assignments")