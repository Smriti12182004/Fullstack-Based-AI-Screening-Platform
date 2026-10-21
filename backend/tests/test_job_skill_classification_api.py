"""Round-trip tests for job-skill classification and requirement metadata."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import Job, JobSkill, JobSkillReview, Skill, User


client = TestClient(app)


def test_job_skill_classification_persists_through_save_and_confirm():
    db = SessionLocal()
    recruiter = None
    job = None
    technical_name = None
    non_technical_name = None

    try:
        unique_id = uuid4().hex[:10]
        recruiter = User(
            username=f"skill_review_{unique_id}",
            email=f"skill_review_{unique_id}@test.com",
            password_hash=hash_password("Test@12345"),
            role="recruiter",
            is_email_verified=True,
        )
        db.add(recruiter)
        db.flush()

        job = Job(
            title=f"Skill Classification {unique_id}",
            description=(
                "Backend engineer responsible for APIs, database systems, "
                "team collaboration, and clear communication."
            ),
            created_by=recruiter.id,
        )
        db.add(job)
        db.commit()
        db.refresh(recruiter)
        db.refresh(job)

        technical_name = f"fastapi-classification-{unique_id}"
        non_technical_name = f"communication-classification-{unique_id}"

        token = create_access_token(
            {"sub": str(recruiter.id), "role": "recruiter"}
        )
        headers = {"Authorization": f"Bearer {token}"}

        response = client.put(
            f"/jobs/{job.id}/skills/review",
            headers=headers,
            json={
                "skills": [
                    {
                        "name": technical_name,
                        "category": "technical",
                        "is_mandatory": True,
                    },
                    {
                        "name": non_technical_name,
                        "category": "non_technical",
                        "is_mandatory": False,
                    },
                ],
            },
        )

        assert response.status_code == 200, response.text
        response_skills = {
            item["name"]: item for item in response.json()["skills"]
        }
        assert response_skills[technical_name]["category"] == "technical"
        assert response_skills[technical_name]["is_mandatory"] is True
        assert response_skills[non_technical_name]["category"] == "non_technical"
        assert response_skills[non_technical_name]["is_mandatory"] is False

        get_response = client.get(
            f"/jobs/{job.id}/skills/review",
            headers=headers,
        )
        assert get_response.status_code == 200, get_response.text
        persisted = {
            item["name"]: item for item in get_response.json()["skills"]
        }
        assert persisted[non_technical_name]["category"] == "non_technical"
        assert persisted[non_technical_name]["is_mandatory"] is False

        confirm_response = client.post(
            f"/jobs/{job.id}/skills/review/confirm",
            headers=headers,
        )
        assert confirm_response.status_code == 200, confirm_response.text
        confirmed = {
            item["name"]: item for item in confirm_response.json()["skills"]
        }
        assert confirm_response.json()["status"] == "confirmed"
        assert confirmed[technical_name]["is_mandatory"] is True
        assert confirmed[non_technical_name]["is_mandatory"] is False

    finally:
        if job is not None:
            db.query(JobSkillReview).filter(
                JobSkillReview.job_id == job.id
            ).delete(synchronize_session=False)
            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(synchronize_session=False)
            db.query(Job).filter(Job.id == job.id).delete(
                synchronize_session=False
            )

        if recruiter is not None:
            db.query(User).filter(User.id == recruiter.id).delete(
                synchronize_session=False
            )

        db.commit()

        cleanup_names = [
            name
            for name in (technical_name, non_technical_name)
            if name
        ]
        if cleanup_names:
            orphaned_skills = db.query(Skill).filter(
                Skill.name.in_(cleanup_names)
            ).all()
            for skill in orphaned_skills:
                if (
                    db.query(JobSkill)
                    .filter(JobSkill.skill_id == skill.id)
                    .count()
                    == 0
                ):
                    db.delete(skill)

        db.commit()
        db.close()