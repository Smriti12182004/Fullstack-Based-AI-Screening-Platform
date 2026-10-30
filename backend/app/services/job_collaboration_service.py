import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    Job,
    JobAssessmentAccess,
    User,
)
from app.services.email_service import (
    EmailServiceError,
    send_job_collaboration_email,
)
from app.services.notification_service import (
    create_job_collaboration_notification,
)


from app.services.job_lifecycle_service import get_job_workflow_status


logger = logging.getLogger(__name__)


ASSESSMENT_MANAGER_ROLE = "assessment_manager"
ASSESSMENT_REVIEWER_ROLE = "assessment_reviewer"


def _normalise_role(
    role: str | None,
) -> str:
    if not role:
        return ""

    return (
        role.strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )


def _get_owned_job(
    db: Session,
    job_id: int,
    recruiter_id: int,
) -> Job:
    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == recruiter_id,
        )
        .first()
    )

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return job


def get_assignable_collaborators(
    db: Session,
) -> list[User]:
    return (
        db.query(User)
        .filter(
            func.lower(
                func.trim(User.role)
            ).in_(
                [
                    ASSESSMENT_MANAGER_ROLE,
                    ASSESSMENT_REVIEWER_ROLE,
                ]
            )
        )
        .order_by(
            User.role.asc(),
            User.username.asc(),
            User.id.asc(),
        )
        .all()
    )


def get_job_collaboration(
    db: Session,
    job_id: int,
    recruiter_id: int,
) -> dict:
    job = _get_owned_job(
        db=db,
        job_id=job_id,
        recruiter_id=recruiter_id,
    )

    accesses = (
        db.query(JobAssessmentAccess)
        .join(
            User,
            User.id == JobAssessmentAccess.user_id,
        )
        .filter(
            JobAssessmentAccess.job_id == job.id,
        )
        .all()
    )

    result = {
        "job_id": job.id,
        "assessment_manager": None,
        "assessment_reviewer": None,
    }

    for access in accesses:
        user = access.user
        role = _normalise_role(user.role)

        if role == ASSESSMENT_MANAGER_ROLE:
            result["assessment_manager"] = user

        elif role == ASSESSMENT_REVIEWER_ROLE:
            result["assessment_reviewer"] = user

    return result


def assign_job_collaborators(
    db: Session,
    job_id: int,
    recruiter_id: int,
    assessment_manager_id: int,
    assessment_reviewer_id: int,
) -> dict:
    job = _get_owned_job(
        db=db,
        job_id=job_id,
        recruiter_id=recruiter_id,
    )

    if get_job_workflow_status(db, job.id) == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This job's assessment workflow is completed. "
                "Assessment Manager and Assessment Reviewer assignments "
                "are locked."
            ),
        )

    if assessment_manager_id == assessment_reviewer_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Assessment Manager and Assessment Reviewer "
                "must be different users."
            ),
        )

    manager = db.get(
        User,
        assessment_manager_id,
    )

    if manager is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment Manager not found",
        )

    if (
        _normalise_role(manager.role)
        != ASSESSMENT_MANAGER_ROLE
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Selected Assessment Manager does not have "
                "the assessment_manager role."
            ),
        )

    reviewer = db.get(
        User,
        assessment_reviewer_id,
    )

    if reviewer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment Reviewer not found",
        )

    if (
        _normalise_role(reviewer.role)
        != ASSESSMENT_REVIEWER_ROLE
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Selected Assessment Reviewer does not have "
                "the assessment_reviewer role."
            ),
        )

    previous_accesses = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == job.id,
        )
        .all()
    )

    previous_manager_id = None
    previous_reviewer_id = None

    for access in previous_accesses:
        assigned_user = db.get(
            User,
            access.user_id,
        )

        if assigned_user is None:
            continue

        role = _normalise_role(
            assigned_user.role
        )

        if role == ASSESSMENT_MANAGER_ROLE:
            previous_manager_id = assigned_user.id

        elif role == ASSESSMENT_REVIEWER_ROLE:
            previous_reviewer_id = assigned_user.id

    previous_access_ids = [
        access.id
        for access in previous_accesses
    ]

    if previous_access_ids:
        (
            db.query(JobAssessmentAccess)
            .filter(
                JobAssessmentAccess.id.in_(
                    previous_access_ids
                )
            )
            .delete(
                synchronize_session=False
            )
        )

    db.add(
        JobAssessmentAccess(
            job_id=job.id,
            user_id=manager.id,
            assigned_by=recruiter_id,
        )
    )

    db.add(
        JobAssessmentAccess(
            job_id=job.id,
            user_id=reviewer.id,
            assigned_by=recruiter_id,
        )
    )

    # ---------------------------------------------------------
    # In-app notifications
    # ---------------------------------------------------------

    if previous_manager_id != manager.id:
        create_job_collaboration_notification(
            db=db,
            user_id=manager.id,
            job_id=job.id,
            job_title=job.title,
            collaborator_role=ASSESSMENT_MANAGER_ROLE,
        )

    if previous_reviewer_id != reviewer.id:
        create_job_collaboration_notification(
            db=db,
            user_id=reviewer.id,
            job_id=job.id,
            job_title=job.title,
            collaborator_role=ASSESSMENT_REVIEWER_ROLE,
        )

    # ---------------------------------------------------------
    # Audit event
    # ---------------------------------------------------------

    audit_details = {
        "previous_assessment_manager_id": (
            previous_manager_id
        ),
        "previous_assessment_reviewer_id": (
            previous_reviewer_id
        ),
        "assessment_manager_id": manager.id,
        "assessment_reviewer_id": reviewer.id,
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat(),
    }

    db.add(
        AuditEvent(
            user_id=recruiter_id,
            action="JOB_COLLABORATORS_UPDATED",
            entity_type="job",
            entity_id=job.id,
            details=json.dumps(
                audit_details
            ),
        )
    )

    # ---------------------------------------------------------
    # Persist database transaction
    # ---------------------------------------------------------

    db.commit()

    # ---------------------------------------------------------
    # Email notifications
    #
    # Email failures are deliberately non-fatal.
    # The assignment and in-app notifications remain saved.
    # ---------------------------------------------------------

    if previous_manager_id != manager.id:
        try:
            send_job_collaboration_email(
                to_email=manager.email,
                recipient_name=manager.username,
                job_title=job.title,
                collaborator_role=(
                    ASSESSMENT_MANAGER_ROLE
                ),
            )

        except EmailServiceError:
            logger.exception(
                "Unable to send Assessment Manager "
                "assignment email for job %s",
                job.id,
            )

    if previous_reviewer_id != reviewer.id:
        try:
            send_job_collaboration_email(
                to_email=reviewer.email,
                recipient_name=reviewer.username,
                job_title=job.title,
                collaborator_role=(
                    ASSESSMENT_REVIEWER_ROLE
                ),
            )

        except EmailServiceError:
            logger.exception(
                "Unable to send Assessment Reviewer "
                "assignment email for job %s",
                job.id,
            )

    return get_job_collaboration(
        db=db,
        job_id=job.id,
        recruiter_id=recruiter_id,
    )