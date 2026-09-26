"""S4-03 section creation API tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Job,
    JobAssessmentAccess,
    JobSkill,
    JobSkillReview,
    QuestionSet,
    Section,
    Skill,
    User,
)


client = TestClient(app)


def create_test_user(db, role: str) -> User:
    """Create an isolated user for section API tests."""
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"s4_section_{role}_{unique_id}",
        email=f"s4_section_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def create_access_token_for_user(user: User) -> str:
    """Create an application-compatible access token."""
    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def create_section_fixture(db):
    """Create an isolated job, skill, question set and review state."""

    recruiter = (
        db.query(User)
        .filter(User.role == "recruiter")
        .first()
    )

    assert recruiter is not None, (
        "This test requires an existing recruiter user."
    )

    job = Job(
        title=f"S4-03 Section API Job {uuid4().hex[:8]}",
        description="Section creation API test job.",
        created_by=recruiter.id,
    )

    db.add(job)
    db.flush()

    skill = Skill(
        name=f"s4-section-skill-{uuid4().hex[:10]}",
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
        name=f"S4-03 Section Set {uuid4().hex[:8]}",
        description="Section creation API test set.",
        status="draft",
        version=1,
        created_by=recruiter.id,
    )

    db.add(question_set)
    db.commit()

    db.refresh(job)
    db.refresh(skill)
    db.refresh(question_set)

    return {
        "recruiter": recruiter,
        "job": job,
        "skill": skill,
        "question_set": question_set,
    }


def cleanup_fixture(db, fixture):
    """Delete section test fixture records."""

    question_set = fixture["question_set"]
    job = fixture["job"]
    skill = fixture["skill"]

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

    db.query(Skill).filter(
        Skill.id == skill.id
    ).delete(
        synchronize_session=False
    )


def delete_test_user(db, user: User | None):
    """Delete an isolated test user."""
    if user is None:
        return

    db.query(User).filter(
        User.id == user.id
    ).delete(
        synchronize_session=False
    )


def grant_job_access(db, fixture, user: User):
    """Grant the test user access to the fixture job."""
    access = JobAssessmentAccess(
        job_id=fixture["job"].id,
        user_id=user.id,
        assigned_by=fixture["recruiter"].id,
    )

    db.add(access)
    db.commit()

    return access


def test_manager_without_job_access_cannot_create_section():
    """A manager without job access receives 403."""

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        db.commit()

        token = create_access_token_for_user(manager)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "Python",
                "display_order": 1,
                "easy_count": 2,
                "medium_count": 3,
                "hard_count": 1,
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == (
            "You are not authorized to create sections for this job."
        )

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_reviewer_cannot_create_section():
    """An assessment reviewer cannot create sections."""

    db = SessionLocal()

    reviewer = None
    fixture = None

    try:
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        fixture = create_section_fixture(db)

        grant_job_access(
            db,
            fixture,
            reviewer,
        )

        token = create_access_token_for_user(reviewer)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "Python",
                "display_order": 1,
                "easy_count": 2,
                "medium_count": 3,
                "hard_count": 1,
            },
        )

        assert response.status_code == 403

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            reviewer,
        )

        db.commit()
        db.close()


def test_manager_with_job_access_can_create_section():
    """An authorized assessment manager can create a section."""

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(manager)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "  Python  ",
                "display_order": 1,
                "easy_count": 2,
                "medium_count": 3,
                "hard_count": 1,
            },
        )

        assert response.status_code == 201

        data = response.json()

        assert data["question_set_id"] == (
            fixture["question_set"].id
        )
        assert data["skill_id"] == fixture["skill"].id
        assert data["name"] == "Python"
        assert data["display_order"] == 1
        assert data["easy_count"] == 2
        assert data["medium_count"] == 3
        assert data["hard_count"] == 1
        assert data["is_locked"] is False
        assert data["created_at"] is not None
        assert data["updated_at"] is not None

        section = db.get(
            Section,
            data["id"],
        )

        assert section is not None
        assert section.question_set_id == (
            fixture["question_set"].id
        )
        assert section.skill_id == fixture["skill"].id

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_section_rejects_zero_total_questions():
    """A section must contain at least one question."""

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(manager)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "Python",
                "display_order": 1,
                "easy_count": 0,
                "medium_count": 0,
                "hard_count": 0,
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Section must contain at least one question."
        )

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_section_rejects_negative_counts():
    """Negative difficulty counts are rejected by request validation."""

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(manager)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "Python",
                "display_order": 1,
                "easy_count": -1,
                "medium_count": 1,
                "hard_count": 0,
            },
        )

        assert response.status_code == 422

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_section_rejects_blank_name():
    """A whitespace-only section name is rejected."""

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(manager)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "   ",
                "display_order": 1,
                "easy_count": 1,
                "medium_count": 0,
                "hard_count": 0,
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Section name cannot be empty."
        )

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_section_rejects_unconfirmed_job_skills():
    """Sections cannot be created until job skills are confirmed."""

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        review = (
            db.query(JobSkillReview)
            .filter(
                JobSkillReview.job_id == fixture["job"].id
            )
            .first()
        )

        assert review is not None

        review.status = "pending"

        db.commit()

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(manager)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "Python",
                "display_order": 1,
                "easy_count": 1,
                "medium_count": 1,
                "hard_count": 0,
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "The job's skills must be confirmed before creating sections."
        )

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_section_rejects_skill_not_belonging_to_job():
    """A skill from another job cannot be used in the section."""

    db = SessionLocal()

    manager = None
    fixture = None
    other_job = None
    other_skill = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        grant_job_access(
            db,
            fixture,
            manager,
        )

        other_job = Job(
            title=f"S4-03 Other Job {uuid4().hex[:8]}",
            description="Unrelated job for skill ownership test.",
            created_by=fixture["recruiter"].id,
        )

        db.add(other_job)
        db.flush()

        other_skill = Skill(
            name=f"s4-other-skill-{uuid4().hex[:10]}",
        )

        db.add(other_skill)
        db.flush()

        db.add(
            JobSkill(
                job_id=other_job.id,
                skill_id=other_skill.id,
            )
        )

        db.commit()

        token = create_access_token_for_user(manager)

        response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": other_skill.id,
                "name": "Other Skill",
                "display_order": 1,
                "easy_count": 1,
                "medium_count": 0,
                "hard_count": 0,
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Skill does not belong to the job for this question set."
        )

    finally:
        if other_job is not None:
            db.query(JobSkill).filter(
                JobSkill.job_id == other_job.id
            ).delete(
                synchronize_session=False
            )

        if other_job is not None:
            db.query(Job).filter(
                Job.id == other_job.id
            ).delete(
                synchronize_session=False
            )

        if other_skill is not None:
            db.query(Skill).filter(
                Skill.id == other_skill.id
            ).delete(
                synchronize_session=False
            )

        db.commit()

        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_duplicate_skill_section_is_rejected():
    """A question set cannot contain two sections for one skill."""

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_section_fixture(db)

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(manager)

        first_response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "Python",
                "display_order": 1,
                "easy_count": 1,
                "medium_count": 0,
                "hard_count": 0,
            },
        )

        assert first_response.status_code == 201

        second_response = client.post(
            "/sections",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_set_id": fixture["question_set"].id,
                "skill_id": fixture["skill"].id,
                "name": "Python Advanced",
                "display_order": 2,
                "easy_count": 1,
                "medium_count": 1,
                "hard_count": 0,
            },
        )

        assert second_response.status_code == 422
        assert second_response.json()["detail"] == (
            "A section for this skill already exists in the question set."
        )

    finally:
        if fixture is not None:
            cleanup_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()