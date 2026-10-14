from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.schemas.assessment import AssessmentResponse
from app.schemas.assessment_review import (
    AssessmentReviewDecisionRequest,
    AssessmentReviewPackage,
    AssessmentReviewQueueItem,
    AssessmentSetReviewPackage,
    AssessmentSetReviewQueueItem,
)
from app.services.assessment_review_service import (
    AssessmentReviewServiceError,
    approve_assessment,
    get_assessment_review_package,
    get_review_queue,
    get_assessment_set_review_package as get_assessment_set_review_package_service,
    get_assessment_set_review_queue as get_assessment_set_review_queue_service,
    reject_assessment,
)
from app.services.assessment_set_review_history_service import (
    AssessmentSetReviewHistoryServiceError,
    get_completed_review_package,
    get_completed_review_queue,
)
from app.services.assessment_set_hr_handoff_service import (
    AssessmentSetHRHandoffServiceError,
    send_assessment_set_to_hr,
)
from app.services.assessment_set_review_service import (
    AssessmentSetReviewServiceError,
    approve_assessment_set,
    reject_assessment_set,
)


router = APIRouter(
    prefix="/assessment-reviews",
    tags=["Assessment Reviews"],
)


# ---------------------------------------------------------------------------
# LEGACY ASSESSMENT REVIEW ROUTES
# ---------------------------------------------------------------------------


@router.get(
    "/queue",
    response_model=list[AssessmentReviewQueueItem],
)
def get_assessment_review_queue(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    try:
        return get_review_queue(db)

    except AssessmentReviewServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "/{assessment_id}",
    response_model=AssessmentReviewPackage,
)
def get_assessment_review(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    try:
        return get_assessment_review_package(
            db=db,
            assessment_id=assessment_id,
        )

    except AssessmentReviewServiceError as exc:
        if str(exc) == "Assessment not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post(
    "/{assessment_id}/approve",
    response_model=AssessmentResponse,
)
def approve_assessment_review(
    assessment_id: int,
    request: AssessmentReviewDecisionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    try:
        return approve_assessment(
            db=db,
            assessment_id=assessment_id,
            reviewer_id=current_user["user_id"],
            comment=request.comment,
            checklist=request.checklist.model_dump(),
        )

    except AssessmentReviewServiceError as exc:
        if str(exc) == "Assessment not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post(
    "/{assessment_id}/reject",
    response_model=AssessmentResponse,
)
def reject_assessment_review(
    assessment_id: int,
    request: AssessmentReviewDecisionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    try:
        return reject_assessment(
            db=db,
            assessment_id=assessment_id,
            reviewer_id=current_user["user_id"],
            comment=request.comment,
            checklist=request.checklist.model_dump(),
        )

    except AssessmentReviewServiceError as exc:
        if str(exc) == "Assessment not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


# ---------------------------------------------------------------------------
# ASSESSMENT SET REVIEW ROUTES
# ---------------------------------------------------------------------------


@router.get(
    "/sets/queue",
    response_model=list[AssessmentSetReviewQueueItem],
)
def get_assessment_set_review_queue(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    """
    Return reviewer-visible AssessmentSet submissions.

    Only AssessmentSets that were explicitly submitted for review are
    actionable in this queue. Each item also contains sibling Set A / Set B
    status information so the frontend can display both variants and lock
    sets that have not yet been submitted by the Assessment Manager.
    """
    try:
        return get_assessment_set_review_queue_service(
            db=db,
            reviewer_id=current_user["user_id"],
        )

    except AssessmentReviewServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


# ---------------------------------------------------------------------------
# COMPLETED ASSESSMENT SET REVIEW HISTORY
# ---------------------------------------------------------------------------


@router.get(
    "/sets/completed",
    response_model=list[AssessmentSetReviewQueueItem],
)
def get_completed_assessment_set_review_queue(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    """
    Return completed AssessmentSet reviews for the authenticated reviewer.

    Only sets with a final review decision are returned:
    - approved
    - rejected
    """
    try:
        return get_completed_review_queue(
            db=db,
            reviewer_id=current_user["user_id"],
        )

    except AssessmentSetReviewHistoryServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "/sets/completed/{assessment_set_id}",
    response_model=AssessmentSetReviewPackage,
)
def get_completed_assessment_set_review(
    assessment_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    """
    Open one completed AssessmentSet review from review history.

    Only the reviewer assigned to the assessment set's job can open it.
    Completed reviews are read-only and preserve the persisted review
    decision, comment, checklist, and reviewer metadata.
    """
    try:
        return get_completed_review_package(
            db=db,
            assessment_set_id=assessment_set_id,
            reviewer_id=current_user["user_id"],
        )

    except AssessmentSetReviewHistoryServiceError as exc:
        message = str(exc)

        if message == "Assessment set not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        if (
            message
            == "You are not the assigned reviewer for this assessment set."
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=message,
            ) from exc

        if message.startswith(
            "Only completed assessment-set reviews can"
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


# ---------------------------------------------------------------------------
# ACTIVE ASSESSMENT SET REVIEW
# ---------------------------------------------------------------------------


@router.get(
    "/sets/{assessment_set_id}",
    response_model=AssessmentSetReviewPackage,
)
def get_assessment_set_review(
    assessment_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    """
    Open one submitted AssessmentSet for reviewer inspection.

    A set can only be opened when:

    - the authenticated user is an assessment reviewer,
    - the reviewer is the reviewer assigned to the set's job,
    - the AssessmentSet is currently submitted_for_review.
    """
    try:
        return get_assessment_set_review_package_service(
            db=db,
            assessment_set_id=assessment_set_id,
            reviewer_id=current_user["user_id"],
        )

    except AssessmentReviewServiceError as exc:
        message = str(exc)

        if message == "Assessment set not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        if (
            message
            == "You are not the assigned reviewer for this assessment set."
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=message,
            ) from exc

        if message.startswith(
            "Only assessment sets submitted for review"
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


@router.post(
    "/sets/{assessment_set_id}/approve",
)
def approve_assessment_set_review(
    assessment_set_id: int,
    request: AssessmentReviewDecisionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    """
    Approve one submitted AssessmentSet.

    The review comment and checklist are persisted together with the
    reviewer decision.
    """
    try:
        assessment_set = approve_assessment_set(
            db=db,
            assessment_set_id=assessment_set_id,
            reviewer_id=current_user["user_id"],
            comment=request.comment,
            checklist=request.checklist.model_dump(),
        )

        return {
            "assessment_set_id": assessment_set.id,
            "status": assessment_set.status,
            "review_status": assessment_set.status,
            "reviewer_id": assessment_set.reviewer_id,
            "reviewed_at": assessment_set.reviewed_at,
            "review_comment": assessment_set.review_comment,
            "review_checklist": assessment_set.review_checklist or {},
            "message": "Assessment set approved successfully.",
        }

    except AssessmentSetReviewServiceError as exc:
        message = str(exc)

        if message == "Assessment set not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        if (
            message
            == "You are not the assigned reviewer for this assessment set."
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


# ---------------------------------------------------------------------------
# REVIEWER -> HR HANDOFF
# ---------------------------------------------------------------------------


@router.post(
    "/sets/{assessment_set_id}/send-to-hr",
)
def send_assessment_set_to_hr_review(
    assessment_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    """
    Hand one approved AssessmentSet from the Assessment Reviewer to HR.

    This operation:

    - verifies reviewer ownership,
    - requires AssessmentSet.status == "approved",
    - materializes the candidate-facing Assessment if necessary,
    - records sent_to_hr_by / sent_to_hr_at,
    - creates an HR notification,
    - is idempotent on repeated calls.
    """
    try:
        return send_assessment_set_to_hr(
            db=db,
            assessment_set_id=assessment_set_id,
            reviewer_id=current_user["user_id"],
        )

    except AssessmentSetHRHandoffServiceError as exc:
        message = str(exc)

        if (
            message in {
                "Assessment set not found.",
                "Parent QuestionSet not found.",
                "Assessment job not found.",
                "The HR owner for this job could not be found.",
            }
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        if (
            message
            == "You are not the assigned reviewer for this assessment set."
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


@router.post(
    "/sets/{assessment_set_id}/reject",
)
def reject_assessment_set_review(
    assessment_set_id: int,
    request: AssessmentReviewDecisionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    """
    Reject one submitted AssessmentSet with a mandatory reason.

    The rejection reason and checklist are persisted with the reviewer
    decision.
    """
    try:
        assessment_set = reject_assessment_set(
            db=db,
            assessment_set_id=assessment_set_id,
            reviewer_id=current_user["user_id"],
            comment=request.comment,
            checklist=request.checklist.model_dump(),
        )

        return {
            "assessment_set_id": assessment_set.id,
            "status": assessment_set.status,
            "review_status": assessment_set.status,
            "reviewer_id": assessment_set.reviewer_id,
            "reviewed_at": assessment_set.reviewed_at,
            "review_comment": assessment_set.review_comment,
            "review_checklist": assessment_set.review_checklist or {},
            "message": "Assessment set rejected successfully.",
        }

    except AssessmentSetReviewServiceError as exc:
        message = str(exc)

        if message == "Assessment set not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        if (
            message
            == "You are not the assigned reviewer for this assessment set."
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc