"""Candidate assessment question delivery tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Assessment,
    AssessmentQuestion,
    Attempt,
    Job,
    Question,
    Skill,
    User,
)


client = TestClient(app)


def test_candidate_receives_assessment_question_snapshot_without_answer_key():
    """Candidate receives snapshot questions without sensitive answer data."""

    db = SessionLocal()

    job = None
    skill = None
    question = None
    assessment = None
    attempt = None

    try:
        candidate = (
            db.query(User)
            .filter(User.role == "candidate")
            .first()
        )

        assert candidate is not None, (
            "This test requires an existing candidate user."
        )

        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None, (
            "This test requires an existing recruiter user."
        )

        job = Job(
            title=f"Candidate Delivery Job {uuid4().hex[:8]}",
            description="Candidate question delivery test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        skill = Skill(
            name=f"candidate-delivery-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.flush()

        question = Question(
            question_text="Original delivery question",
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=["A", "B", "C", "D"],
            correct_answer="A",
            explanation="Private explanation.",
            status="approved",
            source="manual",
        )

        db.add(question)
        db.flush()

        assessment = Assessment(
            job_id=job.id,
            title="Candidate Delivery Assessment",
            status="ready",
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

        attempt = Attempt(
            assessment_id=assessment.id,
            candidate_id=candidate.id,
            status="started",
        )

        db.add(attempt)
        db.commit()

        token = create_access_token(
            {
                "sub": str(candidate.id),
                "role": "candidate",
            }
        )

        response = client.get(
            f"/assessments/{assessment.id}",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["assessment_id"] == assessment.id
        assert data["attempt_id"] == attempt.id
        assert len(data["questions"]) == 1

        delivered_question = data["questions"][0]

        assert delivered_question["question_text"] == (
            "Original delivery question"
        )
        assert delivered_question["question_type"] == "MCQ"
        assert delivered_question["difficulty"] == "easy"
        assert delivered_question["options"] == [
            "A",
            "B",
            "C",
            "D",
        ]

        assert "correct_answer" not in delivered_question
        assert "explanation" not in delivered_question

        print()
        print("ASSESSMENT ID:", assessment.id)
        print("ATTEMPT ID:", attempt.id)
        print("DELIVERED QUESTION ID:", delivered_question["question_id"])
        print("ANSWER KEY EXPOSED:", "correct_answer" in delivered_question)
        print("EXPLANATION EXPOSED:", "explanation" in delivered_question)
        print()
        print("CANDIDATE ASSESSMENT DELIVERY TEST PASSED")

    finally:
        if assessment is not None:
            db.query(AssessmentQuestion).filter(
                AssessmentQuestion.assessment_id == assessment.id
            ).delete(
                synchronize_session=False
            )

        if attempt is not None:
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

        db.commit()
        db.close()