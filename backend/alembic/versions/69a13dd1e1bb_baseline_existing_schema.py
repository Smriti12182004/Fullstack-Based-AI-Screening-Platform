"""baseline existing schema

Revision ID: 69a13dd1e1bb
Revises:
Create Date: 2026-09-23 13:29:57.218995

This revision establishes Alembic's baseline for the existing
database schema. The database already exists, so this migration
intentionally performs no schema changes.
"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "69a13dd1e1bb"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Establish the existing database schema as the baseline."""
    pass


def downgrade() -> None:
    """Do not modify the existing baseline schema."""
    pass