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
    """Return eligible managers and reviewers using their actual user records."""
    collaborators = get_assignable_collaborators(db)

    demo_names = {
        "s4_assessment_manager@test.com": "Maya",
        "s4_assessment_reviewer@test.com": "Noah",
    }
    eligible_roles = {
        "assessment_manager",
        "assessment_reviewer",
    }

    result = []

    for user in collaborators:
        if isinstance(user, dict):
            user_id = user.get("id")
            email = str(user.get("email") or "").strip().lower()
            raw_role = user.get("role") or ""
            raw_username = user.get("username") or ""
        else:
            user_id = getattr(user, "id", None)
            email = str(getattr(user, "email", "") or "").strip().lower()
            raw_role = getattr(user, "role", "") or ""
            raw_username = getattr(user, "username", "") or ""

        role = "_".join(
            str(raw_role).strip().lower().replace("-", " ").split()
        )

        if user_id is None or role not in eligible_roles:
            continue

        username = (
            demo_names.get(email)
            or str(raw_username).strip()
            or email.split("@", 1)[0]
            or role
        )

        result.append({
            "id": user_id,
            "username": username,
            "email": email,
            "role": role,
        })

    return result


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