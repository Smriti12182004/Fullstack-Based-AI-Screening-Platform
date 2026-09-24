import re
from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Job, Question, Skill
from app.services.llm_service import (
    LLMServiceError,
    generate_questions_from_skills,
)
from app.services.skill_review_service import (
    are_job_skills_confirmed,
    get_job_skills,
)


class QuestionServiceError(Exception):
    """Base exception for question-bank service failures."""


MAX_GENERATED_QUESTIONS = 20


def _normalize_question_text(question_text: str) -> str:
    """Normalize question text for reliable duplicate detection."""
    normalized = " ".join(
        question_text.strip().lower().split()
    )

    normalized = re.sub(
        r"[?.!]+$",
        "",
        normalized,
    )

    return normalized


def _get_existing_question_keys(
    db: Session,
) -> set[str]:
    """Return normalized question-text keys already present in the question bank."""
    existing_questions = (
        db.query(Question.question_text)
        .all()
    )

    return {
        _normalize_question_text(question_text)
        for question_text, in existing_questions
        if question_text and question_text.strip()
    }


def create_question(
    db: Session,
    question_text: str,
    question_type: str,
    skill_id: int,
    difficulty: str,
    options: list[str] | None = None,
    correct_answer: str | None = None,
    created_by: int | None = None,
) -> Question:
    """
    Create and persist a question-bank record.

    Newly created questions enter the maker-checker workflow
    in pending_review status.
    """
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

    if normalized_difficulty not in {
        "easy",
        "medium",
        "hard",
    }:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    skill = db.get(
        Skill,
        skill_id,
    )

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
        status="pending_review",
        source="manual",
        explanation=None,
        created_by=created_by,
        reviewed_by=None,
        reviewed_at=None,
        rejection_reason=None,
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
    updated_by: int | None = None,
) -> Question:
    """
    Update an existing question.

    Any content update sends the question back through
    the maker-checker workflow.
    """
    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionServiceError(
            "Question not found."
        )

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

    final_skill_id = (
        skill_id
        if skill_id is not None
        else question.skill_id
    )

    if not normalized_text:
        raise QuestionServiceError(
            "Question text cannot be empty."
        )

    if normalized_type not in {"MCQ", "FREE_TEXT"}:
        raise QuestionServiceError(
            "Question type must be MCQ or FREE_TEXT."
        )

    if normalized_difficulty not in {
        "easy",
        "medium",
        "hard",
    }:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    skill = db.get(
        Skill,
        final_skill_id,
    )

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

    question.question_text = normalized_text
    question.question_type = normalized_type
    question.skill_id = final_skill_id
    question.difficulty = normalized_difficulty
    question.options = options
    question.correct_answer = correct_answer

    # Any edit requires a fresh review.
    question.status = "pending_review"
    question.reviewed_by = None
    question.reviewed_at = None
    question.rejection_reason = None

    try:
        db.commit()
        db.refresh(question)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to update question."
        ) from exc

    return question


def generate_questions(
    db: Session,
    job_id: int,
    skill_ids: list[int] | None,
    number_of_questions: int,
    difficulty: str,
    created_by: int | None = None,
) -> list[Question]:
    """Generate AI-created MCQs from the confirmed skills for a job."""
    job = db.get(
        Job,
        job_id,
    )

    if job is None:
        raise QuestionServiceError(
            "Job not found."
        )

    if not are_job_skills_confirmed(
        db,
        job_id,
    ):
        raise QuestionServiceError(
            "Questions can only be generated after the job skills are confirmed."
        )

    if not isinstance(number_of_questions, int):
        raise QuestionServiceError(
            "Number of questions must be an integer."
        )

    if (
        number_of_questions < 1
        or number_of_questions > MAX_GENERATED_QUESTIONS
    ):
        raise QuestionServiceError(
            f"Number of questions must be between "
            f"1 and {MAX_GENERATED_QUESTIONS}."
        )

    normalized_difficulty = difficulty.strip().lower()

    if normalized_difficulty not in {
        "easy",
        "medium",
        "hard",
    }:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    confirmed_skills = get_job_skills(
        db,
        job_id,
    )

    if not confirmed_skills:
        raise QuestionServiceError(
            "No confirmed skills are available for this job."
        )

    confirmed_by_id = {
        skill.id: skill
        for skill in confirmed_skills
    }

    if skill_ids is None:
        selected_skills = confirmed_skills

    else:
        if not skill_ids:
            raise QuestionServiceError(
                "At least one confirmed skill must be selected."
            )

        selected_skills = []
        seen_ids: set[int] = set()

        for selected_skill_id in skill_ids:
            if selected_skill_id in seen_ids:
                continue

            skill = confirmed_by_id.get(
                selected_skill_id
            )

            if skill is None:
                raise QuestionServiceError(
                    "Selected skill is not part of the confirmed skills for this job."
                )

            seen_ids.add(selected_skill_id)
            selected_skills.append(skill)

    skill_context = [
        {
            "skill_id": skill.id,
            "skill_name": skill.name,
            "category":"Other",
        }
        for skill in selected_skills
    ]

    try:
        generated_questions = generate_questions_from_skills(
            skills=skill_context,
            number_of_questions=number_of_questions,
            difficulty=normalized_difficulty,
        )

    except LLMServiceError:
        raise

    except ValueError as exc:
        raise QuestionServiceError(
            str(exc)
        ) from exc

    skill_id_by_name = {
        " ".join(
            skill.name.strip().lower().split()
        ): skill.id
        for skill in selected_skills
    }

    existing_question_keys = _get_existing_question_keys(
        db
    )

    questions: list[Question] = []
    batch_question_keys: set[str] = set()

    try:
        for generated in generated_questions:

            skill_key = " ".join(
                generated.skill_name.strip().lower().split()
            )

            generated_skill_id = skill_id_by_name.get(
                skill_key
            )

            if generated_skill_id is None:
                raise QuestionServiceError(
                    "Generated question referenced an unapproved skill."
                )

            question_key = _normalize_question_text(
                generated.question_text
            )

            if not question_key:
                raise QuestionServiceError(
                    "Generated question text cannot be empty."
                )

            if question_key in existing_question_keys:
                raise QuestionServiceError(
                    "Generated question duplicates an existing question in the question bank."
                )

            if question_key in batch_question_keys:
                raise QuestionServiceError(
                    "Generated questions contain duplicate question text."
                )

            batch_question_keys.add(
                question_key
            )

            question = Question(
                question_text=generated.question_text,
                question_type="MCQ",
                skill_id=generated_skill_id,
                difficulty=generated.difficulty,
                options=generated.options,
                correct_answer=generated.correct_answer,
                status="pending_review",
                source="ai_generated",
                explanation=generated.explanation,
                created_by=created_by,
                reviewed_by=None,
                reviewed_at=None,
                rejection_reason=None,
            )

            db.add(question)
            questions.append(question)

        db.commit()

        for question in questions:
            db.refresh(question)

    except QuestionServiceError:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to persist generated questions."
        ) from exc

    return questions


def approve_question(
    db: Session,
    question_id: int,
    reviewer_id: int,
) -> Question:
    """Approve a question that is currently pending review."""
    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionServiceError(
            "Question not found."
        )

    if question.status != "pending_review":
        raise QuestionServiceError(
            "Only questions pending review can be approved."
        )

    if question.created_by == reviewer_id:
        raise QuestionServiceError(
            "The question creator cannot approve their own question."
        )

    question.status = "approved"
    question.reviewed_by = reviewer_id
    question.reviewed_at = datetime.now(timezone.utc)
    question.rejection_reason = None

    try:
        db.commit()
        db.refresh(question)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to approve question."
        ) from exc

    return question


def reject_question(
    db: Session,
    question_id: int,
    reviewer_id: int,
    rejection_reason: str,
) -> Question:
    """Reject a question that is currently pending review."""
    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionServiceError(
            "Question not found."
        )

    if question.status != "pending_review":
        raise QuestionServiceError(
            "Only questions pending review can be rejected."
        )

    if question.created_by == reviewer_id:
        raise QuestionServiceError(
            "The question creator cannot reject their own question."
        )

    normalized_reason = rejection_reason.strip()

    if not normalized_reason:
        raise QuestionServiceError(
            "Rejection reason is required."
        )

    question.status = "rejected"
    question.reviewed_by = reviewer_id
    question.reviewed_at = datetime.now(timezone.utc)
    question.rejection_reason = normalized_reason

    try:
        db.commit()
        db.refresh(question)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to reject question."
        ) from exc

    return question