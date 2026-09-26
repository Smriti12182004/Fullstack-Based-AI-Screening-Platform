"""add question version history

Revision ID: 5c4e2b8a7d91
Revises: 194a2509d0f3
Create Date: 2026-09-26 15:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c4e2b8a7d91"
down_revision: Union[str, Sequence[str], None] = "b3d48e2a4a95"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ---------------------------------------------------------
    # Add current version to the questions table.
    # Existing questions start at version 1.
    # ---------------------------------------------------------

    op.add_column(
        "questions",
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )

    # ---------------------------------------------------------
    # Create immutable question-version history.
    # ---------------------------------------------------------

    op.create_table(
        "question_versions",

        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),

        sa.Column(
            "question_id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "question_text",
            sa.Text(),
            nullable=False,
        ),

        sa.Column(
            "question_type",
            sa.String(length=50),
            nullable=False,
        ),

        sa.Column(
            "skill_id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "difficulty",
            sa.String(length=20),
            nullable=False,
        ),

        sa.Column(
            "options",
            sa.JSON(),
            nullable=True,
        ),

        sa.Column(
            "correct_answer",
            sa.String(length=255),
            nullable=True,
        ),

        sa.Column(
            "explanation",
            sa.Text(),
            nullable=True,
        ),

        sa.Column(
            "source",
            sa.String(length=30),
            nullable=False,
        ),

        sa.Column(
            "changed_by",
            sa.Integer(),
            nullable=True,
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.ForeignKeyConstraint(
            ["question_id"],
            ["questions.id"],
            name="fk_question_versions_question_id_questions",
            ondelete="CASCADE",
        ),

        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["skills.id"],
            name="fk_question_versions_skill_id_skills",
            ondelete="RESTRICT",
        ),

        sa.ForeignKeyConstraint(
            ["changed_by"],
            ["users.id"],
            name="fk_question_versions_changed_by_users",
            ondelete="SET NULL",
        ),

        sa.UniqueConstraint(
            "question_id",
            "version",
            name="uq_question_version",
        ),
    )

    op.create_index(
        op.f("ix_question_versions_id"),
        "question_versions",
        ["id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_question_versions_question_id"),
        "question_versions",
        ["question_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_question_versions_skill_id"),
        "question_versions",
        ["skill_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_question_versions_changed_by"),
        "question_versions",
        ["changed_by"],
        unique=False,
    )

    # ---------------------------------------------------------
    # Backfill version 1 for all existing questions.
    # ---------------------------------------------------------

    op.execute(
        sa.text(
            """
            INSERT INTO question_versions (
                question_id,
                version,
                question_text,
                question_type,
                skill_id,
                difficulty,
                options,
                correct_answer,
                explanation,
                source,
                changed_by,
                created_at
            )
            SELECT
                id,
                1,
                question_text,
                question_type,
                skill_id,
                difficulty,
                options,
                correct_answer,
                explanation,
                source,
                created_by,
                created_at
            FROM questions
            """
        )
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_index(
        op.f("ix_question_versions_changed_by"),
        table_name="question_versions",
    )

    op.drop_index(
        op.f("ix_question_versions_skill_id"),
        table_name="question_versions",
    )

    op.drop_index(
        op.f("ix_question_versions_question_id"),
        table_name="question_versions",
    )

    op.drop_index(
        op.f("ix_question_versions_id"),
        table_name="question_versions",
    )

    op.drop_table(
        "question_versions",
    )

    op.drop_column(
        "questions",
        "version",
    )
