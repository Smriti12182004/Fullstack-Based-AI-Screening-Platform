from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role
from app.db.session import get_db
from app.models.skill import Skill


router = APIRouter(
    prefix="/skills",
    tags=["Skills"],
)


@router.get("")
def get_skills(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "recruiter",
            "assessment_manager",
            "assessment_reviewer",
        )
    ),
):
    skills = (
        db.query(Skill)
        .order_by(Skill.name)
        .all()
    )

    return [
        {
            "id": skill.id,
            "name": skill.name,
        }
        for skill in skills
    ]