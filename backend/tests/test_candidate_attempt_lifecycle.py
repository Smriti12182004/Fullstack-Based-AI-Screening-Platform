
"""Candidate assignment and timed attempt tests."""

from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.db.timestamps import utc_now
from app.main import app
from app.models import (
    Assessment,
    AssessmentQuestion,
    Attempt,
    AuditEvent,
    Job,
    JobAssessmentAccess,
    QuestionSet,
    QuestionSetConfiguration,
    User,
)


client = TestClient(app)


def create_user(db, role):
    value = uuid4().hex[:10]

    user = User(
        username=f"attempt_{role}_{value}",
        email=f"attempt_{role}_{value}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def token(user):
    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def test_published_assessment_can_be_assigned_and_started():
    db = SessionLocal()

    recruiter = None
    manager = None
    candidate = None
    job = None
    question_set = None
    assessment = None
    attempt = None

    try:
        recruiter = create_user(db, "recruiter")
        manager = create_user(
            db,
            "assessment_manager",
        )
        candidate = create_user(
            db,
            "candidate",
        )

        job = Job(
            title=f"Attempt Job {uuid4().hex[:8]}",
            description="Candidate attempt lifecycle test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        db.add(
            JobAssessmentAccess(
                job_id=job.id,
                user_id=manager.id,
                assigned_by=recruiter.id,
            )
        )

        question_set = QuestionSet(
            job_id=job.id,
            name=f"Attempt Set {uuid4().hex[:8]}",
            description="Attempt lifecycle set.",
            status="approved",
            version=1,
            created_by=manager.id,
        )

        db.add(question_set)
        db.flush()

        db.add(
            QuestionSetConfiguration(
                question_set_id=question_set.id,
                total_questions=1,
                duration_minutes=30,
                candidate_instructions="Complete all questions.",
            )
        )

        assessment = Assessment(
            job_id=job.id,
            question_set_id=question_set.id,
            variant_number=1,
            title="Published Attempt Assessment",
            status="published",
            review_status="approved",
        )

        db.add(assessment)
        db.commit()

        manager_token = token(manager)

        response = client.post(
            f"/assessments/{assessment.id}/assign",
            headers={
                "Authorization": f"Bearer {manager_token}",
            },
            json={
                "candidate_id": candidate.id,
            },
        )

        assert response.status_code == 200

        attempt = (
            db.query(Attempt)
            .filter(
                Attempt.assessment_id == assessment.id,
                Attempt.candidate_id == candidate.id,
            )
            .first()
        )

        assert attempt is not None
        assert attempt.status == "assigned"
        assert attempt.started_at is None
        assert attempt.expires_at is None

        candidate_token = token(candidate)

        response = client.post(
            f"/assessments/{assessment.id}/start",
            headers={
                "Authorization": f"Bearer {candidate_token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["assessment_id"] == assessment.id
        assert data["attempt_id"] == attempt.id
        assert data["status"] == "in_progress"

        db.refresh(attempt)

        assert attempt.status == "in_progress"
        assert attempt.started_at is not None
        assert attempt.expires_at is not None

        assert (
            attempt.expires_at
            > attempt.started_at
        )

        expected_window = (
            attempt.expires_at
            - attempt.started_at
        )

        assert expected_window == timedelta(
            minutes=30
        )

        response = client.get(
            f"/assessments/{assessment.id}",
            headers={
                "Authorization": f"Bearer {candidate_token}",
            },
        )

        assert response.status_code == 200

        delivery = response.json()

        assert delivery["attempt_id"] == attempt.id
        assert delivery["attempt_status"] == "in_progress"
        assert delivery["started_at"] is not None
        assert delivery["expires_at"] is not None

    finally:
        # Remove dependent audit records before deleting the attempt.
        if attempt is not None:
            db.query(AuditEvent).filter(
                AuditEvent.attempt_id == attempt.id
            ).delete(
                synchronize_session=False
            )

            db.query(Attempt).filter(
                Attempt.id == attempt.id
            ).delete(
                synchronize_session=False
            )

        if assessment is not None:
            db.query(Assessment).filter(
                Assessment.id == assessment.id
            ).delete(
                synchronize_session=False
            )

        if question_set is not None:
            db.query(
                QuestionSetConfiguration
            ).filter(
                QuestionSetConfiguration.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            db.query(QuestionSet).filter(
                QuestionSet.id == question_set.id
            ).delete(
                synchronize_session=False
            )

        if job is not None:
            db.query(JobAssessmentAccess).filter(
                JobAssessmentAccess.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        for user in [
            candidate,
            manager,
            recruiter,
        ]:
            if user is not None:
                db.query(User).filter(
                    User.id == user.id
                ).delete(
                    synchronize_session=False
                )

        db.commit()
        db.close()
