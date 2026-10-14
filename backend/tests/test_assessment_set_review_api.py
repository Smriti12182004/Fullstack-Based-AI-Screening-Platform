"""AssessmentSet reviewer workflow API tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    AssessmentSet,
    Job,
    JobAssessmentAccess,
    Question,
    QuestionSet,
    QuestionSlot,
    Section,
    Skill,
    User,
)


client = TestClient(app)


def create_test_user(
    db,
    role: str,
) -> User:
    """Create an isolated verified user."""
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"s4_set_review_{role}_{unique_id}",
        email=f"s4_set_review_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def token_for(user: User) -> str:
    """Create an application-compatible JWT."""
    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def create_assessment_set_fixture(
    db,
):
    """
    Create one job with:
    - one reviewer assigned through JobAssessmentAccess
    - one QuestionSet
    - Set A submitted_for_review
    - Set B left as draft
    - one filled question slot in Set A
    """
    manager = create_test_user(
        db,
        "assessment_manager",
    )

    reviewer = create_test_user(
        db,
        "assessment_reviewer",
    )

    job = Job(
        title=f"S4 AssessmentSet Review Job {uuid4().hex[:8]}",
        description="AssessmentSet reviewer workflow test job.",
        created_by=manager.id,
    )
    db.add(job)
    db.flush()

    db.add(
        JobAssessmentAccess(
            job_id=job.id,
            user_id=manager.id,
            assigned_by=manager.id,
        )
    )

    db.add(
        JobAssessmentAccess(
            job_id=job.id,
            user_id=reviewer.id,
            assigned_by=manager.id,
        )
    )

    question_set = QuestionSet(
        job_id=job.id,
        name=f"S4 AssessmentSet Review Question Set {uuid4().hex[:8]}",
        description="AssessmentSet review API test question set.",
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
        name=f"s4-assessment-set-review-skill-{uuid4().hex[:8]}",
    )
    db.add(skill)
    db.flush()

    question = Question(
        question_text=(
            f"AssessmentSet review question {uuid4().hex[:8]}"
        ),
        question_type="MCQ",
        section_type="conceptual",
        skill_id=skill.id,
        difficulty="medium",
        options=[
            "Option A",
            "Option B",
            "Option C",
            "Option D",
        ],
        correct_answer="Option B",
        explanation="Option B is the correct answer.",
        status="pending_review",
        source="ai_generated",
        created_by=manager.id,
    )
    db.add(question)
    db.flush()

    assessment_set_a = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=1,
        label="A",
        status="submitted_for_review",
    )
    db.add(assessment_set_a)
    db.flush()

    assessment_set_b = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=2,
        label="B",
        status="draft",
    )
    db.add(assessment_set_b)
    db.flush()

    slot_a = QuestionSlot(
        assessment_set_id=assessment_set_a.id,
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
    db.add(slot_a)

    db.commit()

    db.refresh(assessment_set_a)
    db.refresh(assessment_set_b)
    db.refresh(question)

    return {
        "manager": manager,
        "reviewer": reviewer,
        "job": job,
        "question_set": question_set,
        "section": section,
        "skill": skill,
        "question": question,
        "assessment_set_a": assessment_set_a,
        "assessment_set_b": assessment_set_b,
        "slot_a": slot_a,
    }


def cleanup_fixture(
    db,
    fixture,
):
    """Delete all isolated test records."""
    assessment_set_a = fixture["assessment_set_a"]
    assessment_set_b = fixture["assessment_set_b"]
    question = fixture["question"]
    section = fixture["section"]
    question_set = fixture["question_set"]
    job = fixture["job"]
    reviewer = fixture["reviewer"]
    manager = fixture["manager"]

    db.query(QuestionSlot).filter(
        QuestionSlot.assessment_set_id.in_(
            [
                assessment_set_a.id,
                assessment_set_b.id,
            ]
        )
    ).delete(
        synchronize_session=False
    )

    db.query(AssessmentSet).filter(
        AssessmentSet.id.in_(
            [
                assessment_set_a.id,
                assessment_set_b.id,
            ]
        )
    ).delete(
        synchronize_session=False
    )

    db.query(Question).filter(
        Question.id == question.id
    ).delete(
        synchronize_session=False
    )

    db.query(Section).filter(
        Section.id == section.id
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

    db.query(Skill).filter(
        Skill.id == fixture["skill"].id
    ).delete(
        synchronize_session=False
    )

    db.query(Job).filter(
        Job.id == job.id
    ).delete(
        synchronize_session=False
    )

    db.query(User).filter(
        User.id.in_(
            [
                manager.id,
                reviewer.id,
            ]
        )
    ).delete(
        synchronize_session=False
    )

    db.commit()


def test_reviewer_sees_only_submitted_assessment_set():
    """Reviewer queue contains submitted Set A but not draft Set B."""
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_assessment_set_fixture(db)

        response = client.get(
            "/assessment-reviews/sets/queue",
            headers={
                "Authorization": (
                    f"Bearer {token_for(fixture['reviewer'])}"
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        matching_a = [
            item
            for item in data
            if item["id"] == fixture["assessment_set_a"].id
        ]

        matching_b = [
            item
            for item in data
            if item["id"] == fixture["assessment_set_b"].id
        ]

        assert len(matching_a) == 1
        assert len(matching_b) == 0

        item = matching_a[0]

        assert item["job_id"] == fixture["job"].id
        assert item["question_set_id"] == fixture["question_set"].id
        assert item["variant_number"] == 1
        assert item["label"] == "A"
        assert item["status"] == "submitted_for_review"
        assert item["question_count"] == 1
        assert item["pending_review_count"] == 1
        assert item["approved_count"] == 0

    finally:
        if fixture is not None:
            cleanup_fixture(db, fixture)

        db.close()


def test_reviewer_can_open_submitted_assessment_set():
    """Reviewer receives the durable AssessmentSet review package."""
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_assessment_set_fixture(db)

        response = client.get(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set_a'].id}",
            headers={
                "Authorization": (
                    f"Bearer {token_for(fixture['reviewer'])}"
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["assessment_set_id"] == (
            fixture["assessment_set_a"].id
        )
        assert data["job_id"] == fixture["job"].id
        assert data["question_set_id"] == (
            fixture["question_set"].id
        )
        assert data["variant_number"] == 1
        assert data["label"] == "A"
        assert data["status"] == "submitted_for_review"
        assert data["review_status"] == "pending"

        assert data["job"]["id"] == fixture["job"].id
        assert data["job"]["title"] == fixture["job"].title

        assert data["question_set"]["id"] == (
            fixture["question_set"].id
        )
        assert data["question_set"]["name"] == (
            fixture["question_set"].name
        )

        assert data["summary"]["total_slots"] == 1
        assert data["summary"]["filled_slots"] == 1
        assert data["summary"]["remaining_slots"] == 0
        assert data["summary"]["pending_review"] == 1
        assert data["summary"]["approved"] == 0
        assert data["summary"]["rejected"] == 0

        assert len(data["questions"]) == 1
        assert len(data["slots"]) == 1

        question = data["questions"][0]

        assert question["slot_id"] == fixture["slot_a"].id
        assert question["section_id"] == fixture["section"].id
        assert question["section_name"] == (
            fixture["section"].name
        )
        assert question["skill_id"] == fixture["skill"].id
        assert question["skill_name"] == (
            fixture["skill"].name
        )
        assert question["difficulty"] == "medium"
        assert question["slot_number"] == 1
        assert question["preferred_question_type"] == "MCQ"

        assert question["question_id"] == fixture["question"].id
        assert question["question_text"] == (
            fixture["question"].question_text
        )
        assert question["question_type"] == "MCQ"

        assert question["options"] == [
            "Option A",
            "Option B",
            "Option C",
            "Option D",
        ]

        assert question["correct_answer"] == "Option B"
        assert question["explanation"] == (
            "Option B is the correct answer."
        )
        assert question["status"] == "pending_review"
        assert question["source"] == "ai_generated"
        assert question["version"] == 1

    finally:
        if fixture is not None:
            cleanup_fixture(db, fixture)

        db.close()


def test_reviewer_without_job_access_cannot_see_submitted_set():
    """A reviewer without JobAssessmentAccess cannot see the set."""
    db = SessionLocal()
    fixture = None
    unauthorized_reviewer = None

    try:
        fixture = create_assessment_set_fixture(db)

        unauthorized_reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )
        db.commit()

        response = client.get(
            "/assessment-reviews/sets/queue",
            headers={
                "Authorization": (
                    f"Bearer {token_for(unauthorized_reviewer)}"
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert not any(
            item["id"] == fixture["assessment_set_a"].id
            for item in data
        )

    finally:
        if fixture is not None:
            cleanup_fixture(db, fixture)

        if unauthorized_reviewer is not None:
            db.query(User).filter(
                User.id == unauthorized_reviewer.id
            ).delete(
                synchronize_session=False
            )
            db.commit()

        db.close()


def test_assessment_manager_cannot_access_assessment_set_review_queue():
    """Assessment manager cannot access reviewer-only endpoints."""
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_assessment_set_fixture(db)

        response = client.get(
            "/assessment-reviews/sets/queue",
            headers={
                "Authorization": (
                    f"Bearer {token_for(fixture['manager'])}"
                ),
            },
        )

        assert response.status_code == 403

        response = client.get(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set_a'].id}",
            headers={
                "Authorization": (
                    f"Bearer {token_for(fixture['manager'])}"
                ),
            },
        )

        assert response.status_code == 403

    finally:
        if fixture is not None:
            cleanup_fixture(db, fixture)

        db.close()


def test_reviewer_cannot_open_draft_assessment_set():
    """Draft sets cannot be opened from the reviewer workflow."""
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_assessment_set_fixture(db)

        response = client.get(
            f"/assessment-reviews/sets/"
            f"{fixture['assessment_set_b'].id}",
            headers={
                "Authorization": (
                    f"Bearer {token_for(fixture['reviewer'])}"
                ),
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Only assessment sets submitted for review can "
            "be opened from the reviewer queue."
        )

    finally:
        if fixture is not None:
            cleanup_fixture(db, fixture)

        db.close()