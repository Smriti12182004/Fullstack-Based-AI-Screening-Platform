"""redesign sections for multiple skills

Revision ID: 7a51b4930663

Revises: 5c4e2b8a7d91

Create Date: 2026-09-27 12:43:43.387558
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7a51b4930663"
down_revision: Union[str, Sequence[str], None] = "5c4e2b8a7d91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # ---------------------------------------------------------
    # 1. Create section_skills.
    #
    # This becomes the relationship between a section and one
    # or more skills.
    # ---------------------------------------------------------

    op.create_table(
        "section_skills",

        sa.Column(
            "id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "section_id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "skill_id",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "easy_count",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "medium_count",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "hard_count",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),

        sa.ForeignKeyConstraint(
            ["section_id"],
            ["sections.id"],
            ondelete="CASCADE",
        ),

        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["skills.id"],
            ondelete="RESTRICT",
        ),

        sa.PrimaryKeyConstraint("id"),

        sa.UniqueConstraint(
            "section_id",
            "skill_id",
            name="uq_section_skill",
        ),
    )

    op.create_index(
        op.f("ix_section_skills_id"),
        "section_skills",
        ["id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_section_skills_section_id"),
        "section_skills",
        ["section_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_section_skills_skill_id"),
        "section_skills",
        ["skill_id"],
        unique=False,
    )

    # ---------------------------------------------------------
    # 2. Migrate existing section skill/count data.
    #
    # Every existing section currently has exactly one skill
    # and its difficulty counts directly on the sections table.
    #
    # Move that information into section_skills before the
    # old columns are removed.
    # ---------------------------------------------------------

    op.execute(
        sa.text(
            """
            INSERT INTO section_skills (
                section_id,
                skill_id,
                easy_count,
                medium_count,
                hard_count,
                created_at,
                updated_at
            )
            SELECT
                id,
                skill_id,
                easy_count,
                medium_count,
                hard_count,
                created_at,
                updated_at
            FROM sections
            WHERE skill_id IS NOT NULL
            """
        )
    )

    # ---------------------------------------------------------
    # 3. Remove the old one-skill-per-section structure.
    # ---------------------------------------------------------

    op.drop_index(
        op.f("ix_sections_skill_id"),
        table_name="sections",
    )

    op.drop_constraint(
        "sections_skill_id_fkey",
        "sections",
        type_="foreignkey",
    )

    op.drop_column(
        "sections",
        "skill_id",
    )

    op.drop_column(
        "sections",
        "easy_count",
    )

    op.drop_column(
        "sections",
        "medium_count",
    )

    op.drop_column(
        "sections",
        "hard_count",
    )


def downgrade() -> None:
    """Downgrade schema."""

    # ---------------------------------------------------------
    # A downgrade cannot faithfully restore multiple skills
    # per section into the old one-skill structure.
    #
    # Therefore, refuse to downgrade when any section contains
    # more than one skill allocation rather than silently losing
    # data.
    # ---------------------------------------------------------

    connection = op.get_bind()

    multi_skill_sections = connection.execute(
        sa.text(
            """
            SELECT section_id
            FROM section_skills
            GROUP BY section_id
            HAVING COUNT(*) > 1
            """
        )
    ).fetchall()

    if multi_skill_sections:
        raise RuntimeError(
            "Cannot downgrade section redesign because one or more "
            "sections contain multiple skills. Downgrading would "
            "destroy section skill allocations."
        )

    # ---------------------------------------------------------
    # Restore the original columns.
    # ---------------------------------------------------------

    op.add_column(
        "sections",
        sa.Column(
            "skill_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "sections",
        sa.Column(
            "easy_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    op.add_column(
        "sections",
        sa.Column(
            "medium_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    op.add_column(
        "sections",
        sa.Column(
            "hard_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # ---------------------------------------------------------
    # Copy the single skill allocation back into sections.
    # ---------------------------------------------------------

    op.execute(
        sa.text(
            """
            UPDATE sections AS s
            SET
                skill_id = ss.skill_id,
                easy_count = ss.easy_count,
                medium_count = ss.medium_count,
                hard_count = ss.hard_count
            FROM section_skills AS ss
            WHERE ss.section_id = s.id
            """
        )
    )

    # ---------------------------------------------------------
    # Restore the foreign key and index.
    # ---------------------------------------------------------

    op.create_foreign_key(
        "sections_skill_id_fkey",
        "sections",
        "skills",
        ["skill_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_index(
        op.f("ix_sections_skill_id"),
        "sections",
        ["skill_id"],
        unique=False,
    )

    # Old schema requires skill_id to be non-null.
    op.alter_column(
        "sections",
        "skill_id",
        nullable=False,
    )

    # Remove defaults introduced only to make the temporary
    # restoration possible.
    op.alter_column(
        "sections",
        "easy_count",
        server_default=None,
    )

    op.alter_column(
        "sections",
        "medium_count",
        server_default=None,
    )

    op.alter_column(
        "sections",
        "hard_count",
        server_default=None,
    )

    # ---------------------------------------------------------
    # Remove the new relationship table.
    # ---------------------------------------------------------

    op.drop_index(
        op.f("ix_section_skills_skill_id"),
        table_name="section_skills",
    )

    op.drop_index(
        op.f("ix_section_skills_section_id"),
        table_name="section_skills",
    )

    op.drop_index(
        op.f("ix_section_skills_id"),
        table_name="section_skills",
    )

    op.drop_table(
        "section_skills",
    )