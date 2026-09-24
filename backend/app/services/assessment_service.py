from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    Assessment,
    AssessmentQuestion,
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
)


class AssessmentServiceError(Exception):
    """Base exception for assessment service failures."""


def assemble_assessment(
    db: Session,
    question_set_id: int,
    title: str,
) -> Assessment:
    """
    Automatically assemble a final assessment from a question set.

    Rules:
    - Question set must exist.
    - Assessment configuration must exist.
    - At least one section must exist.
    - Only approved questions can be selected.
    - Questions are selected by section skill and difficulty.
    - Each section must satisfy its configured easy/medium/hard counts.
    - No question can appear twice in the final assessment.
    - The final number of questions must match the configuration.
    - The exact approved question content is snapshotted into the
      assessment so later question-bank edits do not change this
      finalized assessment.
    """

    question_set = db.get(
        QuestionSet,
        question_set_id,
    )

    if question_set is None:
        raise AssessmentServiceError(
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
        raise AssessmentServiceError(
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

    if not sections:
        raise AssessmentServiceError(
            "At least one section is required before assembling the assessment."
        )

    normalized_title = title.strip()

    if not normalized_title:
        raise AssessmentServiceError(
            "Assessment title cannot be empty."
        )

    selected_question_ids: set[int] = set()
    selected_questions: list[Question] = []

    for section in sections:
        difficulty_requirements = {
            "easy": section.easy_count,
            "medium": section.medium_count,
            "hard": section.hard_count,
        }

        for difficulty, required_count in difficulty_requirements.items():
            if required_count == 0:
                continue

            available_questions = (
                db.query(Question)
                .filter(
                    Question.skill_id == section.skill_id,
                    Question.difficulty == difficulty,
                    Question.status == "approved",
                )
                .order_by(
                    Question.id
                )
                .all()
            )

            available_questions = [
                question
                for question in available_questions
                if question.id not in selected_question_ids
            ]

            if len(available_questions) < required_count:
                raise AssessmentServiceError(
                    f"Section '{section.name}' requires "
                    f"{required_count} approved {difficulty} question(s), "
                    f"but only {len(available_questions)} are available."
                )

            selected_for_requirement = available_questions[
                :required_count
            ]

            for question in selected_for_requirement:
                if question.id in selected_question_ids:
                    raise AssessmentServiceError(
                        "Duplicate question detected during assessment assembly."
                    )

                selected_question_ids.add(question.id)
                selected_questions.append(question)

    if len(selected_questions) != configuration.total_questions:
        raise AssessmentServiceError(
            "Assembled question count does not match the configured total."
        )

    try:
        assessment = Assessment(
            job_id=question_set.job_id,
            title=normalized_title,
            status="ready",
        )

        db.add(assessment)
        db.flush()

        for display_order, question in enumerate(
            selected_questions,
            start=1,
        ):
            assessment_question = AssessmentQuestion(
                assessment_id=assessment.id,
                question_id=question.id,
                display_order=display_order,
                question_text=question.question_text,
                question_type=question.question_type,
                skill_id=question.skill_id,
                difficulty=question.difficulty,
                options=question.options,
                correct_answer=question.correct_answer,
                explanation=question.explanation,
            )

            db.add(assessment_question)

        db.commit()
        db.refresh(assessment)

    except SQLAlchemyError as exc:
        db.rollback()
        raise AssessmentServiceError(
            "Unable to assemble assessment."
        ) from exc

    return assessment