from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    AssessmentSet,
    JobSkill,
    JobSkillReview,
    QuestionSet,
    Section,
    SectionSkill,
    Skill,
)
from app.models.question_slot import QuestionSlot


class SectionServiceError(Exception):
    """Base exception for section service failures."""


VALID_SECTION_TYPES = {
    "conceptual",
    "implementation",
    "free_text",
}

VALID_DIFFICULTIES = {
    "easy",
    "medium",
    "hard",
}


def _normalize_section_type(
    section_type: str | None,
) -> str | None:
    """
    Normalize the new semantic section type.

    None is intentionally preserved so older API callers can use
    the legacy single-difficulty contract.
    """
    if section_type is None:
        return None

    normalized = section_type.strip().lower()

    if not normalized:
        return None

    if normalized not in VALID_SECTION_TYPES:
        raise SectionServiceError(
            "Section type must be conceptual, implementation, or free_text."
        )

    return normalized


def _normalize_difficulty(
    difficulty: str | None,
) -> str | None:
    if difficulty is None:
        return None

    normalized = difficulty.strip().lower()

    if not normalized:
        return None

    if normalized not in VALID_DIFFICULTIES:
        raise SectionServiceError(
            "Section difficulty must be easy, medium, or hard."
        )

    return normalized


def _normalize_name(name: str) -> str:
    normalized = " ".join(
        (name or "").strip().split()
    )

    if not normalized:
        raise SectionServiceError(
            "Section name cannot be empty."
        )

    return normalized


def _normalize_count(
    value: int,
    label: str,
) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError) as exc:
        raise SectionServiceError(
            f"{label} must be a non-negative integer."
        ) from exc

    if count < 0:
        raise SectionServiceError(
            f"{label} cannot be negative."
        )

    return count


SEMANTIC_SECTION_DIFFICULTY = {
    "conceptual": "easy",
    "implementation": "medium",
    "free_text": "hard",
}


def _validate_semantic_difficulty_allocation(
    section_type: str | None,
    easy_count: int,
    medium_count: int,
    hard_count: int,
) -> None:
    expected_difficulty = SEMANTIC_SECTION_DIFFICULTY.get(section_type)
    if expected_difficulty is None:
        return

    counts = {
        "easy": easy_count,
        "medium": medium_count,
        "hard": hard_count,
    }

    invalid_difficulties = [
        difficulty
        for difficulty, count in counts.items()
        if difficulty != expected_difficulty and count > 0
    ]

    if invalid_difficulties:
        raise SectionServiceError(
            f"A '{section_type}' section only allows "
            f"{expected_difficulty} difficulty questions."
        )


def _legacy_difficulty(
    section_type: str,
    legacy_difficulty: str | None,
) -> str:
    """
    Keep the legacy sections.difficulty column populated.

    Explicit semantic sections default to medium because the real
    difficulty distribution now lives on SectionSkill.
    """
    del section_type

    return (
        legacy_difficulty
        if legacy_difficulty in VALID_DIFFICULTIES
        else "medium"
    )


def _legacy_counts_from_question_count(
    question_count: int,
    legacy_difficulty: str,
) -> tuple[int, int, int]:
    """
    Convert the old one-difficulty allocation into the new
    per-difficulty representation.
    """
    if legacy_difficulty == "easy":
        return question_count, 0, 0

    if legacy_difficulty == "hard":
        return 0, 0, question_count

    return 0, question_count, 0


def create_section(
    db: Session,
    question_set_id: int,
    name: str,
    section_type: str | None = None,
    display_order: int = 1,
    skills: list[dict] | None = None,
    difficulty: str | None = None,
) -> Section:
    """
    Create an assessment section.

    New contract:
    - section_type is conceptual / implementation / free_text
    - each skill has independent easy / medium / hard counts
    - same semantic type is unique within a question set
    - same skill may appear in different semantic sections

    Backward-compatible contract:
    - section_type omitted
    - difficulty supplied
    - skill allocations use question_count

    In that legacy mode the section is stored as conceptual, but the
    supplied legacy difficulty is preserved and question_count is
    mapped into the matching new SectionSkill difficulty field.
    """

    question_set = db.get(
        QuestionSet,
        question_set_id,
    )

    if question_set is None:
        raise SectionServiceError(
            "Question set not found."
        )

    normalized_name = _normalize_name(name)
    normalized_section_type = _normalize_section_type(
        section_type
    )
    normalized_legacy_difficulty = _normalize_difficulty(
        difficulty
    )

    # Old clients did not know about section_type. Preserve their
    # behaviour instead of requiring a new field from them.
    legacy_mode = normalized_section_type is None

    if legacy_mode:
        normalized_section_type = "conceptual"

        if normalized_legacy_difficulty is None:
            normalized_legacy_difficulty = "medium"

    if display_order < 1:
        raise SectionServiceError(
            "Display order must be at least 1."
        )

    if not skills:
        raise SectionServiceError(
            "At least one skill allocation is required."
        )

    existing_order = (
        db.query(Section)
        .filter(
            Section.question_set_id == question_set_id,
            Section.display_order == display_order,
        )
        .first()
    )

    if existing_order is not None:
        raise SectionServiceError(
            "A section already exists at this display order."
        )

    # A semantic section type is unique only for the new explicit
    # contract. Legacy requests are allowed to create easy/medium/hard
    # sections independently, as the old product did.
    if not legacy_mode:
        existing_type = (
            db.query(Section)
            .filter(
                Section.question_set_id == question_set_id,
                Section.section_type == normalized_section_type,
            )
            .first()
        )

        if existing_type is not None:
            raise SectionServiceError(
                f"A '{normalized_section_type}' section already exists in this question set."
            )

    skill_review = (
        db.query(JobSkillReview)
        .filter(
            JobSkillReview.job_id == question_set.job_id,
        )
        .first()
    )

    if (
        skill_review is None
        or skill_review.status != "confirmed"
    ):
        raise SectionServiceError(
            "The job's skills must be confirmed before creating sections."
        )

    seen_skill_ids: set[int] = set()
    normalized_allocations: list[dict[str, int]] = []

    for allocation in skills:
        try:
            skill_id = int(
                allocation["skill_id"]
            )
        except (
            KeyError,
            TypeError,
            ValueError,
        ) as exc:
            raise SectionServiceError(
                "Each skill allocation must contain a valid skill_id."
            ) from exc

        if skill_id <= 0:
            raise SectionServiceError(
                "Skill ID must be greater than zero."
            )

        if skill_id in seen_skill_ids:
            raise SectionServiceError(
                "A skill cannot be added more than once to the same section."
            )

        seen_skill_ids.add(skill_id)

        skill = db.get(
            Skill,
            skill_id,
        )

        if skill is None:
            raise SectionServiceError(
                "Skill not found."
            )

        job_skill = (
            db.query(JobSkill)
            .filter(
                JobSkill.job_id == question_set.job_id,
                JobSkill.skill_id == skill_id,
            )
            .first()
        )

        if job_skill is None:
            raise SectionServiceError(
                "Skill does not belong to the job for this question set."
            )

        easy_count = _normalize_count(
            allocation.get("easy_count", 0),
            "Easy question count",
        )
        medium_count = _normalize_count(
            allocation.get("medium_count", 0),
            "Medium question count",
        )
        hard_count = _normalize_count(
            allocation.get("hard_count", 0),
            "Hard question count",
        )

        legacy_question_count = allocation.get(
            "question_count"
        )

        # Translate an old allocation into the new count representation
        # only when the new fields were not explicitly populated.
        if (
            legacy_question_count is not None
            and easy_count == 0
            and medium_count == 0
            and hard_count == 0
        ):
            question_count = _normalize_count(
                legacy_question_count,
                "Question count",
            )

            (
                easy_count,
                medium_count,
                hard_count,
            ) = _legacy_counts_from_question_count(
                question_count,
                normalized_legacy_difficulty,
            )

        if not legacy_mode:
            _validate_semantic_difficulty_allocation(
                normalized_section_type,
                easy_count,
                medium_count,
                hard_count,
            )

        allocation_total = (
            easy_count
            + medium_count
            + hard_count
        )

        if allocation_total == 0:
            raise SectionServiceError(
                f"Each skill allocation must contain at least one question."
            )

        normalized_allocations.append(
            {
                "skill_id": skill_id,
                "easy_count": easy_count,
                "medium_count": medium_count,
                "hard_count": hard_count,
            }
        )

    total_question_count = sum(
        allocation["easy_count"]
        + allocation["medium_count"]
        + allocation["hard_count"]
        for allocation in normalized_allocations
    )

    if total_question_count <= 0:
        raise SectionServiceError(
            "Section must contain at least one requested question."
        )

    section = Section(
        question_set_id=question_set_id,
        name=normalized_name,
        section_type=normalized_section_type,
        difficulty=_legacy_difficulty(
            normalized_section_type,
            normalized_legacy_difficulty,
        ),
        display_order=display_order,
        is_locked=False,
    )

    try:
        db.add(section)
        db.flush()

        for allocation in normalized_allocations:
            question_count = (
                allocation["easy_count"]
                + allocation["medium_count"]
                + allocation["hard_count"]
            )

            db.add(
                SectionSkill(
                    section_id=section.id,
                    skill_id=allocation["skill_id"],
                    easy_count=allocation["easy_count"],
                    medium_count=allocation["medium_count"],
                    hard_count=allocation["hard_count"],
                    question_count=question_count,
                )
            )

        db.commit()
        db.refresh(section)

        return section

    except SQLAlchemyError as exc:
        db.rollback()

        raise SectionServiceError(
            "Unable to create section."
        ) from exc


def update_section(
    db: Session,
    section_id: int,
    name: str,
    section_type: str,
    display_order: int,
    skills: list[dict],
) -> Section:
    """Update an unlocked semantic assessment section and replace its skill allocations."""

    section = db.get(Section, section_id)
    if section is None:
        raise SectionServiceError("Section not found.")

    question_set = db.get(QuestionSet, section.question_set_id)
    if question_set is None:
        raise SectionServiceError("Question set not found.")

    if section.is_locked:
        raise SectionServiceError("This section is locked and cannot be edited.")

    normalized_name = _normalize_name(name)
    normalized_type = _normalize_section_type(section_type)
    normalized_difficulty = _normalize_difficulty(
        getattr(section, "difficulty", None)
    ) or "medium"

    if normalized_type is None:
        normalized_type = "conceptual"

    if display_order < 1:
        raise SectionServiceError("Display order must be at least 1.")

    if not skills:
        raise SectionServiceError("At least one skill allocation is required.")

    existing_order = (
        db.query(Section)
        .filter(
            Section.question_set_id == section.question_set_id,
            Section.display_order == display_order,
            Section.id != section.id,
        )
        .first()
    )
    if existing_order is not None:
        raise SectionServiceError("A section already exists at this display order.")

    existing_type = (
        db.query(Section)
        .filter(
            Section.question_set_id == section.question_set_id,
            Section.section_type == normalized_type,
            Section.id != section.id,
        )
        .first()
    )
    if existing_type is not None:
        raise SectionServiceError(
            f"A '{normalized_type}' section already exists in this question set."
        )

    # A generated AI candidate is a resumable draft, not finalized/authored
    # content. It must not lock the blueprint just because an attempt exists.
    # Only a question that has actually been accepted as the slot's current
    # question should protect the section from blueprint mutation.
    authored_slot_exists = (
        db.query(QuestionSlot.id)
        .join(
            AssessmentSet,
            AssessmentSet.id == QuestionSlot.assessment_set_id,
        )
        .filter(
            AssessmentSet.question_set_id == question_set.id,
            QuestionSlot.section_id == section.id,
            QuestionSlot.current_question_id.is_not(None),
        )
        .first()
    )
    if authored_slot_exists is not None:
        raise SectionServiceError(
            "This section already has an accepted question. Finish or reset the assessment before changing its blueprint."
        )

    skill_review = (
        db.query(JobSkillReview)
        .filter(JobSkillReview.job_id == question_set.job_id)
        .first()
    )
    if skill_review is None or skill_review.status != "confirmed":
        raise SectionServiceError(
            "The job's skills must be confirmed before editing sections."
        )

    normalized_allocations: list[dict[str, int]] = []
    seen_skill_ids: set[int] = set()

    for allocation in skills:
        try:
            skill_id = int(allocation["skill_id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise SectionServiceError(
                "Each skill allocation must contain a valid skill_id."
            ) from exc

        if skill_id <= 0:
            raise SectionServiceError("Skill ID must be greater than zero.")
        if skill_id in seen_skill_ids:
            raise SectionServiceError(
                "A skill cannot be added more than once to the same section."
            )
        seen_skill_ids.add(skill_id)

        skill = db.get(Skill, skill_id)
        if skill is None:
            raise SectionServiceError("Skill not found.")

        job_skill = (
            db.query(JobSkill)
            .filter(
                JobSkill.job_id == question_set.job_id,
                JobSkill.skill_id == skill_id,
            )
            .first()
        )
        if job_skill is None:
            raise SectionServiceError(
                "Skill does not belong to the job for this question set."
            )

        easy_count = _normalize_count(
            allocation.get("easy_count", 0),
            "Easy question count",
        )
        medium_count = _normalize_count(
            allocation.get("medium_count", 0),
            "Medium question count",
        )
        hard_count = _normalize_count(
            allocation.get("hard_count", 0),
            "Hard question count",
        )

        _validate_semantic_difficulty_allocation(
            normalized_type,
            easy_count,
            medium_count,
            hard_count,
        )

        if easy_count + medium_count + hard_count <= 0:
            raise SectionServiceError(
                "Each skill allocation must contain at least one question."
            )

        normalized_allocations.append(
            {
                "skill_id": skill_id,
                "easy_count": easy_count,
                "medium_count": medium_count,
                "hard_count": hard_count,
            }
        )

    section.name = normalized_name
    section.section_type = normalized_type
    section.difficulty = normalized_difficulty
    section.display_order = display_order

    try:
        db.query(QuestionSlot).filter(
            QuestionSlot.section_id == section.id
        ).delete(synchronize_session=False)

        db.query(SectionSkill).filter(
            SectionSkill.section_id == section.id
        ).delete(synchronize_session=False)

        for allocation in normalized_allocations:
            total = (
                allocation["easy_count"]
                + allocation["medium_count"]
                + allocation["hard_count"]
            )
            db.add(
                SectionSkill(
                    section_id=section.id,
                    skill_id=allocation["skill_id"],
                    easy_count=allocation["easy_count"],
                    medium_count=allocation["medium_count"],
                    hard_count=allocation["hard_count"],
                    question_count=total,
                )
            )

        db.commit()
        db.refresh(section)
        return section

    except SQLAlchemyError as exc:
        db.rollback()
        raise SectionServiceError("Unable to update section.") from exc
