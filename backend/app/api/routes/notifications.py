from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.schemas.notification import (
    NotificationReadAllResponse,
    NotificationResponse,
    NotificationUnreadCountResponse,
)
from app.services.notification_service import (
    get_unread_count,
    get_user_notifications,
    mark_all_notifications_as_read,
    mark_notification_as_read,
)


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


@router.get(
    "",
    response_model=list[NotificationResponse],
)
def get_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(
        default=50,
        ge=1,
        le=100,
    ),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return get_user_notifications(
        db=db,
        user_id=current_user["user_id"],
        unread_only=unread_only,
        limit=limit,
    )


@router.get(
    "/unread-count",
    response_model=NotificationUnreadCountResponse,
)
def get_notifications_unread_count(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return NotificationUnreadCountResponse(
        unread_count=get_unread_count(
            db=db,
            user_id=current_user["user_id"],
        )
    )


@router.post(
    "/read-all",
    response_model=NotificationReadAllResponse,
)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    updated_count = mark_all_notifications_as_read(
        db=db,
        user_id=current_user["user_id"],
    )

    return NotificationReadAllResponse(
        updated_count=updated_count,
    )


@router.post(
    "/{notification_id}/read",
    response_model=NotificationResponse,
)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return mark_notification_as_read(
        db=db,
        user_id=current_user["user_id"],
        notification_id=notification_id,
    )