"""add attempt timing

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-09-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"

down_revision: Union[
    str,
    Sequence[str],
    None,
] = "e7f8a9b0c1d2"

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
    op.alter_column(
        "attempts",
        "started_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )

    op.add_column(
        "attempts",
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "attempts",
        "expires_at",
    )

    op.alter_column(
        "attempts",
        "started_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )