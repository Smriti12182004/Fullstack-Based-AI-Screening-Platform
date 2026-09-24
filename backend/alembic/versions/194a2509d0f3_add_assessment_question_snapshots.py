"""add assessment question snapshots

Revision ID: 194a2509d0f3
Revises: 6ee59fc7fc40
Create Date: 2026-09-24 11:47:18.983150
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "194a2509d0f3"
down_revision: Union[str, Sequence[str], None] = "6ee59fc7fc40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # Add snapshot columns as nullable first so existing
    # assessment_questions rows remain valid.
    op.add_column(
        "assessment_questions",
        sa.Column(
            "question_text",
            sa.Text(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_questions",
        sa.Column(
            "question_type",
            sa.String(length=50),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_questions",
        sa.Column(
            "skill_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_questions",
        sa.Column(
            "difficulty",
            sa.String(length=20),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_questions",
        sa.Column(
            "options",
            sa.JSON(),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_questions",
        sa.Column(
            "correct_answer",
            sa.String(length=255),
            nullable=True,
        ),
    )

    op.add_column(
        "assessment_questions",
        sa.Column(
            "explanation",
            sa.Text(),
            nullable=True,
        ),
    )

    # Populate immutable snapshot fields from the question
    # currently referenced by each assessment item.
    op.execute(
        sa.text(
            """
            UPDATE assessment_questions aq
            SET
                question_text = q.question_text,
                question_type = q.question_type,
                skill_id = q.skill_id,
                difficulty = q.difficulty,
                options = q.options,
                correct_answer = q.correct_answer,
                explanation = q.explanation
            FROM questions q
            WHERE aq.question_id = q.id
            """
        )
    )

    # Every existing assessment question must have a valid
    # referenced question so the snapshot can be made complete.
    connection = op.get_bind()

    incomplete_count = connection.execute(
        sa.text(
            """
            SELECT COUNT(*)
            FROM assessment_questions
            WHERE
                question_text IS NULL
                OR question_type IS NULL
                OR skill_id IS NULL
                OR difficulty IS NULL
            """
        )
    ).scalar_one()

    if incomplete_count:
        raise RuntimeError(
            "Unable to backfill assessment question snapshots "
            f"for {incomplete_count} existing assessment_questions row(s)."
        )

    op.create_index(
        op.f("ix_assessment_questions_skill_id"),
        "assessment_questions",
        ["skill_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_assessment_questions_skill_id_skills",
        "assessment_questions",
        "skills",
        ["skill_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # Snapshot content is required for the immutable assessment item.
    op.alter_column(
        "assessment_questions",
        "question_text",
        existing_type=sa.Text(),
        nullable=False,
    )

    op.alter_column(
        "assessment_questions",
        "question_type",
        existing_type=sa.String(length=50),
        nullable=False,
    )

    op.alter_column(
        "assessment_questions",
        "skill_id",
        existing_type=sa.Integer(),
        nullable=False,
    )

    op.alter_column(
        "assessment_questions",
        "difficulty",
        existing_type=sa.String(length=20),
        nullable=False,
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_constraint(
        "fk_assessment_questions_skill_id_skills",
        "assessment_questions",
        type_="foreignkey",
    )

    op.drop_index(
        op.f("ix_assessment_questions_skill_id"),
        table_name="assessment_questions",
    )

    op.drop_column(
        "assessment_questions",
        "explanation",
    )

    op.drop_column(
        "assessment_questions",
        "correct_answer",
    )

    op.drop_column(
        "assessment_questions",
        "options",
    )

    op.drop_column(
        "assessment_questions",
        "difficulty",
    )

    op.drop_column(
        "assessment_questions",
        "skill_id",
    )

    op.drop_column(
        "assessment_questions",
        "question_type",
    )

    op.drop_column(
        "assessment_questions",
        "question_text",
    )