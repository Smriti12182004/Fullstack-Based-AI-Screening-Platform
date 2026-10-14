"""add hiring cycle metadata and assessment variants

Revision ID: c2d4e6f8a1b3
Revises: b81f6c2d4e90
Create Date: 2026-09-27
"""

from alembic import op
import sqlalchemy as sa


revision = "c2d4e6f8a1b3"
down_revision = "b81f6c2d4e90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------------------------------------------------------
    # QuestionSet hiring metadata
    # ---------------------------------------------------------

    op.add_column(
        "question_sets",
        sa.Column(
            "hiring_year",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "question_sets",
        sa.Column(
            "hiring_cycle",
            sa.String(length=100),
            nullable=True,
        ),
    )

    op.add_column(
        "question_sets",
        sa.Column(
            "variant_count",
            sa.Integer(),
            nullable=False,
            server_default="3",
        ),
    )

    # Preserve historical context for existing question sets.
    op.execute(
        """
        UPDATE question_sets
        SET hiring_year = EXTRACT(YEAR FROM created_at)::integer
        WHERE hiring_year IS NULL
        """
    )

    # ---------------------------------------------------------
    # Assessment -> QuestionSet lineage
    # ---------------------------------------------------------

    op.add_column(
        "assessments",
        sa.Column(
            "question_set_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessments",
        sa.Column(
            "variant_number",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_question_sets_hiring_year",
        "question_sets",
        ["hiring_year"],
    )

    op.create_index(
        "ix_assessments_question_set_id",
        "assessments",
        ["question_set_id"],
    )

    op.create_foreign_key(
        "fk_assessments_question_set_id",
        "assessments",
        "question_sets",
        ["question_set_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_unique_constraint(
        "uq_assessment_question_set_variant",
        "assessments",
        ["question_set_id", "variant_number"],
    )

    # ---------------------------------------------------------
    # Validation constraints
    # ---------------------------------------------------------

    op.create_check_constraint(
        "ck_question_sets_hiring_year",
        "question_sets",
        "hiring_year IS NULL OR hiring_year >= 2000",
    )

    op.create_check_constraint(
        "ck_question_sets_variant_count",
        "question_sets",
        "variant_count BETWEEN 1 AND 10",
    )

    op.create_check_constraint(
        "ck_assessments_variant_number",
        "assessments",
        "variant_number IS NULL OR variant_number BETWEEN 1 AND 10",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_assessments_variant_number",
        "assessments",
        type_="check",
    )

    op.drop_constraint(
        "ck_question_sets_variant_count",
        "question_sets",
        type_="check",
    )

    op.drop_constraint(
        "ck_question_sets_hiring_year",
        "question_sets",
        type_="check",
    )

    op.drop_constraint(
        "uq_assessment_question_set_variant",
        "assessments",
        type_="unique",
    )

    op.drop_constraint(
        "fk_assessments_question_set_id",
        "assessments",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_assessments_question_set_id",
        table_name="assessments",
    )

    op.drop_index(
        "ix_question_sets_hiring_year",
        table_name="question_sets",
    )

    op.drop_column(
        "assessments",
        "variant_number",
    )

    op.drop_column(
        "assessments",
        "question_set_id",
    )

    op.drop_column(
        "question_sets",
        "variant_count",
    )

    op.drop_column(
        "question_sets",
        "hiring_cycle",
    )

    op.drop_column(
        "question_sets",
        "hiring_year",
    )