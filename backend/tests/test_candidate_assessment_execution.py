"""Regression tests for HR-created candidate assessment execution."""

from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.db.timestamps import utc_now
from app.main import app
from app.models.result import Result

from app.models import (
    Assessment,
    AssessmentAssignment,
    AssessmentQuestion,
    Attempt,
    AuditEvent,
    Job,
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Response,
    Skill,
    User,
)

client = TestClient(app)


def make_user(db, role):
    unique = uuid4().hex[:10]
    user = User(
        username=f"candidate_exec_{role}_{unique}",
        email=f"candidate_exec_{role}_{unique}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def bearer(user):
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"Authorization": f"Bearer {token}"}


def setup_hr_assignment(db, *, opens_offset_minutes=-5, closes_offset_minutes=60):
    suffix = uuid4().hex[:8]
    recruiter = make_user(db, "recruiter")
    candidate = make_user(db, "candidate")
    job = Job(
        title=f"Candidate execution job {suffix}",
        description="Candidate execution API test.",
        created_by=recruiter.id,
    )
    db.add(job)
    db.flush()

    question_set = QuestionSet(
        job_id=job.id,
        name=f"Candidate execution set {suffix}",
        description="Set used by the candidate execution regression test.",
        status="approved",
        version=1,
        created_by=recruiter.id,
    )
    db.add(question_set)
    db.flush()
    db.add(
        QuestionSetConfiguration(
            question_set_id=question_set.id,
            total_questions=1,
            duration_minutes=20,
            candidate_instructions="Read carefully and select the best answer.",
        )
    )

    skill = Skill(name=f"candidate-execution-skill-{suffix}")
    db.add(skill)
    db.flush()
    question = Question(
        question_text="Which option is correct?",
        question_type="MCQ",
        skill_id=skill.id,
        difficulty="easy",
        options=["A", "B", "C", "D"],
        correct_answer="B",
        explanation="Private explanation for evaluators.",
        status="approved",
        source="manual",
    )
    db.add(question)
    db.flush()

    assessment = Assessment(
        job_id=job.id,
        question_set_id=question_set.id,
        title=f"Candidate execution assessment {suffix}",
        status="published",
        review_status="approved",
    )
    db.add(assessment)
    db.flush()
    db.add(
        AssessmentQuestion(
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
    )

    now = utc_now()
    assignment = AssessmentAssignment(
        assessment_id=assessment.id,
        candidate_id=candidate.id,
        assigned_by=recruiter.id,
        status="assigned",
        opens_at=now + timedelta(minutes=opens_offset_minutes),
        closes_at=now + timedelta(minutes=closes_offset_minutes),
    )
    db.add(assignment)
    db.commit()
    return {
        "recruiter": recruiter,
        "candidate": candidate,
        "job": job,
        "question_set": question_set,
        "skill": skill,
        "question": question,
        "assessment": assessment,
        "assignment": assignment,
    }


def cleanup(db, fixture):
    assessment_id = fixture["assessment"].id
    attempt_ids = [
        row.id for row in db.query(Attempt).filter(Attempt.assessment_id == assessment_id).all()
    ]
    for attempt_id in attempt_ids:
        db.query(AuditEvent).filter(AuditEvent.attempt_id == attempt_id).delete(synchronize_session=False)
        db.query(Response).filter(Response.attempt_id == attempt_id).delete(synchronize_session=False)
    db.query(AssessmentAssignment).filter(AssessmentAssignment.assessment_id == assessment_id).delete(synchronize_session=False)
    if attempt_ids:
        db.query(Result).filter(
            Result.attempt_id.in_(attempt_ids)
        ).delete(synchronize_session=False)
        db.query(Attempt).filter(Attempt.assessment_id == assessment_id).delete(synchronize_session=False)
    db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_id == assessment_id).delete(synchronize_session=False)
    db.delete(fixture["assessment"])
    db.query(QuestionSetConfiguration).filter(
        QuestionSetConfiguration.question_set_id == fixture["question_set"].id
    ).delete(synchronize_session=False)
    db.delete(fixture["question"])
    db.delete(fixture["skill"])
    db.delete(fixture["question_set"])
    db.delete(fixture["job"])
    db.delete(fixture["candidate"])
    db.delete(fixture["recruiter"])
    db.commit()


def test_hr_assignment_can_be_opened_started_answered_submitted_and_proctor_logged():
    db = SessionLocal()
    fixture = None
    try:
        fixture = setup_hr_assignment(db)
        assessment_id = fixture["assessment"].id
        candidate_headers = bearer(fixture["candidate"])

        # Merely viewing the assignment shows an intro and does not create an Attempt.
        intro = client.get(f"/assessments/{assessment_id}", headers=candidate_headers)
        assert intro.status_code == 200, intro.text
        intro_data = intro.json()
        assert intro_data["attempt_id"] is None
        assert intro_data["attempt_status"] == "assigned"
        assert intro_data["questions"] == []
        assert db.query(Attempt).filter(Attempt.assessment_id == assessment_id).count() == 0

        dashboard = client.get("/assessments", headers=candidate_headers)
        assert dashboard.status_code == 200, dashboard.text
        listed = next(item for item in dashboard.json() if item["assessment_id"] == assessment_id)
        assert listed["attempt_id"] is None
        assert listed["attempt_status"] == "assigned"

        started = client.post(f"/assessments/{assessment_id}/start", headers=candidate_headers)
        assert started.status_code == 200, started.text
        started_data = started.json()
        assert started_data["status"] == "in_progress"
        attempt_id = started_data["attempt_id"]
        started_at = started_data["started_at"]
        expires_at = started_data["expires_at"]

        # Re-clicking Start on an active attempt must resume its original timer.
        resumed = client.post(f"/assessments/{assessment_id}/start", headers=candidate_headers)
        assert resumed.status_code == 200, resumed.text
        assert resumed.json()["attempt_id"] == attempt_id
        assert resumed.json()["started_at"] == started_at
        assert resumed.json()["expires_at"] == expires_at

        db.refresh(fixture["assignment"])
        attempt = db.query(Attempt).filter(Attempt.id == attempt_id).one()
        assert fixture["assignment"].status == "in_progress"
        assert attempt.started_at is not None and attempt.expires_at is not None
        assert attempt.expires_at - attempt.started_at == timedelta(minutes=20)

        delivery = client.get(f"/assessments/{assessment_id}", headers=candidate_headers)
        assert delivery.status_code == 200, delivery.text
        question = delivery.json()["questions"][0]
        assert "correct_answer" not in question
        assert "explanation" not in question

        saved = client.put(
            f"/assessments/{assessment_id}/answers/{question['question_id']}",
            headers=candidate_headers,
            json={"answer_text": "B"},
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["saved"] is True

        event = client.post(
            f"/assessments/{assessment_id}/proctor-events",
            headers=candidate_headers,
            json={"event_type": "tab_hidden"},
        )
        assert event.status_code == 200, event.text
        assert event.json()["recorded"] is True

        submitted = client.post(f"/assessments/{assessment_id}/submit", headers=candidate_headers)
        assert submitted.status_code == 200, submitted.text
        assert submitted.json()["status"] == "submitted"

        db.refresh(attempt)
        db.refresh(fixture["assignment"])
        assert attempt.status == "submitted"
        assert attempt.submitted_at is not None
        assert fixture["assignment"].status == "submitted"
        assert db.query(Response).filter(
            Response.attempt_id == attempt_id,
            Response.question_id == question["question_id"],
        ).one().answer_text == "B"
        assert db.query(AuditEvent).filter(
            AuditEvent.attempt_id == attempt_id,
            AuditEvent.action == "proctor_tab_hidden",
        ).count() == 1

        # Calling Start after submission cannot reset the original timer.
        repeated_start = client.post(f"/assessments/{assessment_id}/start", headers=candidate_headers)
        assert repeated_start.status_code == 409
        db.refresh(attempt)
        assert attempt.started_at is not None
        assert attempt.expires_at is not None
        assert attempt.started_at.isoformat() == started_at
        assert attempt.expires_at.isoformat() == expires_at
    finally:
        if fixture is not None:
            cleanup(db, fixture)
        db.close()


def test_hr_assignment_cannot_start_before_opening_time():
    db = SessionLocal()
    fixture = None
    try:
        fixture = setup_hr_assignment(db, opens_offset_minutes=30, closes_offset_minutes=90)
        assessment_id = fixture["assessment"].id
        before_count = db.query(Attempt).filter(Attempt.assessment_id == assessment_id).count()
        response = client.post(f"/assessments/{assessment_id}/start", headers=bearer(fixture["candidate"]))
        assert response.status_code == 409
        assert "not open" in response.json()["detail"].lower()
        after_count = db.query(Attempt).filter(Attempt.assessment_id == assessment_id).count()
        assert before_count == after_count == 0
    finally:
        if fixture is not None:
            cleanup(db, fixture)
        db.close()


def test_unassigned_candidate_cannot_view_or_start_assessment():
    db = SessionLocal()
    fixture = None
    other_candidate = None
    try:
        fixture = setup_hr_assignment(db)
        other_candidate = make_user(db, "candidate")
        db.commit()
        headers = bearer(other_candidate)
        assessment_id = fixture["assessment"].id
        viewed = client.get(f"/assessments/{assessment_id}", headers=headers)
        started = client.post(f"/assessments/{assessment_id}/start", headers=headers)
        assert viewed.status_code == 403
        assert started.status_code == 403
    finally:
        if fixture is not None:
            cleanup(db, fixture)
        if other_candidate is not None:
            db.delete(other_candidate)
            db.commit()
        db.close()