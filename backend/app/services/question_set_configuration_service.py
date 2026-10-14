from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    JobSkill,
    Question,
    QuestionBank,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
)


class QuestionSetConfigurationServiceError(Exception):
    """Base exception for question-set configuration failures."""


VALID_DIFFICULTIES = {
    "easy",
    "medium",
    "hard",
}

VALID_SECTION_TYPES = {
    "conceptual",
    "implementation",
    "free_text",
}


def _count_for_difficulty(
    section_skill,
    difficulty: str,
    section=None,
) -> int:
    """
    Return the requested count for one skill/difficulty.

    The current codebase has existed through two SectionSkill contracts:

    1. New contract: easy_count / medium_count / hard_count.
    2. Legacy contract: question_count paired with Section.difficulty.

    Support both so API tests and existing database records remain usable
    while application paths migrate to the new blueprint model.
    """
    mapped_name = f"{difficulty}_count"

    if hasattr(section_skill, mapped_name):
        value = getattr(section_skill, mapped_name, 0)
        value = max(int(value or 0), 0)

        # Some existing records were created before the per-difficulty
        # columns were populated. Preserve a positive legacy allocation when
        # the new fields are still all zero.
        if value > 0:
            return value

        legacy_count = max(
            int(getattr(section_skill, "question_count", 0) or 0),
            0,
        )
        legacy_difficulty = str(
            getattr(section, "difficulty", "") or ""
        ).strip().lower()

        if (
            legacy_count > 0
            and legacy_difficulty in VALID_DIFFICULTIES
            and difficulty == legacy_difficulty
        ):
            return legacy_count

        return 0

    legacy_count = max(
        int(getattr(section_skill, "question_count", 0) or 0),
        0,
    )
    legacy_difficulty = str(
        getattr(section, "difficulty", "") or ""
    ).strip().lower()

    if legacy_difficulty in VALID_DIFFICULTIES:
        return legacy_count if difficulty == legacy_difficulty else 0

    # Last-resort compatibility for records where the legacy difficulty was
    # not populated: keep the allocation visible under medium rather than
    # silently dropping it from the configuration totals.
    return legacy_count if difficulty == "medium" else 0


def _section_skill_counts(section, section_skill):
    """Return (easy, medium, hard) counts for one section skill."""
    return (
        _count_for_difficulty(section_skill, "easy", section),
        _count_for_difficulty(section_skill, "medium", section),
        _count_for_difficulty(section_skill, "hard", section),
    )


def _section_question_count(section: Section) -> int:
    """Return all requested questions across all skills in one section."""
    total = 0
    for section_skill in section.section_skills:
        easy_count, medium_count, hard_count = _section_skill_counts(
            section,
            section_skill,
        )
        total += easy_count + medium_count + hard_count
    return total


def _validate_section_type(section: Section) -> None:
    """Validate semantic section type when the current model exposes it."""
    if not hasattr(section, "section_type"):
        return

    section_type = str(
        getattr(section, "section_type", "") or ""
    ).strip().lower()

    if section_type not in VALID_SECTION_TYPES:
        raise QuestionSetConfigurationServiceError(
            f"Section '{section.name}' has invalid section type "
            f"'{getattr(section, 'section_type', None)}'."
        )


def _aggregate_section_counts(
    sections: list[Section],
) -> tuple[int, int, int, int]:
    """Aggregate all skill allocations by Easy/Medium/Hard."""
    easy_count = 0
    medium_count = 0
    hard_count = 0

    for section in sections:
        _validate_section_type(section)

        for section_skill in section.section_skills:
            easy, medium, hard = _section_skill_counts(
                section,
                section_skill,
            )
            easy_count += easy
            medium_count += medium
            hard_count += hard

    total = easy_count + medium_count + hard_count
    return total, easy_count, medium_count, hard_count


def _available_question_count(
    db: Session,
    question_set: QuestionSet,
    skill_id: int,
    difficulty: str,
) -> int:
    """
    Count approved questions available to this job for one skill/difficulty.
    """
    query = (
        db.query(Question.id)
        .filter(
            Question.skill_id == skill_id,
            Question.difficulty == difficulty,
            Question.status == "approved",
        )
        .outerjoin(
            QuestionBank,
            Question.question_bank_id == QuestionBank.id,
        )
        .filter(
            (QuestionBank.job_id == question_set.job_id)
            | (Question.question_bank_id.is_(None))
        )
        .join(
            JobSkill,
            JobSkill.skill_id == Question.skill_id,
        )
        .filter(
            JobSkill.job_id == question_set.job_id,
        )
    )

    return int(query.count())


def _build_configuration_response(
    db: Session,
    configuration: QuestionSetConfiguration,
    sections: list[Section],
):
    """Build configuration response plus inventory warnings."""
    (
        section_question_count,
        easy_count,
        medium_count,
        hard_count,
    ) = _aggregate_section_counts(sections)

    warnings: list[str] = []
    question_set = configuration.question_set

    if question_set is not None:
        for section in sections:
            section_type = getattr(section, "section_type", None)
            section_label = (
                f"Section '{section.name}'"
                + (
                    f" ({section_type})"
                    if section_type
                    else ""
                )
            )

            for section_skill in section.section_skills:
                easy, medium, hard = _section_skill_counts(
                    section,
                    section_skill,
                )

                for difficulty, required_count in (
                    ("easy", easy),
                    ("medium", medium),
                    ("hard", hard),
                ):
                    if required_count <= 0:
                        continue

                    available_count = _available_question_count(
                        db=db,
                        question_set=question_set,
                        skill_id=section_skill.skill_id,
                        difficulty=difficulty,
                    )

                    if available_count < required_count:
                        warnings.append(
                            f"{section_label} requires "
                            f"{required_count} approved {difficulty} "
                            f"question(s) for skill {section_skill.skill_id}, "
                            f"but only {available_count} are currently available."
                        )

    return {
        "id": configuration.id,
        "question_set_id": configuration.question_set_id,
        "total_questions": configuration.total_questions,
        "duration_minutes": configuration.duration_minutes,
        "candidate_instructions": configuration.candidate_instructions,
        "section_question_count": section_question_count,
        "easy_count": easy_count,
        "medium_count": medium_count,
        "hard_count": hard_count,
        "warnings": warnings,
        "created_at": configuration.created_at,
        "updated_at": configuration.updated_at,
    }


def _load_sections(
    db: Session,
    question_set_id: int,
) -> list[Section]:
    """Return sections in deterministic blueprint order."""
    return (
        db.query(Section)
        .filter(
            Section.question_set_id == question_set_id,
        )
        .order_by(
            Section.display_order.asc(),
            Section.id.asc(),
        )
        .all()
    )


def get_question_set_configuration(
    db: Session,
    question_set_id: int,
):
    """Return configuration, initializing missing data for editable drafts."""
    question_set = db.get(QuestionSet, question_set_id)

    if question_set is None:
        raise QuestionSetConfigurationServiceError(
            "Question set not found."
        )

    configuration = (
        db.query(QuestionSetConfiguration)
        .filter(
            QuestionSetConfiguration.question_set_id == question_set_id,
        )
        .first()
    )

    sections = _load_sections(
        db=db,
        question_set_id=question_set_id,
    )

    raw_status = getattr(
        question_set.status,
        "value",
        question_set.status,
    )
    question_set_status = str(raw_status).strip().lower()

    # Only editable assessments may be initialized by this recovery path.
    if question_set_status in {"draft", "rejected"}:
        needs_configuration = configuration is None
        needs_sections = not sections

        if needs_configuration or needs_sections:
            try:
                if needs_sections:
                    # Reuse the same defaults as normal assessment creation.
                    from app.services.question_set_service import (
                        INITIAL_SECTION_DEFINITIONS,
                    )

                    db.add_all(
                        [
                            Section(
                                question_set_id=question_set_id,
                                name=definition["name"],
                                section_type=definition["section_type"],
                                difficulty=definition["difficulty"],
                                display_order=definition["display_order"],
                                is_locked=False,
                            )
                            for definition in INITIAL_SECTION_DEFINITIONS
                        ]
                    )
                    db.flush()

                    sections = _load_sections(
                        db=db,
                        question_set_id=question_set_id,
                    )

                if needs_configuration:
                    section_question_count, _, _, _ = (
                        _aggregate_section_counts(sections)
                    )

                    configuration = QuestionSetConfiguration(
                        question_set_id=question_set_id,
                        total_questions=section_question_count,
                        duration_minutes=60,
                        candidate_instructions=None,
                    )
                    db.add(configuration)

                # Commit only when the missing records have been initialized.
                db.commit()

                if configuration is not None:
                    db.refresh(configuration)

                sections = _load_sections(
                    db=db,
                    question_set_id=question_set_id,
                )

            except Exception as exc:
                db.rollback()

                if isinstance(exc, SQLAlchemyError):
                    raise QuestionSetConfigurationServiceError(
                        "Failed to initialize assessment configuration."
                    ) from exc

                raise

    if configuration is None:
        raise QuestionSetConfigurationServiceError(
            "Assessment configuration not found."
        )

    return _build_configuration_response(
        db=db,
        configuration=configuration,
        sections=sections,
    )
def configure_question_set(
    db: Session,
    question_set_id: int,
    total_questions: int,
    duration_minutes: int,
    candidate_instructions: str | None,
    allow_partial: bool = False,
):
    """
    Create or update assessment configuration from the section blueprint.

    The section blueprint is authoritative for the question distribution.
    """
    question_set = db.get(QuestionSet, question_set_id)

    if question_set is None:
        raise QuestionSetConfigurationServiceError(
            "Question set not found."
        )

    if question_set.status not in {"draft", "rejected"}:
        raise QuestionSetConfigurationServiceError(
            "Only draft or rejected question sets can be configured."
        )

    if total_questions <= 0:
        raise QuestionSetConfigurationServiceError(
            "Total questions must be greater than zero."
        )

    if duration_minutes <= 0:
        raise QuestionSetConfigurationServiceError(
            "Duration must be greater than zero."
        )

    sections = _load_sections(
        db=db,
        question_set_id=question_set_id,
    )

    if not sections:
        raise QuestionSetConfigurationServiceError(
            "At least one section is required before configuring the assessment."
        )

    configured_sections = []

    for section in sections:
        _validate_section_type(section)

        if not section.section_skills or _section_question_count(section) <= 0:
            if allow_partial:
                continue
            if not section.section_skills:
                raise QuestionSetConfigurationServiceError(
                    f"Section '{section.name}' must contain at least one skill allocation."
                )
            raise QuestionSetConfigurationServiceError(
                f"Section '{section.name}' must contain at least one requested question."
            )

        configured_sections.append(section)

    if allow_partial and not configured_sections:
        raise QuestionSetConfigurationServiceError(
            "Configure at least one assessment section before saving a partial blueprint."
        )

    sections_for_totals = configured_sections if allow_partial else sections

    (
        section_question_count,
        _,
        _,
        _,
    ) = _aggregate_section_counts(sections_for_totals)

    if section_question_count != total_questions:
        raise QuestionSetConfigurationServiceError(
            "Total questions must equal the sum of all section skill difficulty allocations."
        )

    instructions = (
        candidate_instructions.strip()
        if candidate_instructions is not None
        else None
    )

    try:
        configuration = (
            db.query(QuestionSetConfiguration)
            .filter(
                QuestionSetConfiguration.question_set_id == question_set_id,
            )
            .first()
        )

        if configuration is None:
            configuration = QuestionSetConfiguration(
                question_set_id=question_set_id,
                total_questions=total_questions,
                duration_minutes=duration_minutes,
                candidate_instructions=instructions,
            )
            db.add(configuration)
        else:
            configuration.total_questions = total_questions
            configuration.duration_minutes = duration_minutes
            configuration.candidate_instructions = instructions

        db.commit()
        db.refresh(configuration)

        return _build_configuration_response(
            db=db,
            configuration=configuration,
            sections=sections,
        )

    except SQLAlchemyError as exc:
        db.rollback()
        raise QuestionSetConfigurationServiceError(
            "Failed to save assessment configuration."
        ) from exc
