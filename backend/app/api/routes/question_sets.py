from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy.orm import Session

from app.core.dependencies import require_role

from app.db.session import get_db

from app.models import JobAssessmentAccess, User

from app.schemas.question_set import (
    QuestionSetCreate,
    QuestionSetResponse,
)

from app.services.question_set_service import (
    QuestionSetServiceError,
    create_question_set,
)


router = APIRouter(
    prefix="/question-sets",
    tags=["Question Sets"],
)


@router.post(
    "",
    response_model=QuestionSetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_question_set_endpoint(
    question_set: QuestionSetCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == question_set.job_id,
            JobAssessmentAccess.user_id == current_user["user_id"],
        )
        .first()
    )

    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to create a question set "
                "for this job."
            ),
        )

    try:
        return create_question_set(
            db=db,
            job_id=question_set.job_id,
            name=question_set.name,
            description=question_set.description,
            created_by=current_user["user_id"],
        )

    except QuestionSetServiceError as exc:
        if str(exc) == "Job not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc