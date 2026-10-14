from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models import (
    JobAssessmentAccess,
    QuestionSet,
    Section,
    User,
)
from app.schemas.section import (
    SectionCreate,
    SectionResponse,
    SectionUpdate,
)
from app.services.section_service import (
    SectionServiceError,
    create_section,
    update_section,
)


router = APIRouter(
    prefix="/sections",
    tags=["Sections"],
)


def _get_manager_access(
    db: Session,
    question_set: QuestionSet,
    user_id: int,
):
    return (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == question_set.job_id,
            JobAssessmentAccess.user_id == user_id,
        )
        .first()
    )


def _section_response(
    section: Section,
) -> dict:
    """
    Return both the new semantic fields and the legacy response fields.

    This keeps older frontend/tests working while the new section model
    uses SectionSkill's independent Easy/Medium/Hard counts.
    """
    return {
        "id": section.id,
        "question_set_id": section.question_set_id,
        "name": section.name,
        "section_type": section.section_type,
        "difficulty": section.difficulty,
        "display_order": section.display_order,
        "is_locked": section.is_locked,
        "skills": section.section_skills,
        "created_at": section.created_at,
        "updated_at": section.updated_at,
    }


@router.get(
    "",
    response_model=list[SectionResponse],
)
def get_sections_endpoint(
    question_set_id: int = Query(
        ...,
        gt=0,
    ),
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
            detail="User not found",
        )

    question_set = db.get(
        QuestionSet,
        question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found.",
        )

    access = _get_manager_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
    )

    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to view sections "
                "for this job."
            ),
        )

    sections = (
        db.query(Section)
        .filter(
            Section.question_set_id == question_set_id,
        )
        .order_by(
            Section.display_order.asc(),
            Section.id.asc(),
        )
        .all()
    )

    return [
        _section_response(section)
        for section in sections
    ]


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
    user = db.get(
        User,
        current_user["user_id"],
    )

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

    access = _get_manager_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
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
        created_section = create_section(
            db=db,
            question_set_id=section.question_set_id,
            name=section.name,
            section_type=section.section_type,
            difficulty=section.difficulty,
            display_order=section.display_order,
            skills=[
                {
                    "skill_id": allocation.skill_id,
                    "easy_count": allocation.easy_count,
                    "medium_count": allocation.medium_count,
                    "hard_count": allocation.hard_count,
                    "question_count": allocation.question_count,
                }
                for allocation in section.skills
            ],
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

    return _section_response(
        created_section
    )

@router.put(
    "/{section_id}",
    response_model=SectionResponse,
)
def update_section_endpoint(
    section_id: int,
    section: SectionUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    existing = db.get(Section, section_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Section not found.",
        )

    question_set = db.get(QuestionSet, existing.question_set_id)
    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found.",
        )

    access = _get_manager_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
    )
    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to edit sections for this job.",
        )

    try:
        updated = update_section(
            db=db,
            section_id=section_id,
            name=section.name,
            section_type=section.section_type,
            display_order=section.display_order,
            skills=[item.model_dump() for item in section.skills],
        )
    except SectionServiceError as exc:
        if str(exc) in {"Section not found.", "Question set not found.", "Skill not found."}:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return _section_response(updated)
