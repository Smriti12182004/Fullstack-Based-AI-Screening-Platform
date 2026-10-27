"""API tests for recruiter bulk job deletion."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import Job, User
from app.models.assessment import Assessment


client = TestClient(app)


def create_test_user(db, role: str = "recruiter") -> User:
    """Create an isolated test user."""
    unique_id = uuid4().hex[:12]
    user = User(
        username=f"bulk_job_{role}_{unique_id}",
        email=f"bulk_job_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def token_for(user: User) -> str:
    return create_access_token({"sub": str(user.id), "role": user.role})


def create_job(db, owner: User, title: str) -> Job:
    job = Job(
        title=title,
        description=f"Bulk deletion test job description for {title}.",
        created_by=owner.id,
    )
    db.add(job)
    db.flush()
    return job


def cleanup(db, job_ids: list[int], user_ids: list[int]) -> None:
    db.rollback()

    if job_ids:
        db.query(Assessment).filter(
            Assessment.job_id.in_(job_ids)
        ).delete(synchronize_session=False)
        db.query(Job).filter(
            Job.id.in_(job_ids)
        ).delete(synchronize_session=False)

    if user_ids:
        db.query(User).filter(
            User.id.in_(user_ids)
        ).delete(synchronize_session=False)

    db.commit()


def test_bulk_delete_removes_multiple_owned_jobs():
    db = SessionLocal()
    owner = None
    jobs = []

    try:
        owner = create_test_user(db)
        jobs = [
            create_job(db, owner, f"Bulk delete {uuid4().hex[:8]}")
            for _ in range(2)
        ]
        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={"job_ids": [job.id for job in jobs]},
            headers={"Authorization": f"Bearer {token_for(owner)}"},
        )

        assert response.status_code == 200
        result = response.json()
        assert result["requested_count"] == 2
        assert set(result["deleted_ids"]) == {job.id for job in jobs}
        assert result["failures"] == []

        db.expire_all()
        assert all(db.get(Job, job.id) is None for job in jobs)

    finally:
        cleanup(
            db,
            [job.id for job in jobs],
            [owner.id] if owner is not None else [],
        )
        db.close()


def test_bulk_delete_reports_blocked_job_and_deletes_eligible_job():
    db = SessionLocal()
    owner = None
    blocked_job = None
    eligible_job = None

    try:
        owner = create_test_user(db)
        blocked_job = create_job(db, owner, f"Blocked {uuid4().hex[:8]}")
        eligible_job = create_job(db, owner, f"Eligible {uuid4().hex[:8]}")
        db.add(
            Assessment(
                job_id=blocked_job.id,
                title=f"Existing assessment {uuid4().hex[:8]}",
            )
        )
        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={"job_ids": [blocked_job.id, eligible_job.id]},
            headers={"Authorization": f"Bearer {token_for(owner)}"},
        )

        assert response.status_code == 200
        result = response.json()
        assert result["requested_count"] == 2
        assert result["deleted_ids"] == [eligible_job.id]
        assert len(result["failures"]) == 1
        assert result["failures"][0]["job_id"] == blocked_job.id
        assert result["failures"][0]["reason"] == "blocked"

        db.expire_all()
        assert db.get(Job, blocked_job.id) is not None
        assert db.get(Job, eligible_job.id) is None

    finally:
        cleanup(
            db,
            [
                job_id
                for job_id in (
                    blocked_job.id if blocked_job else None,
                    eligible_job.id if eligible_job else None,
                )
                if job_id is not None
            ],
            [owner.id] if owner is not None else [],
        )
        db.close()


def test_bulk_delete_does_not_delete_another_recruiters_job():
    db = SessionLocal()
    requester = None
    owner = None
    job = None

    try:
        requester = create_test_user(db)
        owner = create_test_user(db)
        job = create_job(db, owner, f"Other recruiter job {uuid4().hex[:8]}")
        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={"job_ids": [job.id]},
            headers={"Authorization": f"Bearer {token_for(requester)}"},
        )

        assert response.status_code == 200
        result = response.json()
        assert result["deleted_ids"] == []
        assert len(result["failures"]) == 1
        assert result["failures"][0]["reason"] == "not_found"

        db.expire_all()
        assert db.get(Job, job.id) is not None

    finally:
        cleanup(
            db,
            [job.id] if job is not None else [],
            [
                user_id
                for user_id in (
                    requester.id if requester else None,
                    owner.id if owner else None,
                )
                if user_id is not None
            ],
        )
        db.close()


def test_bulk_delete_requires_at_least_one_job_id():
    db = SessionLocal()
    recruiter = None

    try:
        recruiter = create_test_user(db)
        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={"job_ids": []},
            headers={"Authorization": f"Bearer {token_for(recruiter)}"},
        )

        assert response.status_code == 422
    finally:
        cleanup(db, [], [recruiter.id] if recruiter is not None else [])
        db.close()
