from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Job, QuestionSet


class QuestionSetServiceError(Exception):
    """Base exception for question-set service failures."""


def create_question_set(
    db: Session,
    job_id: int,
    name: str,
    description: str | None,
    created_by: int,
) -> QuestionSet:
    """
    Create a new draft question set for a job.

    Rules:
    - Job must exist.
    - Question set name cannot be empty.
    - Set starts in draft state.
    - New sets start at version 1.
    """

    job = db.get(Job, job_id)

    if job is None:
        raise QuestionSetServiceError(
            "Job not found."
        )

    normalized_name = name.strip()

    if not normalized_name:
        raise QuestionSetServiceError(
            "Question set name cannot be empty."
        )

    normalized_description = (
        description.strip()
        if description is not None
        else None
    )

    question_set = QuestionSet(
        job_id=job_id,
        name=normalized_name,
        description=normalized_description,
        status="draft",
        version=1,
        created_by=created_by,
    )

    try:
        db.add(question_set)
        db.commit()
        db.refresh(question_set)
    except SQLAlchemyError as exc:
        db.rollback()
        raise QuestionSetServiceError(
            "Unable to create question set."
        ) from exc

    return question_set