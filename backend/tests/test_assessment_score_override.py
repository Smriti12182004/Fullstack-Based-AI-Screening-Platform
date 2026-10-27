import json
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.db.timestamps import utc_now
from app.main import app
from app.models import Assessment, Attempt, AuditEvent, Job, QuestionSet, Result, User


client = TestClient(app)


def create_user(db, role):
    suffix = uuid4().hex[:10]
    user = User(
        username=f"score_override_{role}_{suffix}",
        email=f"score_override_{role}_{suffix}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def auth_headers(user):
    token = create_access_token(
        {"sub": str(user.id), "role": user.role}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def score_fixture():
    db = SessionLocal()
    data = {}

    try:
        recruiter = create_user(db, "recruiter")
        outsider = create_user(db, "recruiter")
        candidate = create_user(db, "candidate")
        data.update(
            recruiter=recruiter,
            outsider=outsider,
            candidate=candidate,
        )

        suffix = uuid4().hex[:8]
        job = Job(
            title=f"Override test job {suffix}",
            description="Job for score override API tests.",
            created_by=recruiter.id,
        )
        db.add(job)
        db.flush()
        data["job"] = job

        question_set = QuestionSet(
            job_id=job.id,
            name=f"Override test question set {suffix}",
            description="Question set for score override API tests.",
            variant_count=2,
            status="draft",
            version=1,
            created_by=recruiter.id,
        )
        db.add(question_set)
        db.flush()
        data["question_set"] = question_set

        assessment = Assessment(
            job_id=job.id,
            question_set_id=question_set.id,
            variant_number=1,
            title=f"Override test assessment {suffix}",
            status="published",
            review_status="approved",
        )
        db.add(assessment)
        db.flush()
        data["assessment"] = assessment

        attempt = Attempt(
            assessment_id=assessment.id,
            candidate_id=candidate.id,
            status="submitted",
            started_at=utc_now(),
            submitted_at=utc_now(),
        )
        db.add(attempt)
        db.flush()
        data["attempt"] = attempt

        result = Result(
            attempt_id=attempt.id,
            score=None,
            status="needs_review",
            earned_points=None,
            max_points=Decimal("40.00"),
            feedback="Manual grading is required.",
        )
        db.add(result)
        db.flush()
        data["result"] = result
        db.commit()

        yield data

    finally:
        db.rollback()
        attempt = data.get("attempt")
        if attempt is not None and attempt.id is not None:
            db.query(AuditEvent).filter(
                AuditEvent.attempt_id == attempt.id
            ).delete(synchronize_session=False)
            db.query(Result).filter(
                Result.attempt_id == attempt.id
            ).delete(synchronize_session=False)
            db.query(Attempt).filter(
                Attempt.id == attempt.id
            ).delete(synchronize_session=False)

        assessment = data.get("assessment")
        if assessment is not None and assessment.id is not None:
            db.query(Assessment).filter(
                Assessment.id == assessment.id
            ).delete(synchronize_session=False)

        question_set = data.get("question_set")
        if question_set is not None and question_set.id is not None:
            db.query(QuestionSet).filter(
                QuestionSet.id == question_set.id
            ).delete(synchronize_session=False)

        job = data.get("job")
        if job is not None and job.id is not None:
            db.query(Job).filter(
                Job.id == job.id
            ).delete(synchronize_session=False)

        user_ids = [
            user.id
            for key in ("candidate", "outsider", "recruiter")
            if (user := data.get(key)) is not None and user.id is not None
        ]
        if user_ids:
            db.query(User).filter(
                User.id.in_(user_ids)
            ).delete(synchronize_session=False)

        db.commit()
        db.close()


def override_url(data):
    return (
        f"/assessments/{data['assessment'].id}/results/"
        f"{data['attempt'].id}/override"
    )


def get_saved_result(db, attempt_id):
    db.expire_all()
    return (
        db.query(Result)
        .filter(Result.attempt_id == attempt_id)
        .order_by(Result.id.desc())
        .first()
    )


def count_override_events(db, attempt_id):
    return db.query(AuditEvent).filter(
        AuditEvent.attempt_id == attempt_id,
        AuditEvent.action == "assessment_score_overridden",
    ).count()


def test_override_saves_score_points_reason_and_audit_event(score_fixture):
    data = score_fixture
    reason = "Manual review confirmed the partial-credit adjustment."

    response = client.post(
        override_url(data),
        headers=auth_headers(data["recruiter"]),
        json={"score": "82.50", "reason": reason},
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["result"]["status"] == "completed"
    assert payload["result"]["score"] == 82.5
    assert payload["result"]["earned_points"] == 33.0
    assert reason in payload["result"]["feedback"]

    db = data["result"]
    session = SessionLocal()
    try:
        saved = get_saved_result(session, data["attempt"].id)
        assert saved.status == "completed"
        assert Decimal(str(saved.score)) == Decimal("82.50")
        assert Decimal(str(saved.earned_points)) == Decimal("33.00")

        event = session.query(AuditEvent).filter(
            AuditEvent.attempt_id == data["attempt"].id,
            AuditEvent.action == "assessment_score_overridden",
        ).one()
        details = json.loads(event.details)

        assert event.user_id == data["recruiter"].id
        assert details["previous_score"] is None
        assert details["new_score"] == 82.5
        assert details["previous_status"] == "needs_review"
        assert details["new_status"] == "completed"
        assert details["reason"] == reason
    finally:
        session.close()


def test_override_is_rejected_while_grading_is_in_progress(score_fixture):
    data = score_fixture
    data["result"].status = "grading"
    data["result"].score = None
    data["result"].feedback = None
    data["result"].graded_at = None
    data["result"].grading_job_id = "test-running-job"
    # Use a separate committed session so the API sees the persisted state.
    data_session = SessionLocal()
    try:
        saved = data_session.get(Result, data["result"].id)
        saved.status = "grading"
        saved.score = None
        saved.feedback = None
        saved.graded_at = None
        saved.grading_job_id = "test-running-job"
        data_session.commit()
    finally:
        data_session.close()

    response = client.post(
        override_url(data),
        headers=auth_headers(data["recruiter"]),
        json={"score": "82.50", "reason": "Manual review adjustment."},
    )

    assert response.status_code == 409, response.text
    check_session = SessionLocal()
    try:
        saved = get_saved_result(check_session, data["attempt"].id)
        assert saved.status == "grading"
        assert saved.score is None
        assert count_override_events(check_session, data["attempt"].id) == 0
    finally:
        check_session.close()


def test_candidate_cannot_override_a_score(score_fixture):
    data = score_fixture
    response = client.post(
        override_url(data),
        headers=auth_headers(data["candidate"]),
        json={"score": "82.50", "reason": "Manual review adjustment."},
    )

    assert response.status_code == 403, response.text


def test_recruiter_without_job_access_cannot_override_score(score_fixture):
    data = score_fixture
    response = client.post(
        override_url(data),
        headers=auth_headers(data["outsider"]),
        json={"score": "82.50", "reason": "Manual review adjustment."},
    )

    assert response.status_code == 403, response.text


@pytest.mark.parametrize(
    ("score", "reason"),
    [
        ("100.01", "Score exceeds the allowed range."),
        ("-0.01", "Score is below the allowed range."),
        ("82.123", "Score has too many decimal places."),
        ("80.00", "     "),
    ],
)
def test_invalid_score_or_blank_reason_is_rejected(
    score_fixture, score, reason
):
    data = score_fixture
    response = client.post(
        override_url(data),
        headers=auth_headers(data["recruiter"]),
        json={"score": score, "reason": reason},
    )

    assert response.status_code == 422, response.text
    check_session = SessionLocal()
    try:
        saved = get_saved_result(check_session, data["attempt"].id)
        assert saved.status == "needs_review"
        assert saved.score is None
        assert count_override_events(check_session, data["attempt"].id) == 0
    finally:
        check_session.close()
