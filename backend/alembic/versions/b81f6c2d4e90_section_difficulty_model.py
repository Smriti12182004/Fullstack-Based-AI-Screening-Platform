"""Redesign sections around one difficulty per section.

Revision ID: b81f6c2d4e90
Revises: 7a51b4930663
Create Date: 2026-09-27
"""

from collections import defaultdict

from alembic import op
from sqlalchemy import Column, Integer, String, text


# revision identifiers, used by Alembic.
revision = "b81f6c2d4e90"
down_revision = "7a51b4930663"
branch_labels = None
depends_on = None


DIFFICULTIES = ("easy", "medium", "hard")


def upgrade() -> None:
    connection = op.get_bind()

    # Add the new columns as nullable while existing data is migrated.
    op.add_column(
        "sections",
        Column(
            "difficulty",
            String(length=20),
            nullable=True,
        ),
    )

    op.add_column(
        "section_skills",
        Column(
            "question_count",
            Integer(),
            nullable=True,
        ),
    )

    section_rows = connection.execute(
        text(
            """
            SELECT
                id,
                question_set_id,
                name,
                display_order,
                is_locked,
                created_at,
                updated_at
            FROM sections
            ORDER BY question_set_id, display_order, id
            """
        )
    ).mappings().all()

    section_order_map: dict[int, list[int]] = defaultdict(list)

    for section in section_rows:
        section_id = section["id"]
        question_set_id = section["question_set_id"]

        allocations = connection.execute(
            text(
                """
                SELECT
                    skill_id,
                    easy_count,
                    medium_count,
                    hard_count
                FROM section_skills
                WHERE section_id = :section_id
                ORDER BY id
                """
            ),
            {"section_id": section_id},
        ).mappings().all()

        if not allocations:
            raise RuntimeError(
                f"Section {section_id} has no skill allocations. "
                "Migration cannot safely determine its difficulty structure."
            )

        difficulty_allocations = {
            difficulty: [
                (
                    allocation["skill_id"],
                    int(allocation[f"{difficulty}_count"] or 0),
                )
                for allocation in allocations
                if int(allocation[f"{difficulty}_count"] or 0) > 0
            ]
            for difficulty in DIFFICULTIES
        }

        if not any(difficulty_allocations.values()):
            raise RuntimeError(
                f"Section {section_id} has zero requested questions. "
                "Migration cannot create a valid section."
            )

        question_section_rows = connection.execute(
            text(
                """
                SELECT
                    qs.question_id
                FROM question_sections qs
                WHERE qs.section_id = :section_id
                ORDER BY qs.id
                """
            ),
            {"section_id": section_id},
        ).mappings().all()

        question_difficulties = {}

        for question_section in question_section_rows:
            question_id = question_section["question_id"]

            question_difficulty = connection.execute(
                text(
                    """
                    SELECT difficulty
                    FROM questions
                    WHERE id = :question_id
                    """
                ),
                {"question_id": question_id},
            ).scalar_one_or_none()

            if question_difficulty is None:
                raise RuntimeError(
                    f"Question {question_id} referenced by "
                    f"section {section_id} does not exist or has no difficulty."
                )

            if question_difficulty not in DIFFICULTIES:
                raise RuntimeError(
                    f"Question {question_id} has unsupported difficulty "
                    f"'{question_difficulty}'."
                )

            question_difficulties[question_id] = question_difficulty

        connection.execute(
            text(
                """
                DELETE FROM section_skills
                WHERE section_id = :section_id
                """
            ),
            {"section_id": section_id},
        )

        created_section_ids: dict[str, int] = {}

        first_section = True

        for difficulty in DIFFICULTIES:
            allocations_for_difficulty = difficulty_allocations[difficulty]

            if not allocations_for_difficulty:
                continue

            if first_section:
                target_section_id = section_id

                connection.execute(
                    text(
                        """
                        UPDATE sections
                        SET
                            difficulty = :difficulty,
                            name = :name
                        WHERE id = :section_id
                        """
                    ),
                    {
                        "difficulty": difficulty,
                        "name": section["name"],
                        "section_id": target_section_id,
                    },
                )

                first_section = False

            else:
                inserted = connection.execute(
                    text(
                        """
                        INSERT INTO sections (
                            question_set_id,
                            name,
                            difficulty,
                            display_order,
                            is_locked,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :question_set_id,
                            :name,
                            :difficulty,
                            :display_order,
                            :is_locked,
                            :created_at,
                            :updated_at
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "question_set_id": question_set_id,
                        "name": (
                            f"{section['name']} - "
                            f"{difficulty.capitalize()}"
                        ),
                        "difficulty": difficulty,
                        "display_order": section["display_order"],
                        "is_locked": section["is_locked"],
                        "created_at": section["created_at"],
                        "updated_at": section["updated_at"],
                    },
                )

                target_section_id = inserted.scalar_one()

            created_section_ids[difficulty] = target_section_id
            section_order_map[question_set_id].append(
                target_section_id
            )

            for skill_id, question_count in allocations_for_difficulty:
                connection.execute(
                    text(
                        """
                        INSERT INTO section_skills (
                            section_id,
                            skill_id,
                            easy_count,
                            medium_count,
                            hard_count,
                            question_count,
                            created_at,
                            updated_at
                        )
                        VALUES (
                            :section_id,
                            :skill_id,
                            :easy_count,
                            :medium_count,
                            :hard_count,
                            :question_count,
                            :created_at,
                            :updated_at
                        )
                        """
                    ),
                    {
                        "section_id": target_section_id,
                        "skill_id": skill_id,
                        "easy_count": (
                            question_count if difficulty == "easy" else 0
                        ),
                        "medium_count": (
                            question_count if difficulty == "medium" else 0
                        ),
                        "hard_count": (
                            question_count if difficulty == "hard" else 0
                        ),
                        "question_count": question_count,
                        "created_at": section["created_at"],
                        "updated_at": section["updated_at"],
                    },
                )

        for question_id, question_difficulty in question_difficulties.items():
            target_section_id = created_section_ids.get(
                question_difficulty
            )

            if target_section_id is None:
                raise RuntimeError(
                    f"Question {question_id} has difficulty "
                    f"'{question_difficulty}', but section "
                    f"{section_id} has no allocation for that difficulty."
                )

            connection.execute(
                text(
                    """
                    UPDATE question_sections
                    SET section_id = :section_id
                    WHERE question_id = :question_id
                      AND section_id = :old_section_id
                    """
                ),
                {
                    "section_id": target_section_id,
                    "question_id": question_id,
                    "old_section_id": section_id,
                },
            )

    for question_set_id, section_ids in section_order_map.items():
        for new_order, section_id in enumerate(
            section_ids,
            start=1,
        ):
            connection.execute(
                text(
                    """
                    UPDATE sections
                    SET display_order = :display_order
                    WHERE id = :section_id
                    """
                ),
                {
                    "display_order": new_order,
                    "section_id": section_id,
                },
            )

    op.alter_column(
        "sections",
        "difficulty",
        nullable=False,
    )

    op.alter_column(
        "section_skills",
        "question_count",
        nullable=False,
    )

    op.create_check_constraint(
        "ck_sections_difficulty",
        "sections",
        "difficulty IN ('easy', 'medium', 'hard')",
    )

    op.create_check_constraint(
        "ck_section_skills_question_count_positive",
        "section_skills",
        "question_count > 0",
    )

    op.create_index(
        "ix_sections_difficulty",
        "sections",
        ["difficulty"],
    )

    op.drop_column(
        "section_skills",
        "easy_count",
    )

    op.drop_column(
        "section_skills",
        "medium_count",
    )

    op.drop_column(
        "section_skills",
        "hard_count",
    )


def downgrade() -> None:
    connection = op.get_bind()

    multi_section_question_sets = connection.execute(
        text(
            """
            SELECT question_set_id
            FROM sections
            GROUP BY question_set_id
            HAVING COUNT(*) > 1
            """
        )
    ).scalars().all()

    if multi_section_question_sets:
        raise RuntimeError(
            "Downgrade refused: one or more question sets contain "
            "multiple difficulty sections. Reconstructing the "
            "previous mixed-difficulty section structure would risk "
            "silent data loss."
        )

    op.add_column(
        "section_skills",
        Column(
            "easy_count",
            Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "section_skills",
        Column(
            "medium_count",
            Integer(),
            nullable=True,
        ),
    )

    op.add_column(
        "section_skills",
        Column(
            "hard_count",
            Integer(),
            nullable=True,
        ),
    )

    connection.execute(
        text(
            """
            UPDATE section_skills
            SET
                easy_count = CASE
                    WHEN sections.difficulty = 'easy'
                    THEN section_skills.question_count
                    ELSE 0
                END,
                medium_count = CASE
                    WHEN sections.difficulty = 'medium'
                    THEN section_skills.question_count
                    ELSE 0
                END,
                hard_count = CASE
                    WHEN sections.difficulty = 'hard'
                    THEN section_skills.question_count
                    ELSE 0
                END
            FROM sections
            WHERE section_skills.section_id = sections.id
            """
        )
    )

    op.alter_column(
        "section_skills",
        "easy_count",
        nullable=False,
    )

    op.alter_column(
        "section_skills",
        "medium_count",
        nullable=False,
    )

    op.alter_column(
        "section_skills",
        "hard_count",
        nullable=False,
    )

    op.drop_constraint(
        "ck_section_skills_question_count_positive",
        "section_skills",
        type_="check",
    )

    op.drop_constraint(
        "ck_sections_difficulty",
        "sections",
        type_="check",
    )

    op.drop_index(
        "ix_sections_difficulty",
        table_name="sections",
    )

    op.drop_column(
        "section_skills",
        "question_count",
    )

    op.drop_column(
        "sections",
        "difficulty",
    )
