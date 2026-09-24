"""S4-04 assessment assembly API tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Assessment,
    AssessmentQuestion,
    Job,
    JobAssessmentAccess,
    JobSkill,
    JobSkillReview,
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
    Skill,
    User,
)


client = TestClient(app)


def test_assessment_manager_can_assemble_assessment():
    """An authorized assessment manager can assemble a final assessment."""

    db = SessionLocal()

    job = None
    skill = None
    question_set = None
    assessment = None
    questions = []

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        manager = (
            db.query(User)
            .filter(User.role == "assessment_manager")
            .first()
        )

        assert recruiter is not None
        assert manager is not None

        job = Job(
            title=f"S4-04 API Job {uuid4().hex[:8]}",
            description="Automatic assessment API test.",
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

        skill = Skill(
            name=f"s4-api-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.flush()

        db.add(
            JobSkill(
                job_id=job.id,
                skill_id=skill.id,
            )
        )

        db.add(
            JobSkillReview(
                job_id=job.id,
                status="confirmed",
            )
        )

        question_set = QuestionSet(
            job_id=job.id,
            name=f"S4-04 API Set {uuid4().hex[:8]}",
            description="API assembly test.",
            status="draft",
            version=1,
            created_by=manager.id,
        )

        db.add(question_set)
        db.flush()

        db.add(
            Section(
                question_set_id=question_set.id,
                skill_id=skill.id,
                name="API Assembly",
                display_order=1,
                easy_count=1,
                medium_count=1,
                hard_count=0,
                is_locked=False,
            )
        )

        db.add(
            QuestionSetConfiguration(
                question_set_id=question_set.id,
                total_questions=2,
                duration_minutes=20,
                candidate_instructions="Answer all questions.",
            )
        )

        for difficulty in ("easy", "medium"):
            question = Question(
                question_text=(
                    f"S4-04 API {difficulty} question "
                    f"{uuid4().hex[:8]}"
                ),
                question_type="MCQ",
                skill_id=skill.id,
                difficulty=difficulty,
                options=["A", "B", "C", "D"],
                correct_answer="A",
                status="approved",
                source="manual",
            )

            db.add(question)
            questions.append(question)

        db.commit()

        token = create_access_token(
            {
                "sub": str(manager.id),
                "role": "assessment_manager",
            }
        )

        response = client.post(
            "/assessments/assemble",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": question_set.id,
                "title": "Automatically Assembled API Assessment",
            },
        )

        assert response.status_code == 201

        data = response.json()

        assert data["job_id"] == job.id
        assert data["title"] == (
            "Automatically Assembled API Assessment"
        )
        assert data["status"] == "ready"

        assessment_id = data["id"]

        assessment = db.get(
            Assessment,
            assessment_id,
        )

        assert assessment is not None

        persisted_rows = (
            db.query(AssessmentQuestion)
            .filter(
                AssessmentQuestion.assessment_id
                == assessment_id
            )
            .order_by(
                AssessmentQuestion.display_order
            )
            .all()
        )

        assert len(persisted_rows) == 2
        assert len(
            {
                row.question_id
                for row in persisted_rows
            }
        ) == 2

        print()
        print("API ASSEMBLY ASSESSMENT ID:", assessment_id)
        print("API ASSEMBLY QUESTION IDS:", [
            row.question_id
            for row in persisted_rows
        ])
        print("ASSESSMENT API TEST PASSED")

    finally:
        if assessment is not None:
            db.query(AssessmentQuestion).filter(
                AssessmentQuestion.assessment_id
                == assessment.id
            ).delete(
                synchronize_session=False
            )

            db.query(Assessment).filter(
                Assessment.id == assessment.id
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

            db.query(Section).filter(
                Section.question_set_id == question_set.id
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

            db.query(JobSkillReview).filter(
                JobSkillReview.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        for question in questions:
            if question.id is not None:
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

        db.commit()
        db.close()


def test_assessment_manager_without_job_access_is_forbidden():
    """An assessment manager without job access receives 403."""

    db = SessionLocal()

    job = None
    question_set = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        manager = (
            db.query(User)
            .filter(User.role == "assessment_manager")
            .first()
        )

        assert recruiter is not None
        assert manager is not None

        job = Job(
            title=f"S4-04 Forbidden Job {uuid4().hex[:8]}",
            description="Assessment assembly authorization test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        question_set = QuestionSet(
            job_id=job.id,
            name=f"S4-04 Forbidden Set {uuid4().hex[:8]}",
            description="Authorization test set.",
            status="draft",
            version=1,
            created_by=manager.id,
        )

        db.add(question_set)
        db.commit()
        db.refresh(question_set)

        token = create_access_token(
            {
                "sub": str(manager.id),
                "role": "assessment_manager",
            }
        )

        response = client.post(
            "/assessments/assemble",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": question_set.id,
                "title": "Should Be Forbidden",
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == (
            "You are not authorized to assemble an "
            "assessment for this job."
        )

    finally:
        if question_set is not None:
            db.query(QuestionSet).filter(
                QuestionSet.id == question_set.id
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