from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
)


class QuestionSetConfigurationServiceError(Exception):
    pass


def _build_configuration_response(
    db: Session,
    configuration: QuestionSetConfiguration,
    sections: list[Section],
):
    section_question_count = sum(
        section.easy_count
        + section.medium_count
        + section.hard_count
        for section in sections
    )

    easy_count = sum(
        section.easy_count
        for section in sections
    )

    medium_count = sum(
        section.medium_count
        for section in sections
    )

    hard_count = sum(
        section.hard_count
        for section in sections
    )

    warnings: list[str] = []

    for section in sections:
        difficulty_requirements = {
            "easy": section.easy_count,
            "medium": section.medium_count,
            "hard": section.hard_count,
        }

        for difficulty, required_count in difficulty_requirements.items():
            if required_count == 0:
                continue

            available_count = (
                db.query(Question.id)
                .filter(
                    Question.skill_id == section.skill_id,
                    Question.difficulty == difficulty,
                    Question.status == "approved",
                )
                .count()
            )

            if available_count < required_count:
                warnings.append(
                    f"Section '{section.name}' requires "
                    f"{required_count} approved {difficulty} question(s), "
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


def get_question_set_configuration(
    db: Session,
    question_set_id: int,
):
    question_set = db.get(
        QuestionSet,
        question_set_id,
    )

    if question_set is None:
        raise QuestionSetConfigurationServiceError(
            "Question set not found."
        )

    configuration = (
        db.query(QuestionSetConfiguration)
        .filter(
            QuestionSetConfiguration.question_set_id
            == question_set_id
        )
        .first()
    )

    if configuration is None:
        raise QuestionSetConfigurationServiceError(
            "Assessment configuration not found."
        )

    sections = (
        db.query(Section)
        .filter(
            Section.question_set_id == question_set_id
        )
        .order_by(
            Section.display_order
        )
        .all()
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
):
    question_set = db.get(
        QuestionSet,
        question_set_id,
    )

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

    sections = (
        db.query(Section)
        .filter(
            Section.question_set_id == question_set_id
        )
        .order_by(
            Section.display_order
        )
        .all()
    )

    if not sections:
        raise QuestionSetConfigurationServiceError(
            "At least one section is required before configuring the assessment."
        )

    section_question_count = sum(
        section.easy_count
        + section.medium_count
        + section.hard_count
        for section in sections
    )

    if section_question_count != total_questions:
        raise QuestionSetConfigurationServiceError(
            "Total questions must equal the sum of all section difficulty counts."
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
                QuestionSetConfiguration.question_set_id
                == question_set_id
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

    except SQLAlchemyError:
        db.rollback()

        raise QuestionSetConfigurationServiceError(
            "Failed to save assessment configuration."
        )