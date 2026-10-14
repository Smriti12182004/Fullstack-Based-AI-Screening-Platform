"""Add HR-created candidate profiles and expiring activation links.

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-10-09
"""

from alembic import op
import sqlalchemy as sa


revision = "c4d5e6f7a8b9"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "full_name",
            sa.String(length=100),
            nullable=True,
        ),
    )

    op.add_column(
        "users",
        sa.Column(
            "invitation_token_hash",
            sa.String(length=64),
            nullable=True,
        ),
    )

    op.add_column(
        "users",
        sa.Column(
            "invitation_token_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.add_column(
        "users",
        sa.Column(
            "invitation_token_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_users_invitation_token_hash",
        "users",
        ["invitation_token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_users_invitation_token_hash",
        table_name="users",
    )

    op.drop_column(
        "users",
        "invitation_token_sent_at",
    )

    op.drop_column(
        "users",
        "invitation_token_expires_at",
    )

    op.drop_column(
        "users",
        "invitation_token_hash",
    )

    op.drop_column(
        "users",
        "full_name",
    )