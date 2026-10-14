"""merge assessment authoring migration heads

Revision ID: 5a660b2d049b
Revises: c8d9e0f1a2b3, e8f9a0b1c2d3
Create Date: 2026-09-29 12:39:52.454536

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5a660b2d049b'
down_revision: Union[str, Sequence[str], None] = ('c8d9e0f1a2b3', 'e8f9a0b1c2d3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
