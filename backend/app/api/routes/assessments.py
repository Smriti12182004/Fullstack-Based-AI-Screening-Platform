from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.assessment import Assessment
from app.models.attempt import Attempt
from app.core.dependencies import require_role

router = APIRouter(prefix="/assessments", tags=["Assessments"])


@router.get("/{assessment_id}")
def get_assessment_for_candidate(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    assessment = (
        db.query(Assessment)
        .filter(Assessment.id == assessment_id)
        .first()
    )

    if not assessment:
        raise HTTPException(
            status_code=404,
            detail="Assessment not found",
        )

    assigned_attempt = (
        db.query(Attempt)
        .filter(
            Attempt.assessment_id == assessment_id,
            Attempt.candidate_id == current_user["user_id"],
        )
        .first()
    )

    if not assigned_attempt:
        raise HTTPException(
            status_code=403,
            detail="Assessment not assigned to this candidate",
        )

    return {
        "assessment_id": assessment.id,
        "job_id": assessment.job_id,
        "title": assessment.title,
        "status": assessment.status,
        "attempt_id": assigned_attempt.id,
    }