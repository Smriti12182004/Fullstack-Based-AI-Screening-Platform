from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import JobSkillReview, QuestionSet, Section, Skill


class SectionServiceError(Exception):
    """Base exception for section service failures."""


def create_section(
    db: Session,
    question_set_id: int,
    skill_id: int,
    name: str,
    display_order: int,
    easy_count: int,
    medium_count: int,
    hard_count: int,
) -> Section:
    """
    Create a section for a question set.

    Rules:
    - Question set must exist.
    - Skill must exist.
    - Skill must belong to the job associated with the question set.
    - The skill must be confirmed for that job.
    - Section name cannot be empty.
    - Question counts cannot be negative.
    - Total requested questions must be greater than zero.
    - One skill can only have one section in a question set.
    """

    question_set = db.get(QuestionSet, question_set_id)

    if question_set is None:
        raise SectionServiceError(
            "Question set not found."
        )

    skill = db.get(Skill, skill_id)

    if skill is None:
        raise SectionServiceError(
            "Skill not found."
        )

    if not name.strip():
        raise SectionServiceError(
            "Section name cannot be empty."
        )

    if display_order < 1:
        raise SectionServiceError(
            "Display order must be at least 1."
        )

    if (
        easy_count < 0
        or medium_count < 0
        or hard_count < 0
    ):
        raise SectionServiceError(
            "Question counts cannot be negative."
        )

    total_question_count = (
        easy_count
        + medium_count
        + hard_count
    )

    if total_question_count == 0:
        raise SectionServiceError(
            "Section must contain at least one question."
        )

    job_has_skill = any(
        job_skill.id == skill.id
        for job_skill in question_set.job.skills
    )

    if not job_has_skill:
        raise SectionServiceError(
            "Skill does not belong to the job for this question set."
        )

    skill_review = (
        db.query(JobSkillReview)
        .filter(
            JobSkillReview.job_id == question_set.job_id
        )
        .first()
    )

    if skill_review is None or skill_review.status != "confirmed":
        raise SectionServiceError(
            "The job's skills must be confirmed before creating sections."
        )

    existing_section = (
        db.query(Section)
        .filter(
            Section.question_set_id == question_set_id,
            Section.skill_id == skill_id,
        )
        .first()
    )

    if existing_section is not None:
        raise SectionServiceError(
            "A section for this skill already exists in the question set."
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

    section = Section(
        question_set_id=question_set_id,
        skill_id=skill_id,
        name=name.strip(),
        display_order=display_order,
        easy_count=easy_count,
        medium_count=medium_count,
        hard_count=hard_count,
        is_locked=False,
    )

    try:
        db.add(section)
        db.commit()
        db.refresh(section)

    except SQLAlchemyError as exc:
        db.rollback()

        raise SectionServiceError(
            "Unable to create section."
        ) from exc

    return section