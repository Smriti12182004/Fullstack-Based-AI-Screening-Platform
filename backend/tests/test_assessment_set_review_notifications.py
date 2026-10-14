"""AssessmentSet review decisions and manager notification tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    AssessmentSet,
    Job,
    JobAssessmentAccess,
    Notification,
    Question,
    QuestionSet,
    QuestionSlot,
    Section,
    Skill,
    User,
)


client = TestClient(app)


def create_test_user(db, role: str) -> User:
    unique_id = uuid4().hex[:10]
    user = User(
        username=f"s4_review_notify_{role}_{unique_id}",
        email=f"s4_review_notify_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
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


def create_fixture(db):
    manager = create_test_user(db, "assessment_manager")
    reviewer = create_test_user(db, "assessment_reviewer")

    job = Job(
        title=f"Review Notification Job {uuid4().hex[:8]}",
        description="AssessmentSet review notification test job.",
        created_by=manager.id,
    )
    db.add(job)
    db.flush()

    db.add_all(
        [
            JobAssessmentAccess(
                job_id=job.id,
                user_id=manager.id,
                assigned_by=manager.id,
            ),
            JobAssessmentAccess(
                job_id=job.id,
                user_id=reviewer.id,
                assigned_by=manager.id,
            ),
        ]
    )

    question_set = QuestionSet(
        job_id=job.id,
        name=f"Review Notification Question Set {uuid4().hex[:8]}",
        description="AssessmentSet review notification question set.",
        variant_count=2,
        status="draft",
        version=1,
        created_by=manager.id,
    )
    db.add(question_set)
    db.flush()

    section = Section(
        question_set_id=question_set.id,
        name="Technical",
        section_type="conceptual",
        difficulty="medium",
        display_order=1,
        is_locked=False,
    )
    db.add(section)
    db.flush()

    skill = Skill(
        name=f"review-notify-skill-{uuid4().hex[:8]}"
    )
    db.add(skill)
    db.flush()

    question = Question(
        question_text=f"Review notification question {uuid4().hex[:8]}",
        question_type="MCQ",
        section_type="conceptual",
        skill_id=skill.id,
        difficulty="medium",
        options=["A", "B", "C", "D"],
        correct_answer="B",
        explanation="B is correct.",
        status="pending_review",
        source="ai_generated",
        created_by=manager.id,
    )
    db.add(question)
    db.flush()

    assessment_set = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=1,
        label="A",
        status="submitted_for_review",
    )
    db.add(assessment_set)
    db.flush()

    slot = QuestionSlot(
        assessment_set_id=assessment_set.id,
        section_id=section.id,
        skill_id=skill.id,
        section_type="conceptual",
        difficulty="medium",
        slot_number=1,
        preferred_question_type="MCQ",
        current_question_id=question.id,
        source_type="ai_generated",
        status="filled",
    )
    db.add(slot)
    db.commit()

    for item in (
        manager,
        reviewer,
        job,
        question_set,
        section,
        skill,
        question,
        assessment_set,
        slot,
    ):
        db.refresh(item)

    return {
        "manager": manager,
        "reviewer": reviewer,
        "job": job,
        "question_set": question_set,
        "section": section,
        "skill": skill,
        "question": question,
        "assessment_set": assessment_set,
        "slot": slot,
    }


def cleanup(db, fixture):
    set_id = fixture["assessment_set"].id
    question_id = fixture["question"].id
    section_id = fixture["section"].id
    question_set_id = fixture["question_set"].id
    job_id = fixture["job"].id
    user_ids = [
        fixture["manager"].id,
        fixture["reviewer"].id,
    ]

    db.query(QuestionSlot).filter(
        QuestionSlot.assessment_set_id == set_id
    ).delete(
        synchronize_session=False
    )

    db.query(AssessmentSet).filter(
        AssessmentSet.id == set_id
    ).delete(
        synchronize_session=False
    )

    db.query(Question).filter(
        Question.id == question_id
    ).delete(
        synchronize_session=False
    )

    db.query(Section).filter(
        Section.id == section_id
    ).delete(
        synchronize_session=False
    )

    db.query(QuestionSet).filter(
        QuestionSet.id == question_set_id
    ).delete(
        synchronize_session=False
    )

    db.query(JobAssessmentAccess).filter(
        JobAssessmentAccess.job_id == job_id
    ).delete(
        synchronize_session=False
    )

    db.query(Skill).filter(
        Skill.id == fixture["skill"].id
    ).delete(
        synchronize_session=False
    )

    db.query(Job).filter(
        Job.id == job_id
    ).delete(
        synchronize_session=False
    )

    db.query(User).filter(
        User.id.in_(user_ids)
    ).delete(
        synchronize_session=False
    )

    db.commit()


def test_approve_assessment_set_records_review_and_notifies_manager():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_fixture(db)
        reviewer_token = token_for(
            fixture["reviewer"]
        )

        question_response = client.post(
            f"/questions/{fixture['question'].id}/approve",
            headers={
                "Authorization": f"Bearer {reviewer_token}"
            },
        )

        assert question_response.status_code == 200

        decision_response = client.post(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set'].id}/approve",
            headers={
                "Authorization": f"Bearer {reviewer_token}"
            },
            json={
                "comment": (
                    "All questions verified and ready for HR handoff."
                ),
                "checklist": {
                    "question_quality": True,
                    "answer_keys_verified": True,
                    "skill_mapping_verified": True,
                    "difficulty_verified": True,
                    "blueprint_compliance": True,
                    "duplicate_check": True,
                    "candidate_instructions_verified": True,
                },
            },
        )

        assert decision_response.status_code == 200

        db.refresh(
            fixture["assessment_set"]
        )

        assert fixture["assessment_set"].status == "approved"

        assert (
            fixture["assessment_set"].reviewer_id
            == fixture["reviewer"].id
        )

        assert (
            fixture["assessment_set"].reviewed_at
            is not None
        )

        assert (
            fixture["assessment_set"].review_comment
            == "All questions verified and ready for HR handoff."
        )

        assert (
            fixture["assessment_set"]
            .review_checklist[
                "question_quality"
            ]
            is True
        )

        notification = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == fixture["manager"].id,
                Notification.notification_type
                == "ASSESSMENT_SET_APPROVED",
                Notification.entity_type
                == "assessment_set",
                Notification.entity_id
                == fixture["assessment_set"].id,
            )
            .first()
        )

        assert notification is not None
        assert notification.is_read is False
        assert "approved" in notification.message.lower()

    finally:
        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        db.close()


def test_reject_assessment_set_records_reason_and_notifies_manager():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_fixture(db)
        reviewer_token = token_for(
            fixture["reviewer"]
        )

        reason = (
            "The assessment does not match the approved blueprint."
        )

        response = client.post(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set'].id}/reject",
            headers={
                "Authorization": f"Bearer {reviewer_token}"
            },
            json={
                "comment": reason,
                "checklist": {},
            },
        )

        assert response.status_code == 200

        db.refresh(
            fixture["assessment_set"]
        )

        assert fixture["assessment_set"].status == "rejected"

        assert (
            fixture["assessment_set"].reviewer_id
            == fixture["reviewer"].id
        )

        assert (
            fixture["assessment_set"].reviewed_at
            is not None
        )

        assert (
            fixture["assessment_set"].review_comment
            == reason
        )

        notification = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == fixture["manager"].id,
                Notification.notification_type
                == "ASSESSMENT_SET_REJECTED",
                Notification.entity_type
                == "assessment_set",
                Notification.entity_id
                == fixture["assessment_set"].id,
            )
            .first()
        )

        assert notification is not None
        assert notification.is_read is False
        assert reason in notification.message

    finally:
        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        db.close()


def test_reject_question_returns_set_to_manager_and_notifies_manager():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_fixture(db)
        reviewer_token = token_for(
            fixture["reviewer"]
        )

        reason = (
            "The question is definition-only and does not test "
            "practical application."
        )

        response = client.post(
            f"/questions/{fixture['question'].id}/reject",
            headers={
                "Authorization": f"Bearer {reviewer_token}"
            },
            json={
                "rejection_reason": reason
            },
        )

        assert response.status_code == 200

        db.refresh(
            fixture["question"]
        )

        db.refresh(
            fixture["assessment_set"]
        )

        assert (
            fixture["question"].status
            == "rejected"
        )

        assert (
            fixture["question"].reviewed_by
            == fixture["reviewer"].id
        )

        assert (
            fixture["question"].reviewed_at
            is not None
        )

        assert (
            fixture["question"].rejection_reason
            == reason
        )

        assert (
            fixture["assessment_set"].status
            == "rejected"
        )

        assert (
            fixture["assessment_set"].reviewer_id
            == fixture["reviewer"].id
        )

        assert (
            fixture["assessment_set"].reviewed_at
            is not None
        )

        assert (
            str(
                fixture["question"].id
            )
            in fixture["assessment_set"].review_comment
        )

        assert (
            reason
            in fixture["assessment_set"].review_comment
        )

        notification = (
            db.query(Notification)
            .filter(
                Notification.user_id
                == fixture["manager"].id,
                Notification.notification_type
                == "ASSESSMENT_QUESTION_REJECTED",
                Notification.entity_type
                == "assessment_set",
                Notification.entity_id
                == fixture["assessment_set"].id,
            )
            .first()
        )

        assert notification is not None
        assert notification.is_read is False
        assert reason in notification.message

        assert (
            "returned for revision"
            in notification.message.lower()
        )

    finally:
        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        db.close()