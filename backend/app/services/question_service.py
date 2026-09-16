from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Question, Skill


class QuestionServiceError(Exception):
    """Base exception for question-bank service failures."""


def create_question(
    db: Session,
    question_text: str,
    question_type: str,
    skill_id: int,
    difficulty: str,
    options: list[str] | None = None,
    correct_answer: str | None = None,
) -> Question:
    """Create and persist a question-bank record."""

    normalized_type = question_type.strip().upper()
    normalized_difficulty = difficulty.strip().lower()
    normalized_text = question_text.strip()

    if not normalized_text:
        raise QuestionServiceError(
            "Question text cannot be empty."
        )

    if normalized_type not in {"MCQ", "FREE_TEXT"}:
        raise QuestionServiceError(
            "Question type must be MCQ or FREE_TEXT."
        )

    if normalized_difficulty not in {"easy", "medium", "hard"}:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    skill = db.get(Skill, skill_id)

    if skill is None:
        raise QuestionServiceError(
            "Skill not found."
        )

    if normalized_type == "MCQ":
        if not options or len(options) < 2:
            raise QuestionServiceError(
                "MCQ questions must have at least two options."
            )

        if not correct_answer or correct_answer not in options:
            raise QuestionServiceError(
                "MCQ correct answer must match one of the options."
            )

    else:
        options = None
        correct_answer = None

    question = Question(
        question_text=normalized_text,
        question_type=normalized_type,
        skill_id=skill_id,
        difficulty=normalized_difficulty,
        options=options,
        correct_answer=correct_answer,
    )

    try:
        db.add(question)
        db.commit()
        db.refresh(question)
    except SQLAlchemyError as exc:
        db.rollback()
        raise QuestionServiceError(
            "Unable to create question."
        ) from exc

    return question
def get_questions(
    db: Session,
    skill_id: int | None = None,
    question_type: str | None = None,
    difficulty: str | None = None,
) -> list[Question]:
    """Retrieve questions with optional filters."""

    query = db.query(Question)

    if skill_id is not None:
        query = query.filter(
            Question.skill_id == skill_id
        )

    if question_type is not None:
        normalized_type = question_type.strip().upper()

        if normalized_type not in {"MCQ", "FREE_TEXT"}:
            raise QuestionServiceError(
                "Question type must be MCQ or FREE_TEXT."
            )

        query = query.filter(
            Question.question_type == normalized_type
        )

    if difficulty is not None:
        normalized_difficulty = difficulty.strip().lower()

        if normalized_difficulty not in {
            "easy",
            "medium",
            "hard",
        }:
            raise QuestionServiceError(
                "Difficulty must be easy, medium, or hard."
            )

        query = query.filter(
            Question.difficulty == normalized_difficulty
        )

    return query.order_by(Question.id).all()
def update_question(
    db: Session,
    question_id: int,
    question_text: str | None = None,
    question_type: str | None = None,
    skill_id: int | None = None,
    difficulty: str | None = None,
    options: list[str] | None = None,
    correct_answer: str | None = None,
) -> Question:
    question = db.get(Question, question_id)

    if question is None:
        raise QuestionServiceError("Question not found.")

    normalized_type = (
        question_type.strip().upper()
        if question_type is not None
        else question.question_type
    )

    normalized_difficulty = (
        difficulty.strip().lower()
        if difficulty is not None
        else question.difficulty
    )

    normalized_text = (
        question_text.strip()
        if question_text is not None
        else question.question_text
    )

    final_skill_id = skill_id if skill_id is not None else question.skill_id

    if not normalized_text:
        raise QuestionServiceError("Question text cannot be empty.")

    if normalized_type not in {"MCQ", "FREE_TEXT"}:
        raise QuestionServiceError(
            "Question type must be MCQ or FREE_TEXT."
        )

    if normalized_difficulty not in {"easy", "medium", "hard"}:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    skill = db.get(Skill, final_skill_id)

    if skill is None:
        raise QuestionServiceError("Skill not found.")

    if normalized_type == "MCQ":
        if not options or len(options) < 2:
            raise QuestionServiceError(
                "MCQ questions must have at least two options."
            )

        if not correct_answer or correct_answer not in options:
            raise QuestionServiceError(
                "MCQ correct answer must match one of the options."
            )
    else:
        options = None
        correct_answer = None

    question.question_text = normalized_text
    question.question_type = normalized_type
    question.skill_id = final_skill_id
    question.difficulty = normalized_difficulty
    question.options = options
    question.correct_answer = correct_answer

    try:
        db.commit()
        db.refresh(question)
    except SQLAlchemyError as exc:
        db.rollback()
        raise QuestionServiceError(
            "Unable to update question."
        ) from exc

    return question