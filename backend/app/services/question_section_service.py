from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Question, QuestionSection, Section, SectionSkill


class QuestionSectionServiceError(Exception):
    """Base exception for question-to-section service failures."""


def add_question_to_section(
    db: Session,
    question_id: int,
    section_id: int,
) -> QuestionSection:
    """
    Add an approved question to a section.

    Rules:
    - Section must exist.
    - Question must exist.
    - Question must be approved.
    - Question skill must belong to the section's skill allocations.
    - Question difficulty must match the section difficulty.
    - Section must not be locked.
    - The same question cannot be added twice to the same section.
    - The selected skill cannot exceed its configured question count.
    """

    section = db.get(Section, section_id)

    if section is None:
        raise QuestionSectionServiceError(
            "Section not found."
        )

    question = db.get(Question, question_id)

    if question is None:
        raise QuestionSectionServiceError(
            "Question not found."
        )

    if question.status != "approved":
        raise QuestionSectionServiceError(
            "Only approved questions can be added to a section."
        )

    if question.difficulty != section.difficulty:
        raise QuestionSectionServiceError(
            "Question difficulty does not match the section difficulty."
        )

    if section.is_locked:
        raise QuestionSectionServiceError(
            "Cannot modify a locked section."
        )

    section_skill = (
        db.query(SectionSkill)
        .filter(
            SectionSkill.section_id == section_id,
            SectionSkill.skill_id == question.skill_id,
        )
        .first()
    )

    if section_skill is None:
        raise QuestionSectionServiceError(
            "Question skill is not allocated to this section."
        )

    if section_skill.question_count <= 0:
        raise QuestionSectionServiceError(
            "This skill has no questions allocated in the section."
        )

    existing = (
        db.query(QuestionSection)
        .filter(
            QuestionSection.question_id == question_id,
            QuestionSection.section_id == section_id,
        )
        .first()
    )

    if existing is not None:
        raise QuestionSectionServiceError(
            "Question is already added to this section."
        )

    current_skill_count = (
        db.query(func.count(QuestionSection.id))
        .join(
            Question,
            Question.id == QuestionSection.question_id,
        )
        .filter(
            QuestionSection.section_id == section_id,
            Question.skill_id == question.skill_id,
            Question.difficulty == section.difficulty,
        )
        .scalar()
    )

    if current_skill_count >= section_skill.question_count:
        raise QuestionSectionServiceError(
            f"The section already contains the maximum allowed "
            f"number of {section.difficulty} questions for this skill."
        )

    max_display_order = (
        db.query(func.max(QuestionSection.display_order))
        .filter(
            QuestionSection.section_id == section_id
        )
        .scalar()
    )

    next_display_order = (
        max_display_order + 1
        if max_display_order is not None
        else 1
    )

    question_section = QuestionSection(
        question_id=question_id,
        section_id=section_id,
        display_order=next_display_order,
    )

    try:
        db.add(question_section)
        db.commit()
        db.refresh(question_section)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionSectionServiceError(
            "Unable to add question to section."
        ) from exc

    return question_section