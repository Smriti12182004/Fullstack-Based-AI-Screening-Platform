"""Track the recruiter who created an HR candidate invitation.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-10-09
"""

from alembic import op
import sqlalchemy as sa


revision = "d6e7f8a9b0c1"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "invitation_created_by",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_users_invitation_created_by_users",
        "users",
        "users",
        ["invitation_created_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_users_invitation_created_by",
        "users",
        ["invitation_created_by"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_users_invitation_created_by",
        table_name="users",
    )

    op.drop_constraint(
        "fk_users_invitation_created_by_users",
        "users",
        type_="foreignkey",
    )

    op.drop_column(
        "users",
        "invitation_created_by",
    )
