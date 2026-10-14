"""AssessmentSet reviewer-to-HR handoff API tests."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Assessment,
    AssessmentSet,
    Job,
    JobAssessmentAccess,
    Notification,
    QuestionSet,
    User,
)
from app.services import assessment_set_hr_handoff_service


client = TestClient(app)


def create_test_user(
    db,
    role: str,
) -> User:
    """Create an isolated verified user."""

    unique = uuid4().hex[:10]

    user = User(
        username=f"hr_handoff_{role}_{unique}",
        email=f"hr_handoff_{role}_{unique}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def token_for(
    user: User,
) -> str:
    """Create an application-compatible JWT."""

    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def create_fixture(
    db,
) -> dict:
    """
    Create:

    - one Assessment Manager who owns the QuestionSet
    - one HR/recruiter who owns the Job
    - one assigned Assessment Reviewer
    - one QuestionSet with two variants
    - one approved AssessmentSet
    - one existing ready/reviewer-approved Assessment
    """

    manager = create_test_user(
        db,
        "assessment_manager",
    )

    hr_user = create_test_user(
        db,
        "recruiter",
    )

    reviewer = create_test_user(
        db,
        "assessment_reviewer",
    )

    job = Job(
        title=f"HR Handoff Job {uuid4().hex[:8]}",
        description="AssessmentSet HR handoff test job.",
        created_by=hr_user.id,
    )

    db.add(job)
    db.flush()

    db.add(
        JobAssessmentAccess(
            job_id=job.id,
            user_id=reviewer.id,
            assigned_by=manager.id,
        )
    )

    question_set = QuestionSet(
        job_id=job.id,
        name=f"HR Handoff Question Set {uuid4().hex[:8]}",
        description="Question set used for HR handoff testing.",
        variant_count=2,
        status="draft",
        version=1,
        created_by=manager.id,
    )

    db.add(question_set)
    db.flush()

    assessment_set = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=1,
        label="A",
        status="approved",
        reviewer_id=reviewer.id,
    )

    db.add(assessment_set)
    db.flush()

    assessment = Assessment(
        job_id=job.id,
        question_set_id=question_set.id,
        variant_number=1,
        title="HR Handoff Assessment â€” Set A",
        status="ready",
        review_status="approved",
    )

    db.add(assessment)
    db.flush()

    # FastAPI requests receive a separate SessionLocal() through get_db().
    # Commit the fixture so the request session can see the created rows.
    db.commit()

    return {
        "manager": manager,
        "hr_user": hr_user,
        "reviewer": reviewer,
        "job": job,
        "question_set": question_set,
        "assessment_set": assessment_set,
        "assessment": assessment,
    }


def cleanup_fixture(
    db,
    fixture: dict,
) -> None:
    """Remove all records created by a test fixture."""

    notification_rows = (
        db.query(Notification)
        .filter(
            Notification.user_id == fixture["hr_user"].id,
        )
        .all()
    )

    for notification in notification_rows:
        db.delete(notification)

    assessment = fixture.get("assessment")

    if assessment is not None:
        db.delete(assessment)

    assessment_set = fixture.get("assessment_set")

    if assessment_set is not None:
        db.delete(assessment_set)

    question_set = fixture.get("question_set")

    if question_set is not None:
        db.delete(question_set)

    accesses = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == fixture["job"].id,
        )
        .all()
    )

    for access in accesses:
        db.delete(access)

    db.delete(fixture["job"])
    db.delete(fixture["reviewer"])
    db.delete(fixture["hr_user"])
    db.delete(fixture["manager"])

    db.commit()


def test_approved_assessment_set_can_be_sent_to_hr():
    db = SessionLocal()

    fixture = None

    try:
        fixture = create_fixture(db)

        token = token_for(
            fixture["reviewer"],
        )

        response = client.post(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set'].id}/send-to-hr",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        print(
            "\n========== APPROVED HANDOFF DEBUG =========="
        )
        print(
            "STATUS:",
            response.status_code,
        )
        print(
            "BODY:",
            response.text,
        )
        print(
            "ASSESSMENT SET ID:",
            fixture["assessment_set"].id,
        )
        print(
            "QUESTION SET ID:",
            fixture["question_set"].id,
        )
        print(
            "JOB ID:",
            fixture["job"].id,
        )
        print(
            "REVIEWER ID:",
            fixture["reviewer"].id,
        )
        print(
            "HR USER ID:",
            fixture["hr_user"].id,
        )
        print(
            "HR USER ROLE:",
            fixture["hr_user"].role,
        )
        print(
            "JOB CREATED BY:",
            fixture["job"].created_by,
        )
        print(
            "ASSESSMENT SET STATUS:",
            fixture["assessment_set"].status,
        )
        print(
            "============================================"
        )

        assert response.status_code == 200

        data = response.json()

        assert (
            data["assessment_set_id"]
            == fixture["assessment_set"].id
        )

        assert (
            data["assessment_id"]
            == fixture["assessment"].id
        )

        assert data["status"] == "ready"
        assert data["review_status"] == "approved"
        assert data["sent_to_hr"] is True

        db.refresh(
            fixture["assessment_set"],
        )

        assert (
            fixture["assessment_set"].sent_to_hr_by
            == fixture["reviewer"].id
        )

        assert (
            fixture["assessment_set"].sent_to_hr_at
            is not None
        )

        notification = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == fixture["hr_user"].id,
                Notification.notification_type
                == "ASSESSMENT_SENT_TO_HR",
                Notification.entity_type
                == "assessment",
                Notification.entity_id
                == fixture["assessment"].id,
            )
            .one()
        )

        assert notification.is_read is False

        assert (
            "approved by the Assessment Reviewer"
            in notification.message
        )

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        db.close()


def test_repeated_hr_handoff_is_idempotent():
    db = SessionLocal()

    fixture = None

    try:
        fixture = create_fixture(db)

        token = token_for(
            fixture["reviewer"],
        )

        url = (
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set'].id}/send-to-hr"
        )

        first_response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        print(
            "\n========== FIRST HANDOFF DEBUG =========="
        )
        print(
            "FIRST STATUS:",
            first_response.status_code,
        )
        print(
            "FIRST BODY:",
            first_response.text,
        )
        print(
            "========================================="
        )

        second_response = client.post(
            url,
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        print(
            "\n========== SECOND HANDOFF DEBUG ========="
        )
        print(
            "SECOND STATUS:",
            second_response.status_code,
        )
        print(
            "SECOND BODY:",
            second_response.text,
        )
        print(
            "========================================="
        )

        assert first_response.status_code == 200
        assert second_response.status_code == 200

        first_data = first_response.json()
        second_data = second_response.json()

        assert (
            first_data["assessment_id"]
            == second_data["assessment_id"]
        )

        notification_count = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == fixture["hr_user"].id,
                Notification.notification_type
                == "ASSESSMENT_SENT_TO_HR",
                Notification.entity_id
                == fixture["assessment"].id,
            )
            .count()
        )

        assert notification_count == 1

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        db.close()


def test_unapproved_assessment_set_cannot_be_sent_to_hr():
    db = SessionLocal()

    fixture = None

    try:
        fixture = create_fixture(db)

        fixture["assessment_set"].status = (
            "submitted_for_review"
        )

        db.commit()

        token = token_for(
            fixture["reviewer"],
        )

        response = client.post(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set'].id}/send-to-hr",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 422

        assert (
            response.json()["detail"]
            == "Only approved assessment sets can be sent to HR."
        )

        db.refresh(
            fixture["assessment_set"],
        )

        assert (
            fixture["assessment_set"].sent_to_hr_at
            is None
        )

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        db.close()


def test_non_assigned_reviewer_cannot_send_to_hr():
    db = SessionLocal()

    fixture = None
    unauthorized_reviewer = None

    try:
        fixture = create_fixture(db)

        unauthorized_reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        db.commit()

        token = token_for(
            unauthorized_reviewer,
        )

        response = client.post(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set'].id}/send-to-hr",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 403

        assert (
            response.json()["detail"]
            == "You are not the assigned reviewer for this assessment set."
        )

        db.refresh(
            fixture["assessment_set"],
        )

        assert (
            fixture["assessment_set"].sent_to_hr_at
            is None
        )

    finally:
        if unauthorized_reviewer is not None:
            db.delete(
                unauthorized_reviewer,
            )
            db.commit()

        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        db.close()


def test_hr_handoff_materializes_assessment_when_missing(
    monkeypatch: pytest.MonkeyPatch,
):
    db = SessionLocal()

    fixture = None
    created_assessment = None

    try:
        fixture = create_fixture(db)

        db.delete(
            fixture["assessment"],
        )
        db.flush()

        # The API request uses a separate database session. Commit the
        # deletion so that session can see the Assessment as missing and
        # exercise the materialization path.
        db.commit()

        fixture["assessment"] = None

        def fake_materialize(
            db,
            assessment_set_id,
        ):
            assessment = Assessment(
                job_id=fixture["job"].id,
                question_set_id=fixture["question_set"].id,
                variant_number=1,
                title="Materialized Handoff Assessment",
                status="ready",
                review_status="approved",
            )

            db.add(assessment)
            db.flush()

            return assessment

        monkeypatch.setattr(
            assessment_set_hr_handoff_service,
            "materialize_assessment_set",
            fake_materialize,
        )

        token = token_for(
            fixture["reviewer"],
        )

        response = client.post(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set'].id}/send-to-hr",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        print(
            "\n========== MATERIALIZE HANDOFF DEBUG =========="
        )
        print(
            "STATUS:",
            response.status_code,
        )
        print(
            "BODY:",
            response.text,
        )
        print(
            "ASSESSMENT SET ID:",
            fixture["assessment_set"].id,
        )
        print(
            "QUESTION SET ID:",
            fixture["question_set"].id,
        )
        print(
            "JOB ID:",
            fixture["job"].id,
        )
        print(
            "REVIEWER ID:",
            fixture["reviewer"].id,
        )
        print(
            "HR USER ID:",
            fixture["hr_user"].id,
        )
        print(
            "HR USER ROLE:",
            fixture["hr_user"].role,
        )
        print(
            "JOB CREATED BY:",
            fixture["job"].created_by,
        )
        print(
            "ASSESSMENT SET STATUS:",
            fixture["assessment_set"].status,
        )
        print(
            "==============================================="
        )

        assert response.status_code == 200

        data = response.json()

        assert data["status"] == "ready"
        assert data["review_status"] == "approved"
        assert data["sent_to_hr"] is True
        assert data["assessment_id"] is not None

        created_assessment = db.get(
            Assessment,
            data["assessment_id"],
        )

        assert created_assessment is not None
        assert created_assessment.status == "ready"
        assert created_assessment.review_status == "approved"

        fixture["assessment"] = created_assessment

    finally:
        if fixture is not None:
            if (
                fixture.get("assessment") is None
                and created_assessment is not None
            ):
                fixture["assessment"] = created_assessment

            cleanup_fixture(
                db,
                fixture,
            )

        db.close()