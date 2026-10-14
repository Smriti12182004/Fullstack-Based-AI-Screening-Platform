"""Store original uploaded JD documents on jobs.

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-09-28
"""

from alembic import op
import sqlalchemy as sa


revision = "c3d4e5f6a7b8"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "original_document_data",
            sa.LargeBinary(),
            nullable=True,
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "original_document_filename",
            sa.String(length=255),
            nullable=True,
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "original_document_content_type",
            sa.String(length=100),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "jobs",
        "original_document_content_type",
    )
    op.drop_column(
        "jobs",
        "original_document_filename",
    )
    op.drop_column(
        "jobs",
        "original_document_data",
    )
