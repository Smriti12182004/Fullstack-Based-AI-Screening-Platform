"""add experience_required to jobs

Revision ID: 3ac4d9c80005
Revises: 69a13dd1e1bb
Create Date: 2026-09-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3ac4d9c80005"
down_revision: Union[str, Sequence[str], None] = "69a13dd1e1bb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "experience_required",
            sa.String(length=100),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "experience_required")