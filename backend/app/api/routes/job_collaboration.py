from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.schemas.job_activity import JobActivityResponse
from app.schemas.job_collaboration import (
    CollaboratorUserResponse,
    JobCollaborationResponse,
    JobCollaborationUpdateRequest,
)
from app.services.job_activity_service import (
    get_job_activity,
)
from app.services.job_collaboration_service import (
    assign_job_collaborators,
    get_assignable_collaborators,
    get_job_collaboration,
)


router = APIRouter(
    prefix="/jobs",
    tags=["Job Collaboration"],
)


# ============================================================
# AVAILABLE COLLABORATORS
# ============================================================

@router.get(
    "/collaborators",
    response_model=list[CollaboratorUserResponse],
)
def get_collaborators(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    return get_assignable_collaborators(db)


# ============================================================
# GET CURRENT JOB COLLABORATION
# ============================================================

@router.get(
    "/{job_id}/collaboration",
    response_model=JobCollaborationResponse,
)
def get_collaboration(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    return get_job_collaboration(
        db=db,
        job_id=job_id,
        recruiter_id=current_user["user_id"],
    )


# ============================================================
# ASSIGN / UPDATE COLLABORATORS
# ============================================================

@router.put(
    "/{job_id}/collaboration",
    response_model=JobCollaborationResponse,
    status_code=status.HTTP_200_OK,
)
def update_collaboration(
    job_id: int,
    request: JobCollaborationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    return assign_job_collaborators(
        db=db,
        job_id=job_id,
        recruiter_id=current_user["user_id"],
        assessment_manager_id=request.assessment_manager_id,
        assessment_reviewer_id=request.assessment_reviewer_id,
    )


# ============================================================
# JOB ACTIVITY / AUDIT TRAIL
# ============================================================

@router.get(
    "/{job_id}/activity",
    response_model=list[JobActivityResponse],
)
def get_activity(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    return get_job_activity(
        db=db,
        job_id=job_id,
        recruiter_id=current_user["user_id"],
    )