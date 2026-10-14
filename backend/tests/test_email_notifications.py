from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    AuditEvent,
    Job,
    JobAssessmentAccess,
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


def test_assignment_sends_manager_and_reviewer_emails(
    monkeypatch,
):
    db = SessionLocal()

    recruiter = None
    manager = None
    reviewer = None
    job = None

    sent_emails = []

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
            "email_manager",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
            "email_reviewer",
        )

        job = Job(
            title=(
                f"Email Collaboration Test "
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

        def fake_send_job_collaboration_email(
            to_email,
            recipient_name,
            job_title,
            collaborator_role,
        ):
            sent_emails.append(
                {
                    "to_email": to_email,
                    "recipient_name": recipient_name,
                    "job_title": job_title,
                    "collaborator_role": collaborator_role,
                }
            )

        monkeypatch.setattr(
            "app.services.job_collaboration_service."
            "send_job_collaboration_email",
            fake_send_job_collaboration_email,
        )

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

        assert len(sent_emails) == 2

        manager_email = next(
            item
            for item in sent_emails
            if item["to_email"]
            == manager.email
        )

        reviewer_email = next(
            item
            for item in sent_emails
            if item["to_email"]
            == reviewer.email
        )

        assert (
            manager_email["recipient_name"]
            == manager.username
        )

        assert (
            manager_email["job_title"]
            == job.title
        )

        assert (
            manager_email["collaborator_role"]
            == "assessment_manager"
        )

        assert (
            reviewer_email["recipient_name"]
            == reviewer.username
        )

        assert (
            reviewer_email["job_title"]
            == job.title
        )

        assert (
            reviewer_email["collaborator_role"]
            == "assessment_reviewer"
        )

        manager_notification_count = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == manager.id,
                Notification.notification_type
                == "JOB_COLLABORATION_ASSIGNED",
            )
            .count()
        )

        reviewer_notification_count = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == reviewer.id,
                Notification.notification_type
                == "JOB_COLLABORATION_ASSIGNED",
            )
            .count()
        )

        assert manager_notification_count == 1
        assert reviewer_notification_count == 1

    finally:
        if job is not None:
            db.query(
                JobAssessmentAccess
            ).filter(
                JobAssessmentAccess.job_id
                == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(
                Notification
            ).filter(
                Notification.entity_type == "job",
                Notification.entity_id == job.id,
            ).delete(
                synchronize_session=False
            )

            db.query(
                AuditEvent
            ).filter(
                AuditEvent.entity_type == "job",
                AuditEvent.entity_id == job.id,
            ).delete(
                synchronize_session=False
            )

            db.delete(job)
            db.commit()

        if manager is not None:
            db.delete(manager)

        if reviewer is not None:
            db.delete(reviewer)

        db.commit()
        db.close()


def test_assignment_survives_email_failure(
    monkeypatch,
):
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
            "email_fail_manager",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
            "email_fail_reviewer",
        )

        job = Job(
            title=(
                f"Email Failure Test "
                f"{uuid4().hex[:8]}"
            ),
            description=(
                "Backend developer role for "
                "testing email delivery failure."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        def failing_email(
            to_email,
            recipient_name,
            job_title,
            collaborator_role,
        ):
            from app.services.email_service import (
                EmailServiceError,
            )

            raise EmailServiceError(
                "SMTP unavailable"
            )

        monkeypatch.setattr(
            "app.services.job_collaboration_service."
            "send_job_collaboration_email",
            failing_email,
        )

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

        accesses = (
            db.query(JobAssessmentAccess)
            .filter(
                JobAssessmentAccess.job_id
                == job.id
            )
            .all()
        )

        access_user_ids = {
            access.user_id
            for access in accesses
        }

        assert access_user_ids == {
            manager.id,
            reviewer.id,
        }

        notifications = (
            db.query(Notification)
            .filter(
                Notification.entity_type == "job",
                Notification.entity_id == job.id,
            )
            .all()
        )

        notification_user_ids = {
            notification.user_id
            for notification in notifications
        }

        assert notification_user_ids == {
            manager.id,
            reviewer.id,
        }

    finally:
        if job is not None:
            db.query(
                JobAssessmentAccess
            ).filter(
                JobAssessmentAccess.job_id
                == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(
                Notification
            ).filter(
                Notification.entity_type == "job",
                Notification.entity_id == job.id,
            ).delete(
                synchronize_session=False
            )

            db.query(
                AuditEvent
            ).filter(
                AuditEvent.entity_type == "job",
                AuditEvent.entity_id == job.id,
            ).delete(
                synchronize_session=False
            )

            db.delete(job)
            db.commit()

        if manager is not None:
            db.delete(manager)

        if reviewer is not None:
            db.delete(reviewer)

        db.commit()
        db.close()