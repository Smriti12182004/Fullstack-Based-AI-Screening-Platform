"""S4-03 question-set configuration API authorization tests."""

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
    QuestionSetConfiguration,
    Section,
    Skill,
    User,
)


client = TestClient(app)


def create_test_user(db, role: str) -> User:
    """Create an isolated user for API authorization tests."""
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"s4_cfg_{role}_{unique_id}",
        email=f"s4_cfg_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def create_access_token_for_user(user: User) -> str:
    """Create an application-compatible JWT for a test user."""
    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def create_configuration_fixture(db):
    """
    Create an isolated job/question-set structure suitable for
    configuration API tests.
    """
    recruiter = (
        db.query(User)
        .filter(User.role == "recruiter")
        .first()
    )

    assert recruiter is not None, (
        "This test requires an existing recruiter user."
    )

    job = Job(
        title=f"S4-03 Configuration API Job {uuid4().hex[:8]}",
        description=(
            "Question-set configuration authorization test job."
        ),
        created_by=recruiter.id,
    )

    db.add(job)
    db.flush()

    skill = Skill(
        name=f"s4-config-api-skill-{uuid4().hex[:10]}",
    )

    db.add(skill)
    db.flush()

    job_skill = JobSkill(
        job_id=job.id,
        skill_id=skill.id,
    )

    db.add(job_skill)

    job_skill_review = JobSkillReview(
        job_id=job.id,
        status="confirmed",
    )

    db.add(job_skill_review)

    question_set = QuestionSet(
        job_id=job.id,
        name=f"S4-03 Configuration Set {uuid4().hex[:8]}",
        description="Configuration API authorization test set.",
        status="draft",
        version=1,
        created_by=recruiter.id,
    )

    db.add(question_set)
    db.flush()

    section = Section(
        question_set_id=question_set.id,
        skill_id=skill.id,
        name="Python",
        display_order=1,
        easy_count=1,
        medium_count=1,
        hard_count=0,
        is_locked=False,
    )

    db.add(section)

    configuration = QuestionSetConfiguration(
        question_set_id=question_set.id,
        total_questions=2,
        duration_minutes=30,
        candidate_instructions="Complete all questions.",
    )

    db.add(configuration)

    db.commit()

    db.refresh(job)
    db.refresh(skill)
    db.refresh(question_set)
    db.refresh(section)
    db.refresh(configuration)

    return {
        "recruiter": recruiter,
        "job": job,
        "skill": skill,
        "question_set": question_set,
        "section": section,
        "configuration": configuration,
    }


def cleanup_configuration_fixture(db, fixture):
    """Remove all records created by the configuration test fixture."""

    question_set = fixture["question_set"]
    job = fixture["job"]
    skill = fixture["skill"]

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


def test_manager_without_job_access_cannot_configure_question_set():
    """
    An assessment manager without JobAssessmentAccess must not
    configure a question set belonging to another job.
    """

    db = SessionLocal()

    manager = None
    fixture = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_configuration_fixture(db)

        db.commit()

        token = create_access_token_for_user(manager)

        response = client.put(
            (
                f"/question-sets/"
                f"{fixture['question_set'].id}"
                "/configuration"
            ),
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "total_questions": 2,
                "duration_minutes": 45,
                "candidate_instructions": (
                    "Unauthorized configuration attempt."
                ),
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == (
            "You are not authorized to configure this question set."
        )

        db.refresh(fixture["configuration"])

        assert fixture["configuration"].total_questions == 2
        assert fixture["configuration"].duration_minutes == 30
        assert (
            fixture["configuration"].candidate_instructions
            == "Complete all questions."
        )

    finally:
        if fixture is not None:
            cleanup_configuration_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_reviewer_without_job_access_cannot_view_configuration():
    """
    An assessment reviewer without JobAssessmentAccess must not
    view configuration for another job.
    """

    db = SessionLocal()

    reviewer = None
    fixture = None

    try:
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        fixture = create_configuration_fixture(db)

        db.commit()

        token = create_access_token_for_user(reviewer)

        response = client.get(
            (
                f"/question-sets/"
                f"{fixture['question_set'].id}"
                "/configuration"
            ),
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == (
            "You are not authorized to view this question set."
        )

    finally:
        if fixture is not None:
            cleanup_configuration_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            reviewer,
        )

        db.commit()
        db.close()


def test_manager_with_job_access_can_configure_question_set():
    """An assessment manager with job access can configure the set."""

    db = SessionLocal()

    manager = None
    fixture = None
    access = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        fixture = create_configuration_fixture(db)

        access = JobAssessmentAccess(
            job_id=fixture["job"].id,
            user_id=manager.id,
            assigned_by=fixture["recruiter"].id,
        )

        db.add(access)
        db.commit()

        token = create_access_token_for_user(manager)

        response = client.put(
            (
                f"/question-sets/"
                f"{fixture['question_set'].id}"
                "/configuration"
            ),
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "total_questions": 2,
                "duration_minutes": 45,
                "candidate_instructions": (
                    "Read each question carefully."
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["question_set_id"] == (
            fixture["question_set"].id
        )
        assert data["total_questions"] == 2
        assert data["duration_minutes"] == 45
        assert data["candidate_instructions"] == (
            "Read each question carefully."
        )
        assert data["section_question_count"] == 2
        assert data["easy_count"] == 1
        assert data["medium_count"] == 1
        assert data["hard_count"] == 0

        db.refresh(fixture["configuration"])

        assert fixture["configuration"].total_questions == 2
        assert fixture["configuration"].duration_minutes == 45
        assert (
            fixture["configuration"].candidate_instructions
            == "Read each question carefully."
        )

    finally:
        if fixture is not None:
            cleanup_configuration_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            manager,
        )

        db.commit()
        db.close()


def test_reviewer_with_job_access_can_view_configuration():
    """An assessment reviewer with job access can view configuration."""

    db = SessionLocal()

    reviewer = None
    fixture = None
    access = None

    try:
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        fixture = create_configuration_fixture(db)

        access = JobAssessmentAccess(
            job_id=fixture["job"].id,
            user_id=reviewer.id,
            assigned_by=fixture["recruiter"].id,
        )

        db.add(access)
        db.commit()

        token = create_access_token_for_user(reviewer)

        response = client.get(
            (
                f"/question-sets/"
                f"{fixture['question_set'].id}"
                "/configuration"
            ),
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["question_set_id"] == (
            fixture["question_set"].id
        )
        assert data["total_questions"] == 2
        assert data["duration_minutes"] == 30
        assert data["candidate_instructions"] == (
            "Complete all questions."
        )
        assert data["section_question_count"] == 2
        assert data["easy_count"] == 1
        assert data["medium_count"] == 1
        assert data["hard_count"] == 0

    finally:
        if fixture is not None:
            cleanup_configuration_fixture(
                db,
                fixture,
            )

        delete_test_user(
            db,
            reviewer,
        )

        db.commit()
        db.close()