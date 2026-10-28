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
    return create_access_token({
        "sub": str(user.id),
        "role": user.role,
    })


def create_job(db, owner: User, title: str) -> Job:
    job = Job(
        title=title,
        description=f"Bulk deletion test job description for {title}.",
        created_by=owner.id,
    )

    db.add(job)
    db.flush()

    return job


def cleanup(
    db,
    job_ids: list[int],
    user_ids: list[int],
) -> None:
    """Remove test data using scalar IDs, never deleted ORM instances."""
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
    owner_id = None
    job_ids: list[int] = []

    try:
        owner = create_test_user(db)
        owner_id = int(owner.id)

        jobs = [
            create_job(
                db,
                owner,
                f"Bulk delete {uuid4().hex[:8]}",
            )
            for _ in range(2)
        ]

        # Store scalar IDs before the endpoint can delete the ORM objects.
        job_ids = [int(job.id) for job in jobs]
        auth_token = token_for(owner)

        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={"job_ids": job_ids},
            headers={
                "Authorization": f"Bearer {auth_token}",
            },
        )

        assert response.status_code == 200

        result = response.json()

        assert result["requested_count"] == 2
        assert set(result["deleted_ids"]) == set(job_ids)
        assert result["failures"] == []

        # Verify using saved scalar IDs, not expired ORM instances.
        db.expire_all()

        for job_id in job_ids:
            assert db.get(Job, job_id) is None

    finally:
        cleanup(
            db,
            job_ids,
            [owner_id] if owner_id is not None else [],
        )
        db.close()


def test_bulk_delete_reports_blocked_job_and_deletes_eligible_job():
    db = SessionLocal()
    owner_id = None
    blocked_job_id = None
    eligible_job_id = None

    try:
        owner = create_test_user(db)
        owner_id = int(owner.id)

        blocked_job = create_job(
            db,
            owner,
            f"Blocked {uuid4().hex[:8]}",
        )

        eligible_job = create_job(
            db,
            owner,
            f"Eligible {uuid4().hex[:8]}",
        )

        # Capture IDs before the deletion request.
        blocked_job_id = int(blocked_job.id)
        eligible_job_id = int(eligible_job.id)
        auth_token = token_for(owner)

        db.add(
            Assessment(
                job_id=blocked_job_id,
                title=f"Existing assessment {uuid4().hex[:8]}",
            )
        )

        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={
                "job_ids": [
                    blocked_job_id,
                    eligible_job_id,
                ],
            },
            headers={
                "Authorization": f"Bearer {auth_token}",
            },
        )

        assert response.status_code == 200

        result = response.json()

        assert result["requested_count"] == 2
        assert result["deleted_ids"] == [eligible_job_id]

        assert len(result["failures"]) == 1
        assert result["failures"][0]["job_id"] == blocked_job_id
        assert result["failures"][0]["reason"] == "blocked"

        db.expire_all()

        # Do not access blocked_job.id or eligible_job.id here:
        # one of those database rows may already have been deleted.
        assert db.get(Job, blocked_job_id) is not None
        assert db.get(Job, eligible_job_id) is None

    finally:
        job_ids = [
            job_id
            for job_id in (blocked_job_id, eligible_job_id)
            if job_id is not None
        ]

        cleanup(
            db,
            job_ids,
            [owner_id] if owner_id is not None else [],
        )
        db.close()


def test_bulk_delete_does_not_delete_another_recruiters_job():
    db = SessionLocal()
    requester_id = None
    owner_id = None
    job_id = None

    try:
        requester = create_test_user(db)
        owner = create_test_user(db)

        requester_id = int(requester.id)
        owner_id = int(owner.id)

        job = create_job(
            db,
            owner,
            f"Other recruiter job {uuid4().hex[:8]}",
        )

        # Save the ID and token before making the request.
        job_id = int(job.id)
        auth_token = token_for(requester)

        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={"job_ids": [job_id]},
            headers={
                "Authorization": f"Bearer {auth_token}",
            },
        )

        assert response.status_code == 200

        result = response.json()

        assert result["deleted_ids"] == []
        assert len(result["failures"]) == 1
        assert result["failures"][0]["reason"] == "not_found"

        db.expire_all()

        # The other recruiter's job must remain untouched.
        assert db.get(Job, job_id) is not None

    finally:
        cleanup(
            db,
            [job_id] if job_id is not None else [],
            [
                user_id
                for user_id in (requester_id, owner_id)
                if user_id is not None
            ],
        )
        db.close()


def test_bulk_delete_requires_at_least_one_job_id():
    db = SessionLocal()
    recruiter_id = None

    try:
        recruiter = create_test_user(db)
        recruiter_id = int(recruiter.id)
        auth_token = token_for(recruiter)

        db.commit()

        response = client.post(
            "/jobs/bulk-delete",
            json={"job_ids": []},
            headers={
                "Authorization": f"Bearer {auth_token}",
            },
        )

        assert response.status_code == 422

    finally:
        cleanup(
            db,
            [],
            [recruiter_id] if recruiter_id is not None else [],
        )
        db.close()