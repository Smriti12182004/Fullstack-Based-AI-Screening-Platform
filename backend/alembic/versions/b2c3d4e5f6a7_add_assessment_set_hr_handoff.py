"""Add AssessmentSet HR handoff metadata.

Revision ID: b2c3d4e5f6a7
Revises: b1c2d3e4f5a6
Create Date: 2026-10-08 15:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b2c3d4e5f6a7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assessment_sets",
        sa.Column(
            "sent_to_hr_by",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_sets",
        sa.Column(
            "sent_to_hr_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_assessment_sets_sent_to_hr_by",
        "assessment_sets",
        ["sent_to_hr_by"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_assessment_sets_sent_to_hr_by_users",
        "assessment_sets",
        "users",
        ["sent_to_hr_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_assessment_sets_sent_to_hr_by_users",
        "assessment_sets",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_assessment_sets_sent_to_hr_by",
        table_name="assessment_sets",
    )

    op.drop_column(
        "assessment_sets",
        "sent_to_hr_at",
    )

    op.drop_column(
        "assessment_sets",
        "sent_to_hr_by",
    )