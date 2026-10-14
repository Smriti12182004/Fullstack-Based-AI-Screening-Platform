"""Create candidate-specific assessment invitation tokens.

Revision ID: f9a0b1c2d3e4
Revises: d6e7f8a9b0c1
Create Date: 2026-10-09
"""

from alembic import op
import sqlalchemy as sa


revision = "f9a0b1c2d3e4"
down_revision = "d6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assessment_invitations",
        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
        ),
        sa.Column(
            "assignment_id",
            sa.Integer(),
            sa.ForeignKey(
                "assessment_assignments.id",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column(
            "token_hash",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "assignment_id",
            name="uq_assessment_invitations_assignment_id",
        ),
        sa.UniqueConstraint(
            "token_hash",
            name="uq_assessment_invitations_token_hash",
        ),
    )


def downgrade() -> None:
    op.drop_table("assessment_invitations")