from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role, require_role
from app.db.session import get_db
from app.models import User
from app.schemas.question_set_configuration import (
    QuestionSetConfigurationCreate,
    QuestionSetConfigurationResponse,
)
from app.services.question_set_configuration_service import (
    QuestionSetConfigurationServiceError,
    configure_question_set,
    get_question_set_configuration,
)


router = APIRouter(
    prefix="/question-sets",
    tags=["Question Set Configuration"],
)


@router.get(
    "/{question_set_id}/configuration",
    response_model=QuestionSetConfigurationResponse,
)
def get_question_set_configuration_endpoint(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "assessment_manager",
            "assessment_reviewer",
        )
    ),
):
    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    try:
        return get_question_set_configuration(
            db=db,
            question_set_id=question_set_id,
        )

    except QuestionSetConfigurationServiceError as exc:
        message = str(exc)

        if message in {
            "Question set not found.",
            "Assessment configuration not found.",
        }:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=message,
        ) from exc


@router.put(
    "/{question_set_id}/configuration",
    response_model=QuestionSetConfigurationResponse,
    status_code=status.HTTP_200_OK,
)
def configure_question_set_endpoint(
    question_set_id: int,
    data: QuestionSetConfigurationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    try:
        return configure_question_set(
            db=db,
            question_set_id=question_set_id,
            total_questions=data.total_questions,
            duration_minutes=data.duration_minutes,
            candidate_instructions=data.candidate_instructions,
        )

    except QuestionSetConfigurationServiceError as exc:
        message = str(exc)

        if message == "Question set not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=message,
        ) from exc