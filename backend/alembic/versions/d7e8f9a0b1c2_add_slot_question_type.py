"""Add durable preferred question type to assessment slots.

Revision ID: d7e8f9a0b1c2
Revises: 5a660b2d049b
"""
from alembic import op
import sqlalchemy as sa

revision = "d7e8f9a0b1c2"
down_revision = "5a660b2d049b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "question_slots",
        sa.Column(
            "preferred_question_type",
            sa.String(length=20),
            nullable=True,
            server_default="MCQ",
        ),
    )
    op.execute(
        sa.text(
            "UPDATE question_slots SET preferred_question_type = "
            "CASE WHEN section_type = 'free_text' THEN 'FREE_TEXT' ELSE 'MCQ' END "
            "WHERE preferred_question_type IS NULL"
        )
    )
    op.alter_column(
        "question_slots",
        "preferred_question_type",
        nullable=False,
        existing_type=sa.String(length=20),
        server_default="MCQ",
    )
    op.create_check_constraint(
        "ck_question_slots_preferred_question_type",
        "question_slots",
        "preferred_question_type IN ('MCQ', 'FREE_TEXT')",
    )
    op.create_index(
        "ix_question_slots_preferred_question_type",
        "question_slots",
        ["preferred_question_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_question_slots_preferred_question_type", table_name="question_slots")
    op.drop_constraint(
        "ck_question_slots_preferred_question_type",
        "question_slots",
        type_="check",
    )
    op.drop_column("question_slots", "preferred_question_type")
