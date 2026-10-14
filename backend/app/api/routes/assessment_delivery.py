from app.services.assessment_review_service import (
    AssessmentReviewServiceError,
    publish_assessment,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role
from app.db.session import get_db
from app.models import (
    Assessment,
    AssessmentAssignment,
    Job,
    JobAssessmentAccess,
)
from app.schemas.assessment_delivery import (
    AssessmentAssignmentCreateRequest,
    AssessmentAssignmentResponse,
    AssessmentAssignmentListResponse,
)
from app.services.assessment_delivery.assignment_service import (
    AssessmentAssignmentServiceError,
    create_assignment,
    get_assessment_assignments,
)


router = APIRouter(
    prefix="/assessment-delivery",
    tags=["Assessment Delivery"],
)


def _get_authorized_assessment(
    db: Session,
    assessment_id: int,
    current_user: dict,
) -> Assessment:
    assessment = db.get(
        Assessment,
        assessment_id,
    )

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    user_id = current_user["user_id"]
    role = current_user.get("role")

    job = db.get(
        Job,
        assessment.job_id,
    )

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment job not found",
        )

    if role == "recruiter":
        if job.created_by != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not allowed to assign this "
                    "assessment."
                ),
            )

    elif role == "assessment_manager":
        access = (
            db.query(JobAssessmentAccess)
            .filter(
                JobAssessmentAccess.job_id == assessment.job_id,
                JobAssessmentAccess.user_id == user_id,
            )
            .first()
        )

        if access is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not authorized to assign "
                    "this assessment."
                ),
            )

    return assessment


@router.post(
    "/assessments/{assessment_id}/assignments",
    response_model=AssessmentAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_assessment(
    assessment_id: int,
    request: AssessmentAssignmentCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "recruiter",
            "assessment_manager",
        )
    ),
):
    """
    Assign a published, reviewer-approved assessment to a candidate.

    This creates an AssessmentAssignment only.

    An Attempt is created later when the candidate actually starts
    the assessment.
    """

    assessment = _get_authorized_assessment(
        db=db,
        assessment_id=assessment_id,
        current_user=current_user,
    )

    if assessment.status != "published":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Only published assessments can be assigned "
                "to candidates."
            ),
        )

    if assessment.review_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Only reviewer-approved assessments can be "
                "assigned to candidates."
            ),
        )

    try:
        assignment = create_assignment(
            db=db,
            assessment_id=assessment.id,
            candidate_id=request.candidate_id,
            assigned_by=current_user["user_id"],
            opens_at=request.opens_at,
            closes_at=request.closes_at,
        )

    except AssessmentAssignmentServiceError as exc:
        message = str(exc)

        if "not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        if "already assigned" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc

    return assignment


@router.get(
    "/assessments/{assessment_id}/assignments",
    response_model=AssessmentAssignmentListResponse,
)
def list_assessment_assignments(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "recruiter",
            "assessment_manager",
        )
    ),
):
    """
    Return all candidate assignments for an assessment.

    Access is limited to the recruiter who owns the assessment's job
    or an Assessment Manager who has access to that job.
    """

    _get_authorized_assessment(
        db=db,
        assessment_id=assessment_id,
        current_user=current_user,
    )

    try:
        assignments = get_assessment_assignments(
            db=db,
            assessment_id=assessment_id,
        )

    except AssessmentAssignmentServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return AssessmentAssignmentListResponse(
        items=assignments,
    )
@router.post(
    "/assessments/{assessment_id}/publish",
)
def publish_assessment_for_delivery(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "recruiter",
            "assessment_manager",
        )
    ),
):
    """
    Publish a ready, reviewer-approved assessment so it can be
    assigned to candidates.
    """

    _get_authorized_assessment(
        db=db,
        assessment_id=assessment_id,
        current_user=current_user,
    )

    try:
        assessment = publish_assessment(
            db=db,
            assessment_id=assessment_id,
        )

    except AssessmentReviewServiceError as exc:
        message = str(exc)

        if "not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc

    return {
        "assessment_id": assessment.id,
        "status": assessment.status,
        "review_status": assessment.review_status,
        "title": assessment.title,
    }