from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Job,
    JobAssessmentAccess,
    QuestionSet,
    User,
)


client = TestClient(app)

RECRUITER_EMAIL = "recruiter@test.com"
RECRUITER_PASSWORD = "recruiter"

MANAGER_EMAIL = "s4_assessment_manager@test.com"
MANAGER_PASSWORD = "Test@12345"


def login(email: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 200

    return response.json()["access_token"]


def main() -> None:
    db = SessionLocal()

    job = None
    question_set = None
    access = None

    try:
        # ---------------------------------------------------------
        # 1. Get existing recruiter and assessment manager
        # ---------------------------------------------------------
        recruiter = (
            db.query(User)
            .filter(User.email == RECRUITER_EMAIL)
            .first()
        )

        manager = (
            db.query(User)
            .filter(User.email == MANAGER_EMAIL)
            .first()
        )

        assert recruiter is not None
        assert manager is not None

        # ---------------------------------------------------------
        # 2. Create isolated recruiter-owned job
        # ---------------------------------------------------------
        job = Job(
            title=f"Access Test Job {uuid4().hex[:8]}",
            description=(
                "Python backend developer with FastAPI "
                "and PostgreSQL experience."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        print(f"\nCreated Job ID: {job.id}")
        print(f"Job Owner: {job.created_by}")

        assert job.created_by == recruiter.id

        # ---------------------------------------------------------
        # 3. Login as Assessment Manager
        # ---------------------------------------------------------
        manager_token = login(
            MANAGER_EMAIL,
            MANAGER_PASSWORD,
        )

        manager_headers = {
            "Authorization": f"Bearer {manager_token}",
        }

        # ---------------------------------------------------------
        # 4. Manager WITHOUT access must receive 403
        # ---------------------------------------------------------
        no_access_response = client.post(
            "/question-sets",
            headers=manager_headers,
            json={
                "job_id": job.id,
                "name": "Unauthorized Question Set",
                "description": "Should not be created.",
            },
        )

        print("\nWITHOUT JOB ACCESS")
        print(no_access_response.status_code)
        print(no_access_response.text)

        assert no_access_response.status_code == 403

        # ---------------------------------------------------------
        # 5. Grant Job access to Assessment Manager
        # ---------------------------------------------------------
        access = JobAssessmentAccess(
            job_id=job.id,
            user_id=manager.id,
            assigned_by=recruiter.id,
        )

        db.add(access)
        db.commit()
        db.refresh(access)

        print("\nJOB ACCESS GRANTED")
        print(f"Access ID: {access.id}")
        print(f"Job ID: {access.job_id}")
        print(f"Manager ID: {access.user_id}")
        print(f"Assigned By: {access.assigned_by}")

        # ---------------------------------------------------------
        # 6. Manager WITH access can create QuestionSet
        # ---------------------------------------------------------
        with_access_response = client.post(
            "/question-sets",
            headers=manager_headers,
            json={
                "job_id": job.id,
                "name": "Authorized Question Set",
                "description": "Created after job access was granted.",
            },
        )

        print("\nWITH JOB ACCESS")
        print(with_access_response.status_code)
        print(with_access_response.text)

        assert with_access_response.status_code == 201

        created_question_set = with_access_response.json()

        assert created_question_set["job_id"] == job.id
        assert created_question_set["created_by"] == manager.id

        question_set = db.get(
            QuestionSet,
            created_question_set["id"],
        )

        assert question_set is not None
        assert question_set.job_id == job.id
        assert question_set.created_by == manager.id

        print("\nQUESTION SET CREATED")
        print(f"Question Set ID: {question_set.id}")
        print(f"Job ID: {question_set.job_id}")
        print(f"Created By: {question_set.created_by}")

        print("\n========================================")
        print("JOB ASSESSMENT ACCESS TEST PASSED")
        print("========================================")

    finally:
        # ---------------------------------------------------------
        # Cleanup
        # ---------------------------------------------------------
        if job is not None:
            if question_set is not None:
                db.delete(question_set)

            if access is not None:
                db.delete(access)

            db.delete(job)
            db.commit()

        db.close()


if __name__ == "__main__":
    main()