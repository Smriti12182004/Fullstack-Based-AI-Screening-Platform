"""HR delivery activation, candidate management, and invitation email tests."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import (
    create_access_token,
    hash_password,
)
from app.db.session import SessionLocal
from app.db.timestamps import utc_now
from app.main import app
from app.models import (
    Assessment,
    AssessmentAssignment,
    AssessmentQuestion,
    Job,
    Question,
    QuestionSet,
    Skill,
    User,
)
from app.models.assessment_set import AssessmentSet


client = TestClient(app)


@pytest.fixture(autouse=True)
def suppress_assessment_invitation_smtp(monkeypatch):
    """Tests never use real SMTP unless a test explicitly replaces this mock."""
    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_assessment_invitation_email",
        lambda **kwargs: None,
    )


def create_test_user(
    db,
    role: str,
    *,
    verified: bool = True,
) -> User:
    unique = uuid4().hex[:10]

    user = User(
        username=f"hr_delivery_{role}_{unique}",
        email=f"hr_delivery_{role}_{unique}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=verified,
    )

    db.add(user)
    db.flush()

    return user


def token_for(user: User) -> str:
    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def create_delivery_fixture(
    db,
    *,
    handed_off: bool = True,
) -> dict:
    suffix = uuid4().hex[:8]

    recruiter = create_test_user(db, "recruiter")
    manager = create_test_user(db, "assessment_manager")
    reviewer = create_test_user(db, "assessment_reviewer")
    candidate_a = create_test_user(db, "candidate")
    candidate_b = create_test_user(db, "candidate")
    unverified_candidate = create_test_user(
        db,
        "candidate",
        verified=False,
    )

    job = Job(
        title=f"HR Delivery Job {suffix}",
        description="Backend delivery test job.",
        created_by=recruiter.id,
    )

    db.add(job)
    db.flush()

    question_set = QuestionSet(
        job_id=job.id,
        name=f"HR Delivery Question Set {suffix}",
        description="Question set for HR delivery tests.",
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
        reviewed_at=utc_now(),
        sent_to_hr_by=reviewer.id if handed_off else None,
        sent_to_hr_at=utc_now() if handed_off else None,
    )

    db.add(assessment_set)
    db.flush()

    skill = Skill(
        name=f"hr-delivery-skill-{suffix}",
    )

    db.add(skill)
    db.flush()

    question = Question(
        question_text=f"HR delivery snapshot question {suffix}",
        question_type="MCQ",
        skill_id=skill.id,
        difficulty="medium",
        options=[
            "Option A",
            "Option B",
            "Option C",
            "Option D",
        ],
        correct_answer="Option B",
        explanation="Option B is correct.",
        status="approved",
        source="manual",
    )

    db.add(question)
    db.flush()

    assessment = Assessment(
        job_id=job.id,
        question_set_id=question_set.id,
        variant_number=1,
        title=f"HR Delivery Assessment {suffix}",
        status="ready",
        review_status="approved",
    )

    db.add(assessment)
    db.flush()

    snapshot = AssessmentQuestion(
        assessment_id=assessment.id,
        question_id=question.id,
        display_order=1,
        question_text=question.question_text,
        question_type=question.question_type,
        skill_id=question.skill_id,
        difficulty=question.difficulty,
        options=question.options,
        correct_answer=question.correct_answer,
        explanation=question.explanation,
    )

    db.add(snapshot)
    db.commit()

    return {
        "recruiter": recruiter,
        "manager": manager,
        "reviewer": reviewer,
        "candidate_a": candidate_a,
        "candidate_b": candidate_b,
        "unverified_candidate": unverified_candidate,
        "job": job,
        "question_set": question_set,
        "assessment_set": assessment_set,
        "skill": skill,
        "question": question,
        "assessment": assessment,
        "snapshot": snapshot,
    }


def cleanup_delivery_fixture(db, fixture: dict) -> None:
    assessment_id = fixture["assessment"].id

    db.query(AssessmentAssignment).filter(
        AssessmentAssignment.assessment_id == assessment_id
    ).delete(synchronize_session=False)

    db.query(AssessmentQuestion).filter(
        AssessmentQuestion.assessment_id == assessment_id
    ).delete(synchronize_session=False)

    db.delete(fixture["assessment"])
    db.delete(fixture["assessment_set"])
    db.delete(fixture["question_set"])
    db.delete(fixture["question"])
    db.delete(fixture["skill"])
    db.delete(fixture["job"])
    db.flush()

    for key in (
        "unverified_candidate",
        "candidate_b",
        "candidate_a",
        "reviewer",
        "manager",
        "recruiter",
    ):
        db.delete(fixture[key])

    db.commit()


def valid_window() -> tuple[datetime, datetime]:
    opens_at = datetime.now(timezone.utc) + timedelta(days=1)
    closes_at = opens_at + timedelta(days=5)

    return opens_at, closes_at


def test_hr_candidate_list_only_returns_verified_candidate_accounts():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)

        response = client.get(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
        )

        assert response.status_code == 200

        returned_ids = {
            item["id"]
            for item in response.json()["items"]
        }

        assert fixture["candidate_a"].id in returned_ids
        assert fixture["candidate_b"].id in returned_ids
        assert fixture["unverified_candidate"].id not in returned_ids

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_hr_activation_publishes_and_creates_assignments_atomically():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)
        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [
                    fixture["candidate_a"].id,
                    fixture["candidate_b"].id,
                ],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 200, response.text

        data = response.json()

        assert data["assessment_id"] == fixture["assessment"].id
        assert data["assessment_set_id"] == fixture["assessment_set"].id
        assert data["assessment_status"] == "published"
        assert data["review_status"] == "approved"
        assert data["assignment_count"] == 2

        assert {
            item["candidate_id"]
            for item in data["assignments"]
        } == {
            fixture["candidate_a"].id,
            fixture["candidate_b"].id,
        }

        assert all(
            item["status"] == "assigned"
            for item in data["assignments"]
        )

        db.refresh(fixture["assessment"])
        assert fixture["assessment"].status == "published"

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == 2

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_hr_cannot_activate_assessment_before_reviewer_handoff():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(
            db,
            handed_off=False,
        )

        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [fixture["candidate_a"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 409
        assert "hand off" in response.json()["detail"].lower()

        db.refresh(fixture["assessment"])
        assert fixture["assessment"].status == "ready"

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == 0

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_hr_activation_rejects_invalid_availability_window_without_changes():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)
        opens_at, _ = valid_window()
        closes_at = opens_at - timedelta(minutes=1)

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [fixture["candidate_a"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 422

        db.refresh(fixture["assessment"])
        assert fixture["assessment"].status == "ready"

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == 0

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_hr_cannot_activate_another_recruiters_assessment():
    db = SessionLocal()
    fixture = None
    other_recruiter = None

    try:
        fixture = create_delivery_fixture(db)
        other_recruiter = create_test_user(db, "recruiter")
        db.commit()

        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(other_recruiter)}"
            },
            json={
                "candidate_ids": [fixture["candidate_a"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 403

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == 0

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if other_recruiter is not None:
            db.delete(other_recruiter)
            db.commit()

        db.close()


def test_hr_cannot_assign_unverified_candidate():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)
        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [fixture["unverified_candidate"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 422
        assert (
            "email-verified or have an active hr invitation"
            in response.json()["detail"].lower()
        )

        db.refresh(fixture["assessment"])
        assert fixture["assessment"].status == "ready"

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == 0

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_non_recruiter_cannot_list_candidates_or_activate_delivery():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)

        headers = {
            "Authorization": f"Bearer {token_for(fixture['manager'])}"
        }

        list_response = client.get(
            "/assessment-delivery/hr/candidates",
            headers=headers,
        )

        opens_at, closes_at = valid_window()

        activate_response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers=headers,
            json={
                "candidate_ids": [fixture["candidate_a"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert list_response.status_code == 403
        assert activate_response.status_code == 403

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_hr_can_add_candidate_by_name_email_and_list_pending_invitation(monkeypatch):
    db = SessionLocal()
    fixture = None
    created_user = None
    sent = {}
    email = f"hr-added-{uuid4().hex[:10]}@test.com"

    def fake_send(**kwargs):
        sent.update(kwargs)

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
        fake_send,
    )

    try:
        fixture = create_delivery_fixture(db)

        response = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "full_name": "New Candidate Example",
                "email": email,
            },
        )

        assert response.status_code == 201, response.text

        data = response.json()

        assert data["candidate"]["full_name"] == "New Candidate Example"
        assert data["candidate"]["email"] == email
        assert data["candidate"]["account_status"] == "pending_activation"
        assert "password-setup link" in data["message"].lower()
        assert sent["to_email"] == email

        from urllib.parse import parse_qs, urlparse

        sent_url = urlparse(sent["activation_url"])
        assert sent_url.query == ""
        assert sent_url.fragment.startswith("token=")

        raw_token = parse_qs(sent_url.fragment)["token"][0]
        assert raw_token not in response.text

        created_user = db.query(User).filter(
            User.email == email
        ).one()

        assert created_user.role == "candidate"
        assert created_user.is_email_verified is False
        assert created_user.invitation_token_hash
        assert created_user.invitation_token_expires_at is not None
        assert created_user.invitation_token_sent_at is not None

        listed = client.get(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
        )

        assert listed.status_code == 200

        listed_candidate = next(
            candidate
            for candidate in listed.json()["items"]
            if candidate["email"] == email
        )

        assert listed_candidate["account_status"] == "pending_activation"
        assert listed_candidate["can_revoke_invitation"] is True

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if created_user is not None:
            db.delete(created_user)
            db.commit()

        db.close()


def test_hr_invited_pending_candidate_can_be_assigned_but_arbitrary_unverified_user_cannot(
    monkeypatch,
):
    db = SessionLocal()
    fixture = None
    created_user = None
    email = f"hr-assign-pending-{uuid4().hex[:10]}@test.com"

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
        lambda **kwargs: None,
    )

    try:
        fixture = create_delivery_fixture(db)

        added = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "full_name": "Pending Invited Candidate",
                "email": email,
            },
        )

        assert added.status_code == 201, added.text

        created_user = db.query(User).filter(
            User.email == email
        ).one()

        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [created_user.id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 200, response.text
        assert response.json()["assignment_count"] == 1
        assert (
            response.json()["assignments"][0]["candidate_id"]
            == created_user.id
        )
        assert created_user.is_email_verified is False

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id,
            AssessmentAssignment.candidate_id == created_user.id,
        ).count() == 1

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if created_user is not None:
            db.delete(created_user)
            db.commit()

        db.close()


def test_candidate_invitation_activation_sets_password_and_consumes_token(
    monkeypatch,
):
    db = SessionLocal()
    fixture = None
    created_user = None
    sent = {}
    email = f"hr-activate-{uuid4().hex[:10]}@test.com"
    password = "CandidateSecurePass!2030"

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
        lambda **kwargs: sent.update(kwargs),
    )

    try:
        fixture = create_delivery_fixture(db)

        added = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "full_name": "Candidate To Activate",
                "email": email,
            },
        )

        assert added.status_code == 201, added.text

        created_user = db.query(User).filter(
            User.email == email
        ).one()

        from urllib.parse import parse_qs, urlparse
        from app.core.security import verify_password

        invitation_url = urlparse(sent["activation_url"])
        token = parse_qs(invitation_url.fragment)["token"][0]
        page = client.get(invitation_url.path)

        assert "Cache-Control" in page.headers
        assert "no-referrer" in page.headers.get("Referrer-Policy", "")
        assert page.status_code == 200
        assert "Set your password" in page.text

        activated = client.post(
            "/auth/activate-candidate-invitation",
            json={
                "token": token,
                "password": password,
            },
        )

        assert activated.status_code == 200, activated.text

        db.refresh(created_user)

        assert created_user.is_email_verified is True
        assert created_user.invitation_token_hash is None
        assert created_user.invitation_token_expires_at is None
        assert created_user.invitation_token_sent_at is None
        assert verify_password(password, created_user.password_hash)

        reused = client.post(
            "/auth/activate-candidate-invitation",
            json={
                "token": token,
                "password": password,
            },
        )

        assert reused.status_code == 400

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if created_user is not None:
            db.delete(created_user)
            db.commit()

        db.close()


def test_non_recruiter_cannot_add_candidate():
    db = SessionLocal()
    fixture = None
    email = f"hr-denied-{uuid4().hex[:10]}@test.com"

    try:
        fixture = create_delivery_fixture(db)

        response = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['manager'])}"
            },
            json={
                "full_name": "Forbidden Candidate",
                "email": email,
            },
        )

        assert response.status_code == 403
        assert db.query(User).filter(User.email == email).count() == 0

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_add_candidate_rejects_invalid_name_and_email():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)
        headers = {
            "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
        }

        short_name = client.post(
            "/assessment-delivery/hr/candidates",
            headers=headers,
            json={
                "full_name": " ",
                "email": f"valid-{uuid4().hex[:8]}@test.com",
            },
        )

        invalid_email = client.post(
            "/assessment-delivery/hr/candidates",
            headers=headers,
            json={
                "full_name": "Valid Candidate",
                "email": "not-an-email",
            },
        )

        assert short_name.status_code == 422
        assert invalid_email.status_code == 422

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_add_candidate_duplicate_email_does_not_create_account(monkeypatch):
    db = SessionLocal()
    fixture = None
    sent = []

    try:
        fixture = create_delivery_fixture(db)

        monkeypatch.setattr(
            "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
            lambda **kwargs: sent.append(kwargs),
        )

        response = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "full_name": "Different Name",
                "email": fixture["candidate_a"].email.upper(),
            },
        )

        assert response.status_code == 409
        assert db.query(User).filter(
            User.email.ilike(fixture["candidate_a"].email)
        ).count() == 1
        assert sent == []

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_email_failure_keeps_candidate_inactive_and_same_email_can_retry(
    monkeypatch,
):
    db = SessionLocal()
    fixture = None
    candidate = None
    email = f"hr-email-failure-{uuid4().hex[:10]}@test.com"
    calls = {"count": 0}

    def flaky_send(**kwargs):
        calls["count"] += 1

        if calls["count"] == 1:
            from app.services.email_service import EmailServiceError

            raise EmailServiceError("simulated SMTP failure")

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
        flaky_send,
    )

    try:
        fixture = create_delivery_fixture(db)
        headers = {
            "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
        }

        failed = client.post(
            "/assessment-delivery/hr/candidates",
            headers=headers,
            json={
                "full_name": "Retry Candidate",
                "email": email,
            },
        )

        assert failed.status_code == 503

        candidate = db.query(User).filter(
            User.email == email
        ).one()

        assert candidate.is_email_verified is False
        assert candidate.invitation_token_hash is None
        assert candidate.invitation_token_expires_at is None
        assert candidate.invitation_token_sent_at is None

        listed = client.get(
            "/assessment-delivery/hr/candidates",
            headers=headers,
        )

        assert all(
            item["id"] != candidate.id
            for item in listed.json()["items"]
        )

        retried = client.post(
            "/assessment-delivery/hr/candidates",
            headers=headers,
            json={
                "full_name": "Retry Candidate",
                "email": email,
            },
        )

        assert retried.status_code == 201, retried.text

        db.refresh(candidate)

        assert candidate.is_email_verified is False
        assert candidate.invitation_token_hash
        assert candidate.invitation_token_sent_at is not None
        assert calls["count"] == 2

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if candidate is not None:
            db.delete(candidate)
            db.commit()

        db.close()


def test_candidate_with_unsent_invitation_token_cannot_be_assigned():
    db = SessionLocal()
    fixture = None
    candidate = None

    try:
        fixture = create_delivery_fixture(db)
        candidate = create_test_user(db, "candidate", verified=False)
        candidate.full_name = "Unsent Invitation Candidate"
        candidate.invitation_token_hash = "f" * 64
        candidate.invitation_token_expires_at = (
            utc_now() + timedelta(days=1)
        )
        candidate.invitation_token_sent_at = None
        db.commit()

        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [candidate.id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 422
        assert (
            "email delivery was confirmed"
            in response.json()["detail"].lower()
        )

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == 0

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if candidate is not None:
            db.delete(candidate)
            db.commit()

        db.close()


def test_add_candidate_handles_generated_username_collision_without_duplicate(
    monkeypatch,
):
    db = SessionLocal()
    fixture = None
    collision_user = None
    target_email = f"hr-username-collision-{uuid4().hex[:10]}@test.com"
    sent = []

    try:
        fixture = create_delivery_fixture(db)

        collision_user = create_test_user(db, "candidate")
        collision_user.username = "same_name_abcdef"
        db.commit()

        monkeypatch.setattr(
            "app.services.assessment_delivery.hr_delivery_service.secrets.token_hex",
            lambda _n: "abcdef",
        )

        monkeypatch.setattr(
            "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
            lambda **kwargs: sent.append(kwargs),
        )

        response = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "full_name": "Same Name",
                "email": target_email,
            },
        )

        assert response.status_code == 409
        assert db.query(User).filter(
            User.email == target_email
        ).count() == 0
        assert sent == []

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if collision_user is not None:
            db.delete(collision_user)
            db.commit()

        db.close()


def test_reactivating_delivery_for_same_candidate_rejects_duplicate_assignment():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)
        opens_at, closes_at = valid_window()

        url = (
            f"/assessment-delivery/hr/assessments/"
            f"{fixture['assessment'].id}/activate"
        )

        headers = {
            "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
        }

        body = {
            "candidate_ids": [fixture["candidate_a"].id],
            "opens_at": opens_at.isoformat(),
            "closes_at": closes_at.isoformat(),
        }

        first = client.post(url, headers=headers, json=body)
        second = client.post(url, headers=headers, json=body)

        assert first.status_code == 200, first.text
        assert second.status_code == 409

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id,
            AssessmentAssignment.candidate_id
            == fixture["candidate_a"].id,
        ).count() == 1

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_recruiter_can_revoke_their_pending_candidate_invitation(monkeypatch):
    db = SessionLocal()
    fixture = None
    candidate = None
    email = f"hr-revoke-{uuid4().hex[:10]}@test.com"

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
        lambda **kwargs: None,
    )

    try:
        fixture = create_delivery_fixture(db)
        headers = {
            "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
        }

        added = client.post(
            "/assessment-delivery/hr/candidates",
            headers=headers,
            json={
                "full_name": "Candidate To Revoke",
                "email": email,
            },
        )

        assert added.status_code == 201, added.text

        candidate = db.query(User).filter(
            User.email == email
        ).one()

        assert candidate.invitation_created_by == fixture["recruiter"].id
        assert candidate.invitation_token_hash
        assert candidate.invitation_token_sent_at is not None

        listed = client.get(
            "/assessment-delivery/hr/candidates",
            headers=headers,
        )

        item = next(
            row
            for row in listed.json()["items"]
            if row["id"] == candidate.id
        )

        assert item["can_revoke_invitation"] is True

        response = client.delete(
            f"/assessment-delivery/hr/candidates/{candidate.id}/invitation",
            headers=headers,
        )

        assert response.status_code == 200, response.text
        assert response.json()["account_status"] == "invitation_revoked"

        db.refresh(candidate)

        assert candidate.is_email_verified is False
        assert candidate.invitation_token_hash is None
        assert candidate.invitation_token_expires_at is None
        assert candidate.invitation_token_sent_at is None
        assert db.query(User).filter(
            User.id == candidate.id
        ).count() == 1

        listed_after = client.get(
            "/assessment-delivery/hr/candidates",
            headers=headers,
        )

        assert all(
            row["id"] != candidate.id
            for row in listed_after.json()["items"]
        )

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if candidate is not None:
            db.delete(candidate)
            db.commit()

        db.close()


def test_non_recruiter_cannot_revoke_candidate_invitation(monkeypatch):
    db = SessionLocal()
    fixture = None
    candidate = None
    email = f"hr-revoke-denied-{uuid4().hex[:10]}@test.com"

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
        lambda **kwargs: None,
    )

    try:
        fixture = create_delivery_fixture(db)

        added = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "full_name": "Protected Candidate",
                "email": email,
            },
        )

        assert added.status_code == 201, added.text

        candidate = db.query(User).filter(
            User.email == email
        ).one()

        response = client.delete(
            f"/assessment-delivery/hr/candidates/{candidate.id}/invitation",
            headers={
                "Authorization": f"Bearer {token_for(fixture['manager'])}"
            },
        )

        assert response.status_code == 403

        db.refresh(candidate)
        assert candidate.invitation_token_hash
        assert candidate.invitation_token_sent_at is not None

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if candidate is not None:
            db.delete(candidate)
            db.commit()

        db.close()


def test_recruiter_cannot_revoke_another_recruiters_invitation(monkeypatch):
    db = SessionLocal()
    fixture = None
    candidate = None
    other_recruiter = None
    email = f"hr-revoke-owner-{uuid4().hex[:10]}@test.com"

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_candidate_activation_email",
        lambda **kwargs: None,
    )

    try:
        fixture = create_delivery_fixture(db)
        other_recruiter = create_test_user(db, "recruiter")
        db.commit()

        added = client.post(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "full_name": "Owned Candidate",
                "email": email,
            },
        )

        assert added.status_code == 201, added.text

        candidate = db.query(User).filter(
            User.email == email
        ).one()

        listed = client.get(
            "/assessment-delivery/hr/candidates",
            headers={
                "Authorization": f"Bearer {token_for(other_recruiter)}"
            },
        )

        other_item = next(
            row
            for row in listed.json()["items"]
            if row["id"] == candidate.id
        )

        assert other_item["can_revoke_invitation"] is False

        response = client.delete(
            f"/assessment-delivery/hr/candidates/{candidate.id}/invitation",
            headers={
                "Authorization": f"Bearer {token_for(other_recruiter)}"
            },
        )

        assert response.status_code == 403

        db.refresh(candidate)
        assert candidate.invitation_token_hash

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)

        if candidate is not None:
            db.delete(candidate)
            db.commit()

        if other_recruiter is not None:
            db.delete(other_recruiter)
            db.commit()

        db.close()


def test_verified_candidate_cannot_have_invitation_revoked():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_delivery_fixture(db)

        response = client.delete(
            f"/assessment-delivery/hr/candidates/{fixture['candidate_a'].id}/invitation",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
        )

        assert response.status_code == 409
        assert "already activated" in response.json()["detail"].lower()

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_activation_sends_candidate_specific_assessment_invitation(monkeypatch):
    db = SessionLocal()
    fixture = None
    sent = []

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_assessment_invitation_email",
        lambda **kwargs: sent.append(kwargs),
    )

    try:
        fixture = create_delivery_fixture(db)
        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [
                    fixture["candidate_a"].id,
                    fixture["candidate_b"].id,
                ],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 200, response.text

        data = response.json()

        assert data["invitation_emails_sent_count"] == 2
        assert data["invitation_emails_failed_count"] == 0
        assert len(sent) == 2

        assert {
            entry["to_email"]
            for entry in sent
        } == {
            fixture["candidate_a"].email,
            fixture["candidate_b"].email,
        }

        assert all(
            "#token=" in entry["invitation_url"]
            for entry in sent
        )

        assert all(
            entry["question_count"] == 1
            for entry in sent
        )

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_email_failure_does_not_rollback_published_assignment(monkeypatch):
    db = SessionLocal()
    fixture = None

    def fail_email(**kwargs):
        from app.services.email_service import EmailServiceError

        raise EmailServiceError("simulated SMTP failure")

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_assessment_invitation_email",
        fail_email,
    )

    try:
        fixture = create_delivery_fixture(db)
        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [fixture["candidate_a"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 200, response.text

        data = response.json()

        assert data["assessment_status"] == "published"
        assert data["assignment_count"] == 1
        assert data["invitation_emails_sent_count"] == 0
        assert data["invitation_emails_failed_count"] == 1

        db.refresh(fixture["assessment"])
        assert fixture["assessment"].status == "published"

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == 1

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_send_invitations_endpoint_resends_existing_assignment_without_duplicate(
    monkeypatch,
):
    db = SessionLocal()
    fixture = None
    sent = []

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_assessment_invitation_email",
        lambda **kwargs: sent.append(kwargs),
    )

    try:
        fixture = create_delivery_fixture(db)
        opens_at, closes_at = valid_window()

        activated = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [fixture["candidate_a"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert activated.status_code == 200, activated.text

        first_assignment_count = db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count()

        sent.clear()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/send-invitations",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
        )

        assert response.status_code == 200, response.text
        assert response.json()["invitation_emails_sent_count"] == 1
        assert len(sent) == 1

        assert db.query(AssessmentAssignment).filter(
            AssessmentAssignment.assessment_id
            == fixture["assessment"].id
        ).count() == first_assignment_count == 1

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()


def test_candidate_invitation_validation_rejects_unknown_token():
    response = client.post(
        "/assessment-delivery/candidate-invitations/validate",
        json={"token": "x" * 32},
    )

    assert response.status_code == 404


def test_candidate_invitation_link_validates_for_the_correct_assignment(
    monkeypatch,
):
    from urllib.parse import parse_qs, urlparse

    db = SessionLocal()
    fixture = None
    sent = []

    monkeypatch.setattr(
        "app.services.assessment_delivery.hr_delivery_service.send_assessment_invitation_email",
        lambda **kwargs: sent.append(kwargs),
    )

    try:
        fixture = create_delivery_fixture(db)
        opens_at, closes_at = valid_window()

        response = client.post(
            f"/assessment-delivery/hr/assessments/{fixture['assessment'].id}/activate",
            headers={
                "Authorization": f"Bearer {token_for(fixture['recruiter'])}"
            },
            json={
                "candidate_ids": [fixture["candidate_a"].id],
                "opens_at": opens_at.isoformat(),
                "closes_at": closes_at.isoformat(),
            },
        )

        assert response.status_code == 200, response.text
        assert len(sent) == 1

        invitation_url = urlparse(sent[0]["invitation_url"])
        assert invitation_url.query == ""

        token = parse_qs(invitation_url.fragment)["token"][0]

        from app.models import Attempt

        attempts_before_validation = db.query(Attempt).filter(
            Attempt.assessment_id == fixture["assessment"].id,
        ).count()

        validated = client.post(
            "/assessment-delivery/candidate-invitations/validate",
            json={"token": token},
        )

        assert validated.status_code == 200, validated.text

        payload = validated.json()

        assert payload["assessment_id"] == fixture["assessment"].id
        assert payload["assessment_title"] == fixture["assessment"].title
        assert payload["window_status"] == "not_open"
        assert "not open yet" in payload["message"].lower()

        # The invitation validation flow does not create candidate attempts.
        attempts_after_validation = db.query(Attempt).filter(
            Attempt.assessment_id == fixture["assessment"].id,
        ).count()

        assert attempts_after_validation == attempts_before_validation == 0

    finally:
        if fixture is not None:
            cleanup_delivery_fixture(db, fixture)
        db.close()