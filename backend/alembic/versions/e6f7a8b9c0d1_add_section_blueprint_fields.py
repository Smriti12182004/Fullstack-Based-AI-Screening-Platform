"""Add section semantic type and per-difficulty skill allocations.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-09-28
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


SECTION_TYPE_VALUES = (
    "conceptual",
    "implementation",
    "free_text",
)



def upgrade() -> None:
    """Add new blueprint fields without destroying legacy data."""

    # ---------------------------------------------------------
    # sections.section_type
    # ---------------------------------------------------------
    op.add_column(
        "sections",
        sa.Column(
            "section_type",
            sa.String(length=30),
            nullable=True,
            server_default="conceptual",
        ),
    )

    # Existing section records were created under the legacy model where
    # a section represented a single difficulty bucket. There is no safe
    # automatic inference of conceptual/implementation/free_text from
    # those old names, so preserve them as conceptual during migration.
    op.execute(
        sa.text(
            "UPDATE sections "
            "SET section_type = 'conceptual' "
            "WHERE section_type IS NULL"
        )
    )

    op.alter_column(
        "sections",
        "section_type",
        existing_type=sa.String(length=30),
        nullable=False,
        server_default="conceptual",
    )

    op.create_index(
        "ix_sections_section_type",
        "sections",
        ["section_type"],
        unique=False,
    )

    op.create_check_constraint(
        "ck_sections_section_type",
        "sections",
        "section_type IN ('conceptual', 'implementation', 'free_text')",
    )

    # ---------------------------------------------------------
    # section_skills difficulty counts
    # ---------------------------------------------------------
    for column_name in (
        "easy_count",
        "medium_count",
        "hard_count",
    ):
        op.add_column(
            "section_skills",
            sa.Column(
                column_name,
                sa.Integer(),
                nullable=True,
                server_default="0",
            ),
        )

    # Preserve the old question_count and old Section.difficulty exactly:
    # move the count into the matching difficulty bucket.
    op.execute(
        sa.text(
            "UPDATE section_skills AS ss "
            "SET easy_count = ss.question_count "
            "FROM sections AS s "
            "WHERE s.id = ss.section_id "
            "AND LOWER(s.difficulty) = 'easy'"
        )
    )

    op.execute(
        sa.text(
            "UPDATE section_skills AS ss "
            "SET medium_count = ss.question_count "
            "FROM sections AS s "
            "WHERE s.id = ss.section_id "
            "AND LOWER(s.difficulty) = 'medium'"
        )
    )

    op.execute(
        sa.text(
            "UPDATE section_skills AS ss "
            "SET hard_count = ss.question_count "
            "FROM sections AS s "
            "WHERE s.id = ss.section_id "
            "AND LOWER(s.difficulty) = 'hard'"
        )
    )

    op.execute(
        sa.text(
            "UPDATE section_skills "
            "SET easy_count = COALESCE(easy_count, 0), "
            "    medium_count = COALESCE(medium_count, 0), "
            "    hard_count = COALESCE(hard_count, 0)"
        )
    )

    for column_name in (
        "easy_count",
        "medium_count",
        "hard_count",
    ):
        op.alter_column(
            "section_skills",
            column_name,
            existing_type=sa.Integer(),
            nullable=False,
            server_default="0",
        )

    # Counts must never be negative.
    op.create_check_constraint(
        "ck_section_skills_difficulty_counts_nonnegative",
        "section_skills",
        "easy_count >= 0 AND medium_count >= 0 AND hard_count >= 0",
    )


def downgrade() -> None:
    """Remove only the fields introduced by this migration."""

    op.drop_constraint(
        "ck_section_skills_difficulty_counts_nonnegative",
        "section_skills",
        type_="check",
    )

    for column_name in (
        "hard_count",
        "medium_count",
        "easy_count",
    ):
        op.drop_column("section_skills", column_name)

    op.drop_constraint(
        "ck_sections_section_type",
        "sections",
        type_="check",
    )

    op.drop_index(
        "ix_sections_section_type",
        table_name="sections",
    )

    op.drop_column("sections", "section_type")
