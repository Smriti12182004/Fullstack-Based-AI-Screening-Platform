from datetime import datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Job, QuestionBank


class QuestionBankServiceError(Exception):
    """Base exception for question-bank failures."""


def create_question_bank(
    db: Session,
    job_id: int,
    hiring_year: int,
    name: str | None,
    description: str | None,
    created_by: int | None,
) -> QuestionBank:
    """
    Create one year-specific question bank for a job.
    """

    job = db.get(
        Job,
        job_id,
    )

    if job is None:
        raise QuestionBankServiceError(
            "Job not found."
        )

    existing_bank = (
        db.query(QuestionBank)
        .filter(
            QuestionBank.job_id == job_id,
            QuestionBank.hiring_year == hiring_year,
        )
        .first()
    )

    if existing_bank is not None:
        raise QuestionBankServiceError(
            "A question bank already exists for this job and hiring year."
        )

    normalized_name = (
        name.strip()
        if name is not None and name.strip()
        else f"{job.title} — {hiring_year} Question Bank"
    )

    normalized_description = (
        description.strip()
        if description is not None
        else None
    )

    bank = QuestionBank(
        job_id=job_id,
        hiring_year=hiring_year,
        name=normalized_name,
        description=normalized_description,
        status="active",
        created_by=created_by,
    )

    try:
        db.add(bank)
        db.commit()
        db.refresh(bank)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionBankServiceError(
            "Unable to create question bank."
        ) from exc

    return bank


def get_or_create_question_bank(
    db: Session,
    job_id: int,
    hiring_year: int | None = None,
    created_by: int | None = None,
) -> QuestionBank:
    """
    Return the yearly bank for a job, creating it when necessary.
    """

    job = db.get(
        Job,
        job_id,
    )

    if job is None:
        raise QuestionBankServiceError(
            "Job not found."
        )

    resolved_year = hiring_year

    if resolved_year is None:
        if job.created_at is not None:
            resolved_year = job.created_at.year
        else:
            resolved_year = datetime.now().year

    bank = (
        db.query(QuestionBank)
        .filter(
            QuestionBank.job_id == job_id,
            QuestionBank.hiring_year == resolved_year,
        )
        .first()
    )

    if bank is not None:
        return bank

    normalized_name = (
        f"{job.title} — {resolved_year} Question Bank"
    )

    bank = QuestionBank(
        job_id=job_id,
        hiring_year=resolved_year,
        name=normalized_name,
        description=(
            f"Year-specific screening question bank "
            f"for the {resolved_year} hiring cycle."
        ),
        status="active",
        created_by=created_by,
    )

    try:
        db.add(bank)
        db.commit()
        db.refresh(bank)

    except SQLAlchemyError as exc:
        db.rollback()

        existing_bank = (
            db.query(QuestionBank)
            .filter(
                QuestionBank.job_id == job_id,
                QuestionBank.hiring_year == resolved_year,
            )
            .first()
        )

        if existing_bank is not None:
            return existing_bank

        raise QuestionBankServiceError(
            "Unable to create question bank."
        ) from exc

    return bank


def get_question_bank(
    db: Session,
    question_bank_id: int,
) -> QuestionBank:
    bank = db.get(
        QuestionBank,
        question_bank_id,
    )

    if bank is None:
        raise QuestionBankServiceError(
            "Question bank not found."
        )

    return bank


def get_question_banks(
    db: Session,
    job_id: int | None = None,
    hiring_year: int | None = None,
) -> list[QuestionBank]:
    query = db.query(
        QuestionBank
    )

    if job_id is not None:
        query = query.filter(
            QuestionBank.job_id == job_id
        )

    if hiring_year is not None:
        query = query.filter(
            QuestionBank.hiring_year == hiring_year
        )

    return (
        query
        .order_by(
            QuestionBank.hiring_year.desc(),
            QuestionBank.created_at.desc(),
            QuestionBank.id.desc(),
        )
        .all()
    )