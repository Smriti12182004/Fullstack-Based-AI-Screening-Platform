"""Question-set available-jobs API tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import Job, JobAssessmentAccess, User


client = TestClient(app)


def create_test_user(db, role: str) -> User:
    """Create an isolated application user."""

    unique_id = uuid4().hex[:10]

    user = User(
        username=f"s4_qs_jobs_{role}_{unique_id}",
        email=f"s4_qs_jobs_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def create_access_token_for_user(user: User) -> str:
    """Create an application-compatible JWT."""

    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def test_assessment_manager_can_view_assigned_jobs():
    """Managers can see jobs explicitly assigned to them."""

    db = SessionLocal()

    manager = None
    recruiter = None
    job = None
    access = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None

        manager = create_test_user(
            db,
            "assessment_manager",
        )

        job = Job(
            title=f"S4 Question Set Jobs {uuid4().hex[:8]}",
            description=(
                "Question-set accessible jobs API test job."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        access = JobAssessmentAccess(
            job_id=job.id,
            user_id=manager.id,
            assigned_by=recruiter.id,
        )

        db.add(access)
        db.commit()

        token = create_access_token_for_user(manager)

        response = client.get(
            "/question-sets/assigned-jobs",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        matched_jobs = [
            item
            for item in data
            if item["id"] == job.id
        ]

        assert len(matched_jobs) == 1
        assert matched_jobs[0]["title"] == job.title
        assert matched_jobs[0]["created_by"] == recruiter.id

    finally:
        if access is not None:
            db.query(JobAssessmentAccess).filter(
                JobAssessmentAccess.id == access.id
            ).delete(
                synchronize_session=False
            )

        if job is not None:
            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()