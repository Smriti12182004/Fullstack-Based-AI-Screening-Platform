from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import AuditEvent, Job


def get_job_activity(
    db: Session,
    job_id: int,
    recruiter_id: int,
) -> list[AuditEvent]:
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

    return (
        db.query(AuditEvent)
        .filter(
            AuditEvent.entity_type == "job",
            AuditEvent.entity_id == job.id,
        )
        .order_by(
            AuditEvent.created_at.desc(),
            AuditEvent.id.desc(),
        )
        .limit(100)
        .all()
    )