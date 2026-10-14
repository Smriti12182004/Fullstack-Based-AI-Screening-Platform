"""Set question-set assessment variants to exactly two.

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f6a7b8
Create Date: 2026-09-28
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d5e6f7a8b9c0"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing question sets currently use the old three-set design.
    # Convert them to the new product requirement:
    # Set A + Set B = exactly two assessment variants.
    op.execute(
        sa.text(
            """
            UPDATE question_sets
            SET variant_count = 2
            WHERE variant_count = 3
            """
        )
    )

    # Keep the database default aligned with the application model.
    op.alter_column(
        "question_sets",
        "variant_count",
        existing_type=sa.Integer(),
        server_default=sa.text("2"),
        existing_nullable=False,
    )

    # Enforce the product rule at database level as well.
    op.create_check_constraint(
        "ck_question_sets_variant_count_two",
        "question_sets",
        "variant_count = 2",
    )


def downgrade() -> None:
    # Remove the database-level restriction first.
    op.drop_constraint(
        "ck_question_sets_variant_count_two",
        "question_sets",
        type_="check",
    )

    # Restore the previous database default.
    op.alter_column(
        "question_sets",
        "variant_count",
        existing_type=sa.Integer(),
        server_default=sa.text("3"),
        existing_nullable=False,
    )

    # Restore the previous stored value for existing question sets.
    op.execute(
        sa.text(
            """
            UPDATE question_sets
            SET variant_count = 3
            WHERE variant_count = 2
            """
        )
    )