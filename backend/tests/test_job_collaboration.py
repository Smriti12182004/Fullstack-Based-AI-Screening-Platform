from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    AuditEvent,
    Job,
    JobAssessmentAccess,
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
    db.flush()
    db.commit()
    db.refresh(user)

    return user


def test_recruiter_can_assign_job_collaborators():
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
            "collab_manager",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
            "collab_reviewer",
        )

        job = Job(
            title=(
                f"Collaboration Test "
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
                "Authorization": f"Bearer {token}",
            },
            json={
                "assessment_manager_id": manager.id,
                "assessment_reviewer_id": reviewer.id,
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["job_id"] == job.id
        assert (
            data["assessment_manager"]["id"]
            == manager.id
        )
        assert (
            data["assessment_reviewer"]["id"]
            == reviewer.id
        )

        db.expire_all()

        accesses = (
            db.query(JobAssessmentAccess)
            .filter(
                JobAssessmentAccess.job_id
                == job.id
            )
            .all()
        )

        returned_ids = {
            access.user_id
            for access in accesses
        }

        assert returned_ids == {
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

            db.query(AuditEvent).filter(
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


def test_recruiter_can_get_assignable_collaborators():
    db = SessionLocal()

    manager = None
    reviewer = None

    try:
        manager = create_user(
            db,
            "assessment_manager",
            "list_manager",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
            "list_reviewer",
        )

        # Confirm the exact values committed to the database.
        db.expire_all()

        manager_from_db = db.get(
            User,
            manager.id,
        )

        reviewer_from_db = db.get(
            User,
            reviewer.id,
        )

        assert manager_from_db is not None
        assert reviewer_from_db is not None

        assert (
            manager_from_db.role
            == "assessment_manager"
        )

        assert (
            reviewer_from_db.role
            == "assessment_reviewer"
        )

        token = login(
            RECRUITER_EMAIL,
            RECRUITER_PASSWORD,
        )

        response = client.get(
            "/jobs/collaborators",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        returned_ids = {
            item["id"]
            for item in data
        }

        returned_roles = {
            item["role"]
            for item in data
        }

        assert manager.id in returned_ids
        assert reviewer.id in returned_ids

        assert "assessment_manager" in returned_roles
        assert "assessment_reviewer" in returned_roles

        returned_manager = next(
            item
            for item in data
            if item["id"] == manager.id
        )

        returned_reviewer = next(
            item
            for item in data
            if item["id"] == reviewer.id
        )

        assert (
            returned_manager["role"]
            == "assessment_manager"
        )

        assert (
            returned_reviewer["role"]
            == "assessment_reviewer"
        )

    finally:
        if manager is not None:
            db.delete(manager)

        if reviewer is not None:
            db.delete(reviewer)

        db.commit()
        db.close()


def test_recruiter_can_read_current_job_collaboration():
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
            "read_manager",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
            "read_reviewer",
        )

        job = Job(
            title=(
                f"Read Collaboration "
                f"{uuid4().hex[:8]}"
            ),
            description=(
                "Backend developer role for "
                "collaboration API testing."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        db.add(
            JobAssessmentAccess(
                job_id=job.id,
                user_id=manager.id,
                assigned_by=recruiter.id,
            )
        )

        db.add(
            JobAssessmentAccess(
                job_id=job.id,
                user_id=reviewer.id,
                assigned_by=recruiter.id,
            )
        )

        db.commit()

        token = login(
            RECRUITER_EMAIL,
            RECRUITER_PASSWORD,
        )

        response = client.get(
            f"/jobs/{job.id}/collaboration",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["job_id"] == job.id
        assert (
            data["assessment_manager"]["id"]
            == manager.id
        )
        assert (
            data["assessment_reviewer"]["id"]
            == reviewer.id
        )

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

            db.query(AuditEvent).filter(
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


def test_non_recruiter_cannot_assign_job_collaborators():
    db = SessionLocal()

    recruiter = None
    manager = None
    reviewer = None
    candidate = None
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
            "auth_manager",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
            "auth_reviewer",
        )

        candidate = create_user(
            db,
            "candidate",
            "auth_candidate",
        )

        job = Job(
            title=(
                f"Authorization Test "
                f"{uuid4().hex[:8]}"
            ),
            description=(
                "Role authorization test for "
                "job collaboration."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        candidate_token = login(
            candidate.email,
            "Test@12345",
        )

        response = client.put(
            f"/jobs/{job.id}/collaboration",
            headers={
                "Authorization": (
                    f"Bearer {candidate_token}"
                ),
            },
            json={
                "assessment_manager_id": manager.id,
                "assessment_reviewer_id": reviewer.id,
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == (
            "Insufficient permissions"
        )

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

            db.query(AuditEvent).filter(
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

        if candidate is not None:
            db.delete(candidate)

        db.commit()
        db.close()


def test_same_user_cannot_be_manager_and_reviewer():
    db = SessionLocal()

    recruiter = None
    manager = None
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
            "same_user",
        )

        job = Job(
            title=(
                f"Same User Test "
                f"{uuid4().hex[:8]}"
            ),
            description=(
                "Validation test for preventing "
                "the same collaborator from holding "
                "both roles."
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
                "Authorization": f"Bearer {token}",
            },
            json={
                "assessment_manager_id": manager.id,
                "assessment_reviewer_id": manager.id,
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Assessment Manager and Assessment Reviewer "
            "must be different users."
        )

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

            db.query(AuditEvent).filter(
                AuditEvent.entity_type == "job",
                AuditEvent.entity_id == job.id,
            ).delete(
                synchronize_session=False
            )

            db.delete(job)
            db.commit()

        if manager is not None:
            db.delete(manager)

        db.commit()
        db.close()