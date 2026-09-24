"""change experience_required to string

Revision ID: b3d48e2a4a95
Revises: 194a2509d0f3
Create Date: 2026-09-24 16:15:04.032832

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3d48e2a4a95"
down_revision: Union[str, Sequence[str], None] = "194a2509d0f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "jobs",
        "experience_required",
        existing_type=sa.INTEGER(),
        type_=sa.String(length=100),
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    raise RuntimeError(
        "Downgrade from VARCHAR to INTEGER for jobs.experience_required "
        "is not supported because experience values may contain ranges or text."
    )