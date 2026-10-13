from sqlalchemy.orm import Session

from app.models import Question, QuestionVersion


class QuestionVersionServiceError(Exception):
    """Base exception for question-version service failures."""


def get_question_versions(
    db: Session,
    question_id: int,
) -> list[QuestionVersion]:
    """Return the complete version history for a question."""

    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionVersionServiceError(
            "Question not found."
        )

    return (
        db.query(QuestionVersion)
        .filter(
            QuestionVersion.question_id == question_id
        )
        .order_by(
            QuestionVersion.version.asc()
        )
        .all()
    )