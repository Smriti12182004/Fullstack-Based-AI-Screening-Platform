from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Question, QuestionSection, Section


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
    - Question skill must match the section skill.
    - Section must not be locked.
    - The same question cannot be added twice to the same section.
    - The section's easy/medium/hard limits cannot be exceeded.
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

    if question.skill_id != section.skill_id:
        raise QuestionSectionServiceError(
            "Question skill does not match the section skill."
        )

    if section.is_locked:
        raise QuestionSectionServiceError(
            "Cannot modify a locked section."
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

    current_difficulty_count = (
        db.query(func.count(QuestionSection.id))
        .join(
            Question,
            Question.id == QuestionSection.question_id,
        )
        .filter(
            QuestionSection.section_id == section_id,
            Question.difficulty == question.difficulty,
        )
        .scalar()
    )

    difficulty_limits = {
        "easy": section.easy_count,
        "medium": section.medium_count,
        "hard": section.hard_count,
    }

    difficulty_limit = difficulty_limits[question.difficulty]

    if current_difficulty_count >= difficulty_limit:
        raise QuestionSectionServiceError(
            f"The section already contains the maximum allowed "
            f"number of {question.difficulty} questions."
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