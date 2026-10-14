from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Notification


def create_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
        is_read=False,
        read_at=None,
    )

    db.add(notification)

    return notification


def create_job_collaboration_notification(
    db: Session,
    user_id: int,
    job_id: int,
    job_title: str,
    collaborator_role: str,
) -> Notification:
    if collaborator_role == "assessment_manager":
        role_label = "Assessment Manager"
    elif collaborator_role == "assessment_reviewer":
        role_label = "Assessment Reviewer"
    else:
        role_label = "Assessment Collaborator"

    return create_notification(
        db=db,
        user_id=user_id,
        notification_type="JOB_COLLABORATION_ASSIGNED",
        title="New Assessment Assignment",
        message=(
            f'You have been assigned as {role_label} '
            f'for the job "{job_title}".'
        ),
        entity_type="job",
        entity_id=job_id,
    )


def get_user_notifications(
    db: Session,
    user_id: int,
    unread_only: bool = False,
    limit: int = 50,
) -> list[Notification]:
    query = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
        )
    )

    if unread_only:
        query = query.filter(
            Notification.is_read.is_(False)
        )

    return (
        query
        .order_by(
            Notification.created_at.desc(),
            Notification.id.desc(),
        )
        .limit(limit)
        .all()
    )


def get_unread_count(
    db: Session,
    user_id: int,
) -> int:
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        .count()
    )


def mark_notification_as_read(
    db: Session,
    user_id: int,
    notification_id: int,
) -> Notification:
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .first()
    )

    if notification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(
            timezone.utc
        )
        db.commit()
        db.refresh(notification)

    return notification


def mark_all_notifications_as_read(
    db: Session,
    user_id: int,
) -> int:
    notifications = (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.is_read.is_(False),
        )
        .all()
    )

    if not notifications:
        return 0

    now = datetime.now(timezone.utc)

    for notification in notifications:
        notification.is_read = True
        notification.read_at = now

    db.commit()

    return len(notifications)