from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models import (
    JobAssessmentAccess,
    QuestionSet,
    User,
)

from app.schemas.section import (
    SectionCreate,
    SectionResponse,
)

from app.services.section_service import (
    SectionServiceError,
    create_section,
)


router = APIRouter(
    prefix="/sections",
    tags=["Sections"],
)


@router.post(
    "",
    response_model=SectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_section_endpoint(
    section: SectionCreate,
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

    question_set = db.get(
        QuestionSet,
        section.question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found.",
        )

    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id
            == question_set.job_id,
            JobAssessmentAccess.user_id
            == current_user["user_id"],
        )
        .first()
    )

    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to create sections "
                "for this job."
            ),
        )

    try:
        return create_section(
            db=db,
            question_set_id=section.question_set_id,
            skill_id=section.skill_id,
            name=section.name,
            display_order=section.display_order,
            easy_count=section.easy_count,
            medium_count=section.medium_count,
            hard_count=section.hard_count,
        )

    except SectionServiceError as exc:
        if str(exc) in {
            "Question set not found.",
            "Skill not found.",
        }:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc