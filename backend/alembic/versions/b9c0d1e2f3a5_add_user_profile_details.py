
"""Add persistent optional details to user profiles."""

from alembic import op
import sqlalchemy as sa


revision = "b9c0d1e2f3a5"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("phone_number", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("job_title", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("department", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("location", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("bio", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "bio")
    op.drop_column("users", "location")
    op.drop_column("users", "department")
    op.drop_column("users", "job_title")
    op.drop_column("users", "phone_number")
