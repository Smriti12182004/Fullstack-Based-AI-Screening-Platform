"""S4-03 question-set configuration API tests."""

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
    SectionSkill,
    Skill,
    User,
)


client = TestClient(app)


def create_test_user(db, role: str) -> User:
    """Create an isolated user for configuration API tests."""

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
    """Create an application-compatible access token."""

    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def create_configuration_fixture(db):
    """
    Create an isolated question-set structure using the
    new one-difficulty-per-section model.

    Structure:

    Easy Section
        Skill 1 -> 1
        Skill 2 -> 1

    Medium Section
        Skill 1 -> 1

    Hard Section
        Skill 2 -> 1

    Total = 4
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

    skill_1 = Skill(
        name=f"s4-config-api-skill-1-{uuid4().hex[:10]}",
    )

    skill_2 = Skill(
        name=f"s4-config-api-skill-2-{uuid4().hex[:10]}",
    )

    db.add_all(
        [
            skill_1,
            skill_2,
        ]
    )

    db.flush()

    db.add_all(
        [
            JobSkill(
                job_id=job.id,
                skill_id=skill_1.id,
            ),
            JobSkill(
                job_id=job.id,
                skill_id=skill_2.id,
            ),
        ]
    )

    db.add(
        JobSkillReview(
            job_id=job.id,
            status="confirmed",
        )
    )

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

    easy_section = Section(
        question_set_id=question_set.id,
        name="Easy Technical",
        difficulty="easy",
        display_order=1,
        is_locked=False,
    )

    medium_section = Section(
        question_set_id=question_set.id,
        name="Medium Technical",
        difficulty="medium",
        display_order=2,
        is_locked=False,
    )

    hard_section = Section(
        question_set_id=question_set.id,
        name="Hard Technical",
        difficulty="hard",
        display_order=3,
        is_locked=False,
    )

    db.add_all(
        [
            easy_section,
            medium_section,
            hard_section,
        ]
    )

    db.flush()

    easy_skill_1 = SectionSkill(
        section_id=easy_section.id,
        skill_id=skill_1.id,
        question_count=1,
    )

    easy_skill_2 = SectionSkill(
        section_id=easy_section.id,
        skill_id=skill_2.id,
        question_count=1,
    )

    medium_skill_1 = SectionSkill(
        section_id=medium_section.id,
        skill_id=skill_1.id,
        question_count=1,
    )

    hard_skill_2 = SectionSkill(
        section_id=hard_section.id,
        skill_id=skill_2.id,
        question_count=1,
    )

    db.add_all(
        [
            easy_skill_1,
            easy_skill_2,
            medium_skill_1,
            hard_skill_2,
        ]
    )

    configuration = QuestionSetConfiguration(
        question_set_id=question_set.id,
        total_questions=4,
        duration_minutes=30,
        candidate_instructions="Complete all questions.",
    )

    db.add(configuration)

    db.commit()

    db.refresh(job)
    db.refresh(skill_1)
    db.refresh(skill_2)
    db.refresh(question_set)
    db.refresh(easy_section)
    db.refresh(medium_section)
    db.refresh(hard_section)
    db.refresh(configuration)

    return {
        "recruiter": recruiter,
        "job": job,
        "skills": [
            skill_1,
            skill_2,
        ],
        "question_set": question_set,
        "sections": [
            easy_section,
            medium_section,
            hard_section,
        ],
        "configuration": configuration,
    }


def cleanup_configuration_fixture(db, fixture):
    """Remove all records created by the configuration fixture."""

    question_set = fixture["question_set"]
    job = fixture["job"]
    skills = fixture["skills"]

    section_ids = [
        section.id
        for section in (
            db.query(Section)
            .filter(
                Section.question_set_id
                == question_set.id
            )
            .all()
        )
    ]

    if section_ids:
        db.query(SectionSkill).filter(
            SectionSkill.section_id.in_(section_ids)
        ).delete(
            synchronize_session=False
        )

    db.query(QuestionSetConfiguration).filter(
        QuestionSetConfiguration.question_set_id
        == question_set.id
    ).delete(
        synchronize_session=False
    )

    db.query(Section).filter(
        Section.question_set_id
        == question_set.id
    ).delete(
        synchronize_session=False
    )

    db.query(QuestionSet).filter(
        QuestionSet.id
        == question_set.id
    ).delete(
        synchronize_session=False
    )

    db.query(JobAssessmentAccess).filter(
        JobAssessmentAccess.job_id
        == job.id
    ).delete(
        synchronize_session=False
    )

    db.query(JobSkillReview).filter(
        JobSkillReview.job_id
        == job.id
    ).delete(
        synchronize_session=False
    )

    db.query(JobSkill).filter(
        JobSkill.job_id
        == job.id
    ).delete(
        synchronize_session=False
    )

    db.query(Job).filter(
        Job.id
        == job.id
    ).delete(
        synchronize_session=False
    )

    skill_ids = [
        skill.id
        for skill in skills
    ]

    db.query(Skill).filter(
        Skill.id.in_(skill_ids)
    ).delete(
        synchronize_session=False
    )


def delete_test_user(
    db,
    user: User | None,
):
    """Delete an isolated test user."""

    if user is None:
        return

    db.query(User).filter(
        User.id == user.id
    ).delete(
        synchronize_session=False
    )


def grant_job_access(
    db,
    fixture,
    user: User,
):
    """Grant a test user access to the fixture job."""

    access = JobAssessmentAccess(
        job_id=fixture["job"].id,
        user_id=user.id,
        assigned_by=fixture["recruiter"].id,
    )

    db.add(access)
    db.commit()

    return access


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

        token = create_access_token_for_user(
            manager
        )

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
                "total_questions": 4,
                "duration_minutes": 45,
                "candidate_instructions": (
                    "Read each question carefully."
                ),
            },
        )

        assert response.status_code == 403

        assert response.json()["detail"] == (
            "You are not authorized to configure "
            "this question set."
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

        token = create_access_token_for_user(
            reviewer
        )

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
    """
    An assessment manager with JobAssessmentAccess can
    configure the question set.
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

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(
            manager
        )

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
                "total_questions": 4,
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

        assert data["total_questions"] == 4

        assert data["duration_minutes"] == 45

        assert data["candidate_instructions"] == (
            "Read each question carefully."
        )

        assert data["section_question_count"] == 4

        assert data["easy_count"] == 2

        assert data["medium_count"] == 1

        assert data["hard_count"] == 1

        db.refresh(
            fixture["configuration"]
        )

        assert fixture["configuration"].total_questions == 4

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

    try:
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        fixture = create_configuration_fixture(db)

        grant_job_access(
            db,
            fixture,
            reviewer,
        )

        token = create_access_token_for_user(
            reviewer
        )

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

        assert data["total_questions"] == 4

        assert data["duration_minutes"] == 30

        assert data["candidate_instructions"] == (
            "Complete all questions."
        )

        assert data["section_question_count"] == 4

        assert data["easy_count"] == 2

        assert data["medium_count"] == 1

        assert data["hard_count"] == 1

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


def test_configuration_counts_include_all_skills_in_all_sections():
    """
    Configuration totals aggregate every skill allocation
    across every difficulty section.
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

        grant_job_access(
            db,
            fixture,
            manager,
        )

        token = create_access_token_for_user(
            manager
        )

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
                "total_questions": 4,
                "duration_minutes": 60,
                "candidate_instructions": (
                    "Complete the assessment."
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        # Easy section:
        #   Skill 1 = 1
        #   Skill 2 = 1
        #   Total = 2
        #
        # Medium section:
        #   Skill 1 = 1
        #   Total = 1
        #
        # Hard section:
        #   Skill 2 = 1
        #   Total = 1
        #
        # Overall = 4

        assert data["section_question_count"] == 4

        assert data["easy_count"] == 2

        assert data["medium_count"] == 1

        assert data["hard_count"] == 1

        assert data["total_questions"] == 4

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