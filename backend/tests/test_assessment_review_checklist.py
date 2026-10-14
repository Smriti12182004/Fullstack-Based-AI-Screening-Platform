"""Assessment reviewer checklist persistence tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Assessment,
    AssessmentQuestion,
    Job,
    Question,
    Skill,
    User,
)


client = TestClient(app)


def create_user(
    db,
    role: str,
) -> User:
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"checklist_{role}_{unique_id}",
        email=f"checklist_{role}_{unique_id}@test.com",
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


def test_reviewer_checklist_is_persisted_on_approval():
    db = SessionLocal()

    recruiter = None
    reviewer = None
    job = None
    skill = None
    question = None
    assessment = None
    assessment_question = None

    try:
        recruiter = create_user(
            db,
            "recruiter",
        )

        reviewer = create_user(
            db,
            "assessment_reviewer",
        )

        job = Job(
            title=f"Checklist Job {uuid4().hex[:8]}",
            description="Checklist persistence test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        skill = Skill(
            name=f"checklist-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.flush()

        question = Question(
            question_text="Checklist test question",
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=[
                "A",
                "B",
                "C",
                "D",
            ],
            correct_answer="A",
            explanation="Option A is correct.",
            status="approved",
            source="manual",
        )

        db.add(question)
        db.flush()

        assessment = Assessment(
            job_id=job.id,
            question_set_id=None,
            variant_number=1,
            title="Checklist Assessment",
            status="ready",
            review_status="pending",
            review_checklist={},
        )

        db.add(assessment)
        db.flush()

        assessment_question = AssessmentQuestion(
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

        db.add(assessment_question)
        db.commit()

        checklist = {
            "question_quality": True,
            "answer_keys_verified": True,
            "skill_mapping_verified": True,
            "difficulty_verified": True,
            "blueprint_compliance": True,
            "duplicate_check": True,
            "candidate_instructions_verified": True,
        }

        response = client.post(
            f"/assessment-reviews/"
            f"{assessment.id}/approve",
            headers={
                "Authorization": f"Bearer {token_for(reviewer)}",
            },
            json={
                "comment": "Checklist completed.",
                "checklist": checklist,
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["review_status"] == "approved"

        assert data["review_checklist"] == checklist

        db.refresh(assessment)

        assert assessment.review_status == "approved"
        assert assessment.review_checklist == checklist

    finally:
        if assessment_question is not None:
            db.query(AssessmentQuestion).filter(
                AssessmentQuestion.id
                == assessment_question.id
            ).delete(
                synchronize_session=False
            )

        if assessment is not None:
            db.query(Assessment).filter(
                Assessment.id == assessment.id
            ).delete(
                synchronize_session=False
            )

        if question is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if job is not None:
            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        if reviewer is not None:
            db.query(User).filter(
                User.id == reviewer.id
            ).delete(
                synchronize_session=False
            )

        if recruiter is not None:
            db.query(User).filter(
                User.id == recruiter.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()