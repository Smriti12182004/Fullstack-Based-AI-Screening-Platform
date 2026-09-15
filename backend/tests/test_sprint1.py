"""
Sprint 1 automated regression tests.

Coverage:
- S1-01: Backend foundation
- S1-02: Database foundation
- S1-03A: Authentication
- S1-03B: Role-based access control
- S1-04: Job description creation, upload, validation, and retrieval

These tests target the configured development/test database. Test credentials
can be overridden with environment variables.
"""

from datetime import datetime, timedelta, timezone
from io import BytesIO
import os

import jwt
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas
from sqlalchemy import inspect

from app.core.config import settings
from app.core.security import ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import Assessment, Attempt, Job, User


client = TestClient(app)

RECRUITER_EMAIL = os.getenv("TEST_RECRUITER_EMAIL", "recruiter@test.com")
RECRUITER_PASSWORD = os.getenv("TEST_RECRUITER_PASSWORD", "recruiter")

CANDIDATE_EMAIL = os.getenv("TEST_CANDIDATE_EMAIL", "candidate@test.com")
CANDIDATE_PASSWORD = os.getenv("TEST_CANDIDATE_PASSWORD", "candidate")

ADMIN_EMAIL = os.getenv("TEST_ADMIN_EMAIL", "admin@test.com")
ADMIN_PASSWORD = os.getenv("TEST_ADMIN_PASSWORD", "admin")


def login(email: str, password: str) -> str:
    """Authenticate a test user and return the bearer token."""
    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 200
    return response.json()["access_token"]


# ============================================================================
# S1-01: Backend Foundation
# ============================================================================


def test_health_check():
    """Health endpoint returns the expected service status."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_documentation_available():
    """OpenAPI documentation is exposed and uses the configured app name."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    data = response.json()

    assert "openapi" in data
    assert data["info"]["title"] == settings.app_name


def test_unknown_endpoint_returns_404():
    """Unknown routes return a standard 404 response."""
    response = client.get("/this-endpoint-does-not-exist")

    assert response.status_code == 404


def test_create_job_with_invalid_request_body_returns_422():
    """Missing required job fields are rejected by request validation."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Only Title Provided"},
    )

    assert response.status_code == 422


def test_get_job_with_invalid_id_returns_422():
    """Non-integer path parameters are rejected by request validation."""
    response = client.get("/jobs/not-an-integer")

    assert response.status_code == 422


# ============================================================================
# S1-02: Database Foundation
# ============================================================================


def test_core_database_tables_exist():
    """All Sprint 1 core tables are present in PostgreSQL."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    expected_tables = {
        "users",
        "jobs",
        "skills",
        "questions",
        "assessments",
        "attempts",
        "responses",
        "results",
        "audit_events",
    }

    assert expected_tables.issubset(tables)


def test_admin_users_requires_authentication():
    """Admin endpoints reject unauthenticated requests."""
    response = client.get("/admin/users")

    assert response.status_code == 401


def test_get_nonexistent_job():
    """Missing jobs return a clear 404 response."""
    response = client.get("/jobs/999999999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_get_nonexistent_assessment_returns_404():
    """Existing candidate authorization cannot hide a nonexistent assessment."""
    token = login(CANDIDATE_EMAIL, CANDIDATE_PASSWORD)

    response = client.get(
        "/assessments/999999999",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Assessment not found"


# ============================================================================
# S1-03A: Authentication
# ============================================================================


def test_login_with_invalid_credentials():
    """Incorrect credentials return 401 without issuing a token."""
    response = client.post(
        "/auth/login",
        json={
            "email": RECRUITER_EMAIL,
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_with_valid_recruiter_credentials():
    """Recruiter login returns a valid bearer token and role metadata."""
    response = client.post(
        "/auth/login",
        json={
            "email": RECRUITER_EMAIL,
            "password": RECRUITER_PASSWORD,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["access_token"]
    assert data["token_type"] == "bearer"
    assert data["user_id"] == 1
    assert data["role"] == "recruiter"


def test_candidate_login():
    """Candidate login returns the expected identity and role."""
    response = client.post(
        "/auth/login",
        json={
            "email": CANDIDATE_EMAIL,
            "password": CANDIDATE_PASSWORD,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["access_token"]
    assert data["user_id"] == 2
    assert data["role"] == "candidate"
    assert data["token_type"] == "bearer"


def test_admin_login():
    """Admin login returns the expected identity and role."""
    response = client.post(
        "/auth/login",
        json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["access_token"]
    assert data["user_id"] == 3
    assert data["role"] == "admin"
    assert data["token_type"] == "bearer"


def test_missing_authorization_header_is_rejected():
    """Protected endpoints require an Authorization header."""
    response = client.get("/admin/users")

    assert response.status_code == 401


def test_invalid_bearer_token_is_rejected():
    """Malformed bearer tokens are rejected."""
    response = client.get(
        "/admin/users",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


def test_expired_jwt_is_rejected():
    """Expired JWTs cannot access protected endpoints."""
    expired_token = jwt.encode(
        {
            "sub": "1",
            "role": "recruiter",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response = client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {expired_token}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Token has expired"


def test_jwt_without_user_id_is_rejected():
    """JWTs without a subject are rejected."""
    token = jwt.encode(
        {
            "role": "recruiter",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response = client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"


def test_jwt_without_role_is_rejected():
    """JWTs without a role claim are rejected."""
    token = jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response = client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"


def test_jwt_with_invalid_user_id_is_rejected():
    """JWTs with a non-numeric user ID are rejected."""
    token = jwt.encode(
        {
            "sub": "not-an-integer",
            "role": "recruiter",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response = client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"


def test_logout():
    """Logout endpoint returns a successful response for an authenticated user."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert "Logout successful" in response.json()["message"]


# ============================================================================
# S1-03B: Role-Based Access Control
# ============================================================================


def test_admin_can_view_users():
    """Admin users can access the admin user listing."""
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    response = client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200

    users = response.json()
    assert len(users) >= 3
    assert all("password_hash" not in user for user in users)


def test_candidate_cannot_access_admin_users():
    """Candidates cannot access admin-only routes."""
    token = login(CANDIDATE_EMAIL, CANDIDATE_PASSWORD)

    response = client.get(
        "/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_candidate_cannot_create_job():
    """Candidates cannot create recruiter-owned jobs."""
    token = login(CANDIDATE_EMAIL, CANDIDATE_PASSWORD)

    response = client.post(
        "/jobs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Candidate Access Test",
            "description": "Candidate should not be allowed to create this job.",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_admin_cannot_create_job():
    """Admins cannot create recruiter-owned jobs."""
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    response = client.post(
        "/jobs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Admin Access Test",
            "description": "Admin should not be allowed to create this job.",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_recruiter_cannot_access_candidate_assessment():
    """Recruiters cannot access candidate-only assessment routes."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.get(
        "/assessments/1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_admin_cannot_access_candidate_assessment():
    """Admins cannot access candidate-only assessment routes."""
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    response = client.get(
        "/assessments/1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_candidate_can_access_assigned_assessment():
    """A candidate can access an assessment assigned through an attempt."""
    token = login(CANDIDATE_EMAIL, CANDIDATE_PASSWORD)

    response = client.get(
        "/assessments/1",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["assessment_id"] == 1
    assert data["job_id"] == 1
    assert data["attempt_id"] in (1, 2)
    assert data["title"] == "S1-02 Database Link Test"


def test_candidate_cannot_access_unassigned_assessment():
    """A candidate cannot access an existing assessment not assigned to them."""
    token = login(CANDIDATE_EMAIL, CANDIDATE_PASSWORD)

    response = client.get(
        "/assessments/2",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == (
        "Assessment not assigned to this candidate"
    )


# ============================================================================
# S1-04: Job Description
# ============================================================================


def test_recruiter_can_create_job():
    """Recruiters can create a JD through the JSON endpoint."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Automated Test Job",
            "description": (
                "Senior Python Developer with FastAPI and PostgreSQL "
                "experience."
            ),
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["title"] == "Automated Test Job"
    assert data["created_by"] == 1
    assert len(data["description"]) >= 20


def test_get_jobs():
    """Job collection endpoint returns a list."""
    response = client.get("/jobs")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_created_job():
    """A newly created job can be retrieved by ID."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    create_response = client.post(
        "/jobs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Retrieval Test Job",
            "description": (
                "Python backend developer with FastAPI and PostgreSQL skills."
            ),
        },
    )

    assert create_response.status_code == 201

    job_id = create_response.json()["id"]

    response = client.get(f"/jobs/{job_id}")

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == job_id
    assert data["title"] == "Retrieval Test Job"
    assert data["description"]


def test_recruiter_can_upload_txt_job_description():
    """Recruiters can upload a valid TXT JD and persist its contents."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "automated_test_jd.txt",
                (
                    b"Senior Python Developer with strong FastAPI and "
                    b"PostgreSQL experience."
                ),
                "text/plain",
            )
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["title"] == "automated_test_jd"
    assert data["created_by"] == 1
    assert "FastAPI" in data["description"]


def test_recruiter_can_upload_pdf_job_description():
    """Recruiters can upload a PDF and the application extracts its text."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    pdf_buffer = BytesIO()
    pdf = canvas.Canvas(pdf_buffer)

    pdf.drawString(72, 750, "Senior Python Developer")
    pdf.drawString(
        72,
        720,
        "We are looking for a Python developer with FastAPI and "
        "PostgreSQL experience.",
    )

    pdf.save()
    pdf_buffer.seek(0)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "automated_test_jd.pdf",
                pdf_buffer.read(),
                "application/pdf",
            )
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["title"] == "automated_test_jd"
    assert data["created_by"] == 1
    assert "Senior Python Developer" in data["description"]
    assert "FastAPI" in data["description"]
    assert "PostgreSQL" in data["description"]


def test_short_job_description_rejected():
    """JD content shorter than 20 characters is rejected."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "short.txt",
                b"short",
                "text/plain",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Job description must contain at least 20 characters."
    )


def test_whitespace_only_job_description_is_rejected():
    """Whitespace-only JD content is rejected after trimming."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "whitespace.txt",
                b"                         ",
                "text/plain",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Job description must contain at least 20 characters."
    )


def test_empty_file_rejected():
    """Completely empty uploads are rejected."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "empty.txt",
                b"",
                "text/plain",
            )
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file is empty."


def test_upload_without_file_is_rejected():
    """Upload requests without a file fail request validation."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_unsupported_file_type_rejected():
    """Unsupported document formats are rejected."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "invalid.docx",
                b"This is an unsupported file type test.",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Unsupported file type. Only TXT and PDF files are supported."
    )


def test_malformed_pdf_is_rejected():
    """A PDF MIME type containing invalid PDF bytes is rejected."""
    token = login(RECRUITER_EMAIL, RECRUITER_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "malformed.pdf",
                b"This is not a real PDF file.",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Unable to extract text from the uploaded PDF."
    )


def test_candidate_cannot_upload_job_description():
    """Candidates cannot upload recruiter-owned job descriptions."""
    token = login(CANDIDATE_EMAIL, CANDIDATE_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "candidate.txt",
                b"Senior Python Developer with FastAPI experience.",
                "text/plain",
            )
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_admin_cannot_upload_job_description():
    """Admins cannot upload recruiter-owned job descriptions."""
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    response = client.post(
        "/jobs/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                "admin.txt",
                b"Senior Python Developer with FastAPI experience.",
                "text/plain",
            )
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"

# S1-02: Database relationship integrity

def test_database_relationships_are_persisted():
    """Verify User -> Job -> Assessment -> Attempt foreign-key relationships."""
    db = SessionLocal()

    try:
        recruiter = (
            db.query(User)
            .filter(User.email == RECRUITER_EMAIL)
            .first()
        )
        candidate = (
            db.query(User)
            .filter(User.email == CANDIDATE_EMAIL)
            .first()
        )

        assert recruiter is not None
        assert candidate is not None

        job = Job(
            title="Database Relationship Test",
            description=(
                "Test job for validating Sprint 1 database relationships."
            ),
            created_by=recruiter.id,
        )
        db.add(job)
        db.flush()

        assessment = Assessment(
            job_id=job.id,
            title="Database Relationship Assessment",
            status="active",
        )
        db.add(assessment)
        db.flush()

        attempt = Attempt(
            assessment_id=assessment.id,
            candidate_id=candidate.id,
        )
        db.add(attempt)
        db.flush()

        assert job.created_by == recruiter.id
        assert assessment.job_id == job.id
        assert attempt.assessment_id == assessment.id
        assert attempt.candidate_id == candidate.id
        assert attempt.status == "started"
        assert attempt.started_at is not None
        assert attempt.created_at is not None
        assert attempt.updated_at is not None

    finally:
        db.rollback()
        db.close()
