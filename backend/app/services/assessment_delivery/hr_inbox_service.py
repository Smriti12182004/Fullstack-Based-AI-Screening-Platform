from __future__ import annotations

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models import (
    Assessment,
    Job,
    QuestionSet,
    QuestionSetConfiguration,
)
from app.models.assessment_set import AssessmentSet


class AssessmentHRInboxServiceError(Exception):
    """Raised when the HR assessment inbox cannot be loaded."""


def get_hr_assessment_inbox(
    db: Session,
    recruiter_id: int,
) -> list[dict]:
    """
    Return approved assessment variants grouped later by the frontend at the
    job level.

    A job enters the HR inbox when at least one approved AssessmentSet has
    been explicitly handed off to this recruiter. Once the job is in the
    inbox, all reviewer-approved variants for that same job are returned so
    HR can see the complete assessment package in one place.

    Individual variants still carry their own handoff state:

    - sent_to_hr == True: ready for HR delivery configuration
    - sent_to_hr == False: approved companion variant awaiting reviewer handoff

    Rejected/draft/submitted variants are not exposed as delivery candidates.
    """

    if recruiter_id <= 0:
        raise AssessmentHRInboxServiceError(
            "Invalid recruiter identity.",
        )

    rows = (
        db.query(
            AssessmentSet,
            Assessment,
            Job,
            QuestionSetConfiguration,
        )
        .join(
            QuestionSet,
            QuestionSet.id == AssessmentSet.question_set_id,
        )
        .join(
            Job,
            Job.id == QuestionSet.job_id,
        )
        .outerjoin(
            Assessment,
            and_(
                Assessment.question_set_id
                == AssessmentSet.question_set_id,
                Assessment.variant_number
                == AssessmentSet.variant_number,
            ),
        )
        .outerjoin(
            QuestionSetConfiguration,
            QuestionSetConfiguration.question_set_id
            == QuestionSet.id,
        )
        .filter(
            AssessmentSet.status == "approved",
            Job.created_by == recruiter_id,
        )
        .order_by(
            Job.id.asc(),
            AssessmentSet.variant_number.asc(),
            AssessmentSet.id.asc(),
        )
        .all()
    )

    if not rows:
        return []

    handed_off_job_ids = {
        job.id
        for (
            assessment_set,
            _assessment,
            job,
            _configuration,
        ) in rows
        if assessment_set.sent_to_hr_at is not None
    }

    if not handed_off_job_ids:
        return []

    items: list[dict] = []

    for (
        assessment_set,
        assessment,
        job,
        configuration,
    ) in rows:
        if job.id not in handed_off_job_ids:
            continue

        if (
            configuration is not None
            and configuration.total_questions is not None
        ):
            question_count = int(
                configuration.total_questions
            )
        elif assessment is not None:
            question_count = len(
                assessment.assessment_questions
            )
        else:
            question_count = 0

        items.append(
            {
                "assessment_set_id": assessment_set.id,
                "assessment_id": (
                    assessment.id
                    if assessment is not None
                    else None
                ),
                "job_id": job.id,
                "job_title": job.title,
                "question_set_id": assessment_set.question_set_id,
                "title": (
                    assessment.title
                    if assessment is not None
                    else (
                        f"{job.title} — "
                        f"Set {assessment_set.variant_number}"
                    )
                ),
                "label": assessment_set.label,
                "variant_number": assessment_set.variant_number,
                "assessment_status": (
                    assessment.status
                    if assessment is not None
                    else None
                ),
                "review_status": "approved",
                "sent_to_hr": assessment_set.sent_to_hr_at is not None,
                "sent_to_hr_at": assessment_set.sent_to_hr_at,
                "question_count": question_count,
                "duration_minutes": (
                    int(configuration.duration_minutes)
                    if configuration is not None
                    and configuration.duration_minutes is not None
                    else None
                ),
            }
        )

    return items