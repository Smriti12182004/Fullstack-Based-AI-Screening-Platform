"""Add semantic section type to questions and question versions.

Revision ID: e7f8a9b0c1d2
Revises: e6f7a8b9c0d1
Create Date: 2026-09-28
"""

from alembic import op
import sqlalchemy as sa


revision = "e8f9a0b1c2d3"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


SECTION_TYPES = (
    "conceptual",
    "implementation",
    "free_text",
)


def _add_section_type_column(table_name: str) -> None:
    op.add_column(
        table_name,
        sa.Column(
            "section_type",
            sa.String(length=30),
            nullable=True,
            server_default="conceptual",
        ),
    )

    op.execute(
        sa.text(
            f"UPDATE {table_name} "
            "SET section_type = 'conceptual' "
            "WHERE section_type IS NULL"
        )
    )

    op.alter_column(
        table_name,
        "section_type",
        existing_type=sa.String(length=30),
        nullable=False,
        server_default="conceptual",
    )

    op.create_index(
        f"ix_{table_name}_section_type",
        table_name,
        ["section_type"],
        unique=False,
    )

    op.create_check_constraint(
        f"ck_{table_name}_section_type",
        table_name,
        "section_type IN ('conceptual', 'implementation', 'free_text')",
    )


def upgrade() -> None:
    """Add section type while preserving all existing questions/history."""

    _add_section_type_column("questions")
    _add_section_type_column("question_versions")


def downgrade() -> None:
    """Remove the semantic section type fields."""

    for table_name in ("question_versions", "questions"):
        op.drop_constraint(
            f"ck_{table_name}_section_type",
            table_name,
            type_="check",
        )
        op.drop_index(
            f"ix_{table_name}_section_type",
            table_name=table_name,
        )
        op.drop_column(
            table_name,
            "section_type",
        )
