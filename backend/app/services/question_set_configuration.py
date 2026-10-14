from sqlalchemy.orm import Session

from app.services.question_set_configuration_service import (
    QuestionSetConfigurationServiceError,
    configure_question_set as _configure_question_set,
    get_question_set_configuration,
)


class LegacyQuestionSetConfigurationServiceError(
    QuestionSetConfigurationServiceError
):
    """
    Backward-compatible exception type for legacy imports.
    """


def configure_question_set(
    db: Session,
    question_set_id: int,
    total_questions: int,
    duration_minutes: int,
    candidate_instructions: str | None,
):
    """
    Backward-compatible wrapper around the current question-set
    configuration service.

    The current implementation uses:

    Section
        -> difficulty
        -> SectionSkill
            -> skill_id
            -> question_count
    """

    try:
        return _configure_question_set(
            db=db,
            question_set_id=question_set_id,
            total_questions=total_questions,
            duration_minutes=duration_minutes,
            candidate_instructions=candidate_instructions,
        )

    except QuestionSetConfigurationServiceError as exc:
        raise LegacyQuestionSetConfigurationServiceError(
            str(exc)
        ) from exc


__all__ = [
    "LegacyQuestionSetConfigurationServiceError",
    "QuestionSetConfigurationServiceError",
    "configure_question_set",
    "get_question_set_configuration",
]