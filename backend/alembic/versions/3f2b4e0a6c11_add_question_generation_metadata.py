"""add question generation metadata

Revision ID: 3f2b4e0a6c11
Revises: 3ac4d9c80005
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3f2b4e0a6c11"
down_revision: Union[str, Sequence[str], None] = "3ac4d9c80005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "questions",
        sa.Column(
            "status",
            sa.String(length=30),
            nullable=False,
            server_default="approved",
        ),
    )

    op.add_column(
        "questions",
        sa.Column(
            "source",
            sa.String(length=30),
            nullable=False,
            server_default="manual",
        ),
    )

    op.add_column(
        "questions",
        sa.Column(
            "explanation",
            sa.Text(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("questions", "explanation")
    op.drop_column("questions", "source")
    op.drop_column("questions", "status")
