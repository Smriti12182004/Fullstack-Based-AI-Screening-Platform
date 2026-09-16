from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Job, JobSkill, JobSkillReview, Skill


class SkillReviewError(Exception):
    """Base exception for skill review failures."""


def get_or_create_review(
    db: Session,
    job_id: int,
) -> JobSkillReview:
    """Get the review record for a job or create a pending one."""
    review = (
        db.query(JobSkillReview)
        .filter(JobSkillReview.job_id == job_id)
        .first()
    )

    if review is not None:
        return review

    review = JobSkillReview(
        job_id=job_id,
        status="pending",
    )

    db.add(review)
    db.commit()
    db.refresh(review)

    return review


def get_job_skills(
    db: Session,
    job_id: int,
) -> list[Skill]:
    """Return the skills currently linked to a job."""
    return (
        db.query(Skill)
        .join(JobSkill, JobSkill.skill_id == Skill.id)
        .filter(JobSkill.job_id == job_id)
        .order_by(Skill.name)
        .all()
    )


def update_job_skills(
    db: Session,
    job: Job,
    skill_names: list[str],
    reviewer_id: int,
) -> list[Skill]:
    """
    Replace the job's current skill list with the recruiter's edited list.

    Editing a confirmed review returns it to pending so that the recruiter
    must explicitly confirm the updated skill scope again.
    """
    normalized_names: list[str] = []
    seen: set[str] = set()

    for name in skill_names:
        normalized_name = " ".join(name.strip().lower().split())

        if not normalized_name:
            continue

        if len(normalized_name) > 100:
            raise SkillReviewError(
                "Skill name must not exceed 100 characters."
            )

        if normalized_name in seen:
            continue

        seen.add(normalized_name)
        normalized_names.append(normalized_name)

    try:
        current_links = (
            db.query(JobSkill)
            .filter(JobSkill.job_id == job.id)
            .all()
        )

        for link in current_links:
            db.delete(link)

        final_skills: list[Skill] = []

        for skill_name in normalized_names:
            skill = (
                db.query(Skill)
                .filter(Skill.name == skill_name)
                .first()
            )

            if skill is None:
                skill = Skill(name=skill_name)
                db.add(skill)
                db.flush()

            db.add(
                JobSkill(
                    job_id=job.id,
                    skill_id=skill.id,
                )
            )

            final_skills.append(skill)

        review = get_or_create_review(db, job.id)

        review.status = "pending"
        review.reviewed_by = None
        review.reviewed_at = None

        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        raise SkillReviewError(
            "Unable to update the job skill list."
        ) from exc

    return final_skills


def confirm_job_skill_review(
    db: Session,
    job_id: int,
    reviewer_id: int,
) -> JobSkillReview:
    """Explicitly confirm the current skill list for a job."""
    review = get_or_create_review(db, job_id)

    review.status = "confirmed"
    review.reviewed_by = reviewer_id
    review.reviewed_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(review)
    except SQLAlchemyError as exc:
        db.rollback()
        raise SkillReviewError(
            "Unable to confirm the job skill review."
        ) from exc

    return review


def are_job_skills_confirmed(
    db: Session,
    job_id: int,
) -> bool:
    """
    Return True only when the job has an explicitly confirmed skill review.
    """
    review = (
        db.query(JobSkillReview)
        .filter(JobSkillReview.job_id == job_id)
        .first()
    )

    return review is not None and review.status == "confirmed"
