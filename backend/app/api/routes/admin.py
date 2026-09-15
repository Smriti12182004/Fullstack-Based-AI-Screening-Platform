from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users")
def get_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("admin")),
):
    users = db.query(User).order_by(User.id).all()

    return [
        {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        for user in users
    ]