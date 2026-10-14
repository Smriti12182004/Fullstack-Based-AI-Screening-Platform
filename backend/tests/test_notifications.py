from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Job,
    Notification,
    User,
)


client = TestClient(app)

RECRUITER_EMAIL = "recruiter@test.com"
RECRUITER_PASSWORD = "recruiter"


def login(
    email: str,
    password: str,
) -> str:
    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 200

    return response.json()["access_token"]


def create_user(
    db,
    role: str,
    prefix: str,
):
    unique = uuid4().hex[:10]

    user = User(
        username=f"{prefix}_{unique}",
        email=f"{prefix}_{unique}@example.com",
        password_hash=hash_password(
            "Test@12345"
        ),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def test_recruiter_assignment_creates_notifications():
    db = SessionLocal()

    recruiter = None
    manager = None
    reviewer = None
    job = None

    try:
        recruiter = (
            db.query(User)
            .filter(
                User.email == RECRUITER_EMAIL
            )
            .first()
        )

        assert recruiter is not None

        manager = create_user(
            db,
            "assessment_manager",
            "notification_manager",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
            "notification_reviewer",
        )

        job = Job(
            title=(
                f"Notification Test "
                f"{uuid4().hex[:8]}"
            ),
            description=(
                "Python backend developer with "
                "FastAPI and PostgreSQL experience."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        token = login(
            RECRUITER_EMAIL,
            RECRUITER_PASSWORD,
        )

        response = client.put(
            f"/jobs/{job.id}/collaboration",
            headers={
                "Authorization": (
                    f"Bearer {token}"
                ),
            },
            json={
                "assessment_manager_id": manager.id,
                "assessment_reviewer_id": reviewer.id,
            },
        )

        assert response.status_code == 200

        db.expire_all()

        manager_notifications = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == manager.id
            )
            .all()
        )

        reviewer_notifications = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == reviewer.id
            )
            .all()
        )

        assert len(manager_notifications) == 1
        assert len(reviewer_notifications) == 1

        manager_notification = (
            manager_notifications[0]
        )

        reviewer_notification = (
            reviewer_notifications[0]
        )

        assert (
            manager_notification.notification_type
            == "JOB_COLLABORATION_ASSIGNED"
        )

        assert (
            reviewer_notification.notification_type
            == "JOB_COLLABORATION_ASSIGNED"
        )

        assert (
            manager_notification.entity_type
            == "job"
        )

        assert (
            manager_notification.entity_id
            == job.id
        )

        assert (
            reviewer_notification.entity_type
            == "job"
        )

        assert (
            reviewer_notification.entity_id
            == job.id
        )

        assert (
            manager_notification.is_read
            is False
        )

        assert (
            reviewer_notification.is_read
            is False
        )

        assert "Assessment Manager" in (
            manager_notification.message
        )

        assert "Assessment Reviewer" in (
            reviewer_notification.message
        )

    finally:
        if job is not None:
            db.delete(job)
            db.commit()

        if manager is not None:
            db.delete(manager)

        if reviewer is not None:
            db.delete(reviewer)

        db.commit()
        db.close()


def test_user_can_get_unread_notifications():
    db = SessionLocal()

    user = None

    try:
        user = create_user(
            db,
            "assessment_manager",
            "notification_list",
        )

        notification = Notification(
            user_id=user.id,
            notification_type="TEST",
            title="Test Notification",
            message=(
                "This is a test notification."
            ),
            entity_type="job",
            entity_id=123,
            is_read=False,
        )

        db.add(notification)
        db.commit()
        db.refresh(notification)

        token = login(
            user.email,
            "Test@12345",
        )

        response = client.get(
            "/notifications?unread_only=true",
            headers={
                "Authorization": (
                    f"Bearer {token}"
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        notification_ids = {
            item["id"]
            for item in data
        }

        assert notification.id in notification_ids

    finally:
        if user is not None:
            db.delete(user)
            db.commit()

        db.close()


def test_unread_notification_count():
    db = SessionLocal()

    user = None

    try:
        user = create_user(
            db,
            "assessment_reviewer",
            "notification_count",
        )

        first = Notification(
            user_id=user.id,
            notification_type="TEST",
            title="Unread One",
            message=(
                "Unread notification one."
            ),
            is_read=False,
        )

        second = Notification(
            user_id=user.id,
            notification_type="TEST",
            title="Unread Two",
            message=(
                "Unread notification two."
            ),
            is_read=False,
        )

        read_notification = Notification(
            user_id=user.id,
            notification_type="TEST",
            title="Read",
            message="Already read.",
            is_read=True,
        )

        db.add_all(
            [
                first,
                second,
                read_notification,
            ]
        )

        db.commit()

        token = login(
            user.email,
            "Test@12345",
        )

        response = client.get(
            "/notifications/unread-count",
            headers={
                "Authorization": (
                    f"Bearer {token}"
                ),
            },
        )

        assert response.status_code == 200

        assert (
            response.json()["unread_count"]
            == 2
        )

    finally:
        if user is not None:
            db.delete(user)
            db.commit()

        db.close()


def test_user_can_mark_notification_as_read():
    db = SessionLocal()

    user = None

    try:
        user = create_user(
            db,
            "assessment_manager",
            "notification_read",
        )

        notification = Notification(
            user_id=user.id,
            notification_type="TEST",
            title="Read Me",
            message=(
                "Please mark this as read."
            ),
            is_read=False,
        )

        db.add(notification)
        db.commit()
        db.refresh(notification)

        token = login(
            user.email,
            "Test@12345",
        )

        response = client.post(
            f"/notifications/"
            f"{notification.id}/read",
            headers={
                "Authorization": (
                    f"Bearer {token}"
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["id"] == notification.id
        assert data["is_read"] is True
        assert data["read_at"] is not None

        db.refresh(notification)

        assert notification.is_read is True
        assert notification.read_at is not None

    finally:
        if user is not None:
            db.delete(user)
            db.commit()

        db.close()


def test_user_can_mark_all_notifications_as_read():
    db = SessionLocal()

    user = None

    try:
        user = create_user(
            db,
            "assessment_reviewer",
            "notification_read_all",
        )

        first = Notification(
            user_id=user.id,
            notification_type="TEST",
            title="One",
            message=(
                "First unread notification."
            ),
            is_read=False,
        )

        second = Notification(
            user_id=user.id,
            notification_type="TEST",
            title="Two",
            message=(
                "Second unread notification."
            ),
            is_read=False,
        )

        db.add_all(
            [
                first,
                second,
            ]
        )

        db.commit()

        token = login(
            user.email,
            "Test@12345",
        )

        response = client.post(
            "/notifications/read-all",
            headers={
                "Authorization": (
                    f"Bearer {token}"
                ),
            },
        )

        assert response.status_code == 200

        assert (
            response.json()["updated_count"]
            == 2
        )

        db.expire_all()

        unread_count = (
            db.query(Notification)
            .filter(
                Notification.user_id == user.id,
                Notification.is_read.is_(False),
            )
            .count()
        )

        assert unread_count == 0

    finally:
        if user is not None:
            db.delete(user)
            db.commit()

        db.close()