"""Question-set job-skills API tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Job,
    JobAssessmentAccess,
    JobSkill,
    QuestionSet,
    Skill,
    User,
)


client = TestClient(app)


def create_test_user(db, role: str) -> User:
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"s4_qs_skill_{role}_{unique_id}",
        email=f"s4_qs_skill_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def create_access_token_for_user(user: User) -> str:
    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def test_assessment_manager_can_view_question_set_job_skills():
    db = SessionLocal()

    recruiter = None
    manager = None
    job = None
    skill_one = None
    skill_two = None
    unrelated_skill = None
    question_set = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None

        manager = create_test_user(
            db,
            "assessment_manager",
        )

        job = Job(
            title=f"S4 Question Set Skills {uuid4().hex[:8]}",
            description="Question-set skills API test job.",
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

        skill_one = Skill(
            name=f"s4-skill-python-{uuid4().hex[:8]}"
        )

        skill_two = Skill(
            name=f"s4-skill-sql-{uuid4().hex[:8]}"
        )

        unrelated_skill = Skill(
            name=f"s4-unrelated-skill-{uuid4().hex[:8]}"
        )

        db.add_all(
            [
                skill_one,
                skill_two,
                unrelated_skill,
            ]
        )

        db.flush()

        db.add_all(
            [
                JobSkill(
                    job_id=job.id,
                    skill_id=skill_one.id,
                ),
                JobSkill(
                    job_id=job.id,
                    skill_id=skill_two.id,
                ),
            ]
        )

        question_set = QuestionSet(
            job_id=job.id,
            name=f"S4 Skills Set {uuid4().hex[:8]}",
            description="Skills endpoint test set.",
            status="draft",
            version=1,
            created_by=manager.id,
        )

        db.add(question_set)
        db.commit()

        token = create_access_token_for_user(
            manager
        )

        response = client.get(
            f"/question-sets/{question_set.id}/skills",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        returned_names = {
            item["name"]
            for item in data
        }

        assert returned_names == {
            skill_one.name,
            skill_two.name,
        }

        assert unrelated_skill.name not in returned_names

    finally:
        if question_set is not None:
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

        for skill in (
            skill_one,
            skill_two,
            unrelated_skill,
        ):
            if skill is not None:
                db.query(Skill).filter(
                    Skill.id == skill.id
                ).delete(
                    synchronize_session=False
                )

        if manager is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()