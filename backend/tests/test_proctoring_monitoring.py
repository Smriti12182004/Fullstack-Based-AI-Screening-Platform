import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Assessment,
    AssessmentAssignment,
    Attempt,
    AuditEvent,
    Job,
    JobAssessmentAccess,
    User,
)


client = TestClient(app)


def _create_user(db, role, suffix):
    user = User(
        username=f"proctor_{role}_{suffix}",
        email=f"proctor_{role}_{suffix}@example.test",
        password_hash="test-only-password-hash",
        role=role,
        full_name=f"Proctor Test {role}",
    )
    db.add(user)
    db.flush()
    return user


def _auth_headers(user_id, role):
    token = create_access_token(
        {
            "sub": str(user_id),
            "role": role,
        }
    )

    return {
        "Authorization": f"Bearer {token}",
    }


def test_proctoring_monitoring_enforces_role_and_job_scope():
    db = SessionLocal()
    suffix = uuid4().hex[:10]

    created_user_ids = []
    created_job_ids = []
    created_assessment_ids = []
    created_assignment_ids = []
    created_access_ids = []
    created_attempt_ids = []
    created_event_ids = []

    try:
        recruiter = _create_user(db, "recruiter", suffix)
        manager = _create_user(db, "assessment_manager", suffix)
        unrelated_manager = _create_user(
            db,
            "assessment_manager",
            f"other_{suffix}",
        )
        reviewer = _create_user(
            db,
            "assessment_reviewer",
            suffix,
        )
        candidate = _create_user(db, "candidate", suffix)

        created_user_ids.extend(
            [
                recruiter.id,
                manager.id,
                unrelated_manager.id,
                reviewer.id,
                candidate.id,
            ]
        )

        job_one = Job(
            title=f"Monitoring Job One {suffix}",
            description="First monitoring authorization test job.",
            created_by=recruiter.id,
        )
        job_two = Job(
            title=f"Monitoring Job Two {suffix}",
            description="Second monitoring authorization test job.",
            created_by=recruiter.id,
        )
        db.add_all([job_one, job_two])
        db.flush()

        created_job_ids.extend([job_one.id, job_two.id])

        assessment_one = Assessment(
            job_id=job_one.id,
            title=f"Monitoring Assessment One {suffix}",
            status="published",
            review_status="approved",
        )
        assessment_two = Assessment(
            job_id=job_two.id,
            title=f"Monitoring Assessment Two {suffix}",
            status="published",
            review_status="approved",
        )
        db.add_all([assessment_one, assessment_two])
        db.flush()

        created_assessment_ids.extend(
            [assessment_one.id, assessment_two.id]
        )

        now = datetime.now(timezone.utc)

        assignment_one = AssessmentAssignment(
            assessment_id=assessment_one.id,
            candidate_id=candidate.id,
            assigned_by=recruiter.id,
            status="assigned",
            opens_at=now - timedelta(hours=1),
            closes_at=now + timedelta(days=1),
        )
        assignment_two = AssessmentAssignment(
            assessment_id=assessment_two.id,
            candidate_id=candidate.id,
            assigned_by=recruiter.id,
            status="assigned",
            opens_at=now - timedelta(hours=1),
            closes_at=now + timedelta(days=1),
        )
        db.add_all([assignment_one, assignment_two])
        db.flush()

        created_assignment_ids.extend(
            [assignment_one.id, assignment_two.id]
        )

        # The manager may access Job One only.
        access = JobAssessmentAccess(
            job_id=job_one.id,
            user_id=manager.id,
            assigned_by=recruiter.id,
        )
        db.add(access)
        db.flush()
        created_access_ids.append(access.id)

        attempt = Attempt(
            assessment_id=assessment_one.id,
            candidate_id=candidate.id,
            status="in_progress",
            started_at=now,
            expires_at=now + timedelta(hours=1),
        )
        db.add(attempt)
        db.flush()
        created_attempt_ids.append(attempt.id)

        event = AuditEvent(
            user_id=candidate.id,
            attempt_id=attempt.id,
            action="proctor_tab_hidden",
            entity_type="assessment_attempt",
            entity_id=attempt.id,
            details=json.dumps(
                {
                    "assessment_id": assessment_one.id,
                    "source": "candidate_browser",
                }
            ),
        )
        db.add(event)
        db.flush()
        created_event_ids.append(event.id)

        db.commit()

        recruiter_headers = _auth_headers(
            recruiter.id,
            "recruiter",
        )
        manager_headers = _auth_headers(
            manager.id,
            "assessment_manager",
        )
        unrelated_manager_headers = _auth_headers(
            unrelated_manager.id,
            "assessment_manager",
        )
        reviewer_headers = _auth_headers(
            reviewer.id,
            "assessment_reviewer",
        )

        # HR sees both assignments created by this recruiter.
        recruiter_response = client.get(
            "/proctoring/activity",
            headers=recruiter_headers,
        )

        assert recruiter_response.status_code == 200
        recruiter_data = recruiter_response.json()

        recruiter_assessment_ids = {
            item["assessment_id"]
            for item in recruiter_data["items"]
        }

        assert assessment_one.id in recruiter_assessment_ids
        assert assessment_two.id in recruiter_assessment_ids

        # The assigned manager sees only Job One.
        manager_response = client.get(
            "/proctoring/activity",
            headers=manager_headers,
        )

        assert manager_response.status_code == 200
        manager_data = manager_response.json()

        assert [
            item["assessment_id"]
            for item in manager_data["items"]
        ] == [assessment_one.id]

        # The manager can retrieve event history for the assigned job.
        history_response = client.get(
            (
                f"/proctoring/activity/{assessment_one.id}/"
                f"{candidate.id}/events"
            ),
            headers=manager_headers,
        )

        assert history_response.status_code == 200
        history_data = history_response.json()
        assert history_data["total_events"] == 1
        assert (
            history_data["events"][0]["event_type"]
            == "tab_hidden"
        )

        # The manager cannot retrieve the other job's candidate history.
        out_of_scope_response = client.get(
            (
                f"/proctoring/activity/{assessment_two.id}/"
                f"{candidate.id}/events"
            ),
            headers=manager_headers,
        )

        assert out_of_scope_response.status_code == 404

        unrelated_manager_response = client.get(
            "/proctoring/activity",
            headers=unrelated_manager_headers,
        )

        assert unrelated_manager_response.status_code == 200
        assert unrelated_manager_response.json()["total"] == 0

        # Reviewers must be blocked from both monitoring endpoints.
        reviewer_activity_response = client.get(
            "/proctoring/activity",
            headers=reviewer_headers,
        )

        assert reviewer_activity_response.status_code == 403

        reviewer_history_response = client.get(
            (
                f"/proctoring/activity/{assessment_one.id}/"
                f"{candidate.id}/events"
            ),
            headers=reviewer_headers,
        )

        assert reviewer_history_response.status_code == 403

    finally:
        db.rollback()

        if created_event_ids:
            db.query(AuditEvent).filter(
                AuditEvent.id.in_(created_event_ids)
            ).delete(synchronize_session=False)

        if created_attempt_ids:
            db.query(Attempt).filter(
                Attempt.id.in_(created_attempt_ids)
            ).delete(synchronize_session=False)

        if created_assignment_ids:
            db.query(AssessmentAssignment).filter(
                AssessmentAssignment.id.in_(created_assignment_ids)
            ).delete(synchronize_session=False)

        if created_access_ids:
            db.query(JobAssessmentAccess).filter(
                JobAssessmentAccess.id.in_(created_access_ids)
            ).delete(synchronize_session=False)

        if created_assessment_ids:
            db.query(Assessment).filter(
                Assessment.id.in_(created_assessment_ids)
            ).delete(synchronize_session=False)

        if created_job_ids:
            db.query(Job).filter(
                Job.id.in_(created_job_ids)
            ).delete(synchronize_session=False)

        if created_user_ids:
            db.query(User).filter(
                User.id.in_(created_user_ids)
            ).delete(synchronize_session=False)

        db.commit()
        db.close()
