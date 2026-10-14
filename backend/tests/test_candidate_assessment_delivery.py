
"""Candidate assessment question delivery tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Assessment,
    AssessmentQuestion,
    AuditEvent,
    Attempt,
    Job,
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Skill,
    User,
)


client = TestClient(app)


def test_candidate_receives_assessment_question_snapshot_without_answer_key():
    """
    Candidate receives snapshot questions from a published assessment
    without sensitive answer-key information.
    """

    db = SessionLocal()

    job = None
    skill = None
    question = None
    assessment = None
    attempt = None
    question_set = None

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

        question_set = QuestionSet(
            job_id=job.id,
            name=f"Candidate Delivery Set {uuid4().hex[:8]}",
            description="Configuration for candidate delivery test.",
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
                duration_minutes=30,
                candidate_instructions="Answer the question carefully.",
            )
        )

        assessment = Assessment(
            job_id=job.id,
            question_set_id=question_set.id,
            title="Candidate Delivery Assessment",
            status="published",
            review_status="approved",
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
            status="assigned",
            started_at=None,
            expires_at=None,
        )

        db.add(attempt)
        db.commit()

        token = create_access_token(
            {
                "sub": str(candidate.id),
                "role": "candidate",
            }
        )

        headers = {
            "Authorization": f"Bearer {token}",
        }

        # Opening the assessment must not expose its questions
        # before the candidate explicitly starts the attempt.
        response = client.get(
            f"/assessments/{assessment.id}",
            headers=headers,
        )

        assert response.status_code == 200

        before_start = response.json()

        assert before_start["assessment_id"] == assessment.id
        assert before_start["attempt_id"] == attempt.id
        assert before_start["status"] == "published"
        assert before_start["questions"] == []

        # Starting the assessment creates the active timed attempt.
        response = client.post(
            f"/assessments/{assessment.id}/start",
            headers=headers,
        )

        assert response.status_code == 200

        start_data = response.json()

        assert start_data["assessment_id"] == assessment.id
        assert start_data["attempt_id"] == attempt.id
        assert start_data["status"] == "in_progress"

        db.refresh(attempt)

        assert attempt.status == "in_progress"
        assert attempt.started_at is not None
        assert attempt.expires_at is not None

        # Questions should be available after the attempt starts.
        response = client.get(
            f"/assessments/{assessment.id}",
            headers=headers,
        )

        assert response.status_code == 200

        data = response.json()

        assert data["assessment_id"] == assessment.id
        assert data["attempt_id"] == attempt.id
        assert data["attempt_status"] == "in_progress"
        assert len(data["questions"]) == 1

        delivered_question = data["questions"][0]

        assert delivered_question["question_text"] == (
            "Original delivery question"
        )

        assert delivered_question["question_type"] == "MCQ"
        assert delivered_question["skill_id"] == skill.id
        assert delivered_question["difficulty"] == "easy"

        assert delivered_question["options"] == [
            "A",
            "B",
            "C",
            "D",
        ]

        # Never expose the answer key or private explanation.
        assert "correct_answer" not in delivered_question
        assert "explanation" not in delivered_question

        print()
        print("ASSESSMENT ID:", assessment.id)
        print("ATTEMPT ID:", attempt.id)
        print(
            "DELIVERED QUESTION ID:",
            delivered_question["question_id"],
        )
        print(
            "ANSWER KEY EXPOSED:",
            "correct_answer" in delivered_question,
        )
        print(
            "EXPLANATION EXPOSED:",
            "explanation" in delivered_question,
        )
        print()
        print("CANDIDATE ASSESSMENT DELIVERY TEST PASSED")

    finally:
        if db.is_active:
            db.rollback()

        if assessment is not None:
            db.query(AssessmentQuestion).filter(
                AssessmentQuestion.assessment_id == assessment.id
            ).delete(
                synchronize_session=False
            )

        # Audit events reference attempts through a foreign key.
        # Delete only events for this test attempt, before the attempt.
        if attempt is not None and attempt.id is not None:
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

        if question is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if question_set is not None:
            db.query(QuestionSetConfiguration).filter(
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
