"""Tests for AssessmentSet completed-review history."""

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


def create_test_user(db, role: str) -> User:
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"history_test_{role}_{unique_id}",
        email=f"history_test_{role}_{unique_id}@test.com",
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


def create_fixture(db):
    manager = create_test_user(
        db,
        "assessment_manager",
    )

    reviewer = create_test_user(
        db,
        "assessment_reviewer",
    )

    job = Job(
        title=f"Review History Job {uuid4().hex[:8]}",
        description="AssessmentSet completed-history test job.",
        created_by=manager.id,
    )

    db.add(job)
    db.flush()

    db.add_all(
        [
            JobAssessmentAccess(
                job_id=job.id,
                user_id=manager.id,
                assigned_by=manager.id,
            ),
            JobAssessmentAccess(
                job_id=job.id,
                user_id=reviewer.id,
                assigned_by=manager.id,
            ),
        ]
    )

    question_set = QuestionSet(
        job_id=job.id,
        name=f"History Question Set {uuid4().hex[:8]}",
        description="Completed review history test question set.",
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
        name=f"history-skill-{uuid4().hex[:8]}"
    )

    db.add(skill)
    db.flush()

    approved_question = Question(
        question_text=(
            f"Approved history question {uuid4().hex[:8]}"
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
        explanation="Option B is correct.",
        status="approved",
        source="ai_generated",
        created_by=manager.id,
        reviewed_by=reviewer.id,
        rejection_reason=None,
    )

    rejected_question = Question(
        question_text=(
            f"Rejected history question {uuid4().hex[:8]}"
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
        correct_answer="Option A",
        explanation="Option A is correct.",
        status="rejected",
        source="ai_generated",
        created_by=manager.id,
        reviewed_by=reviewer.id,
        rejection_reason=(
            "The question is too definition-oriented."
        ),
    )

    db.add_all(
        [
            approved_question,
            rejected_question,
        ]
    )

    db.flush()

    approved_set = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=1,
        label="Set A",
        status="approved",
        reviewer_id=reviewer.id,
        reviewed_at=approved_question.updated_at,
        review_comment=(
            "All questions verified and ready for HR handoff."
        ),
        review_checklist={
            "question_quality": True,
            "answer_keys_verified": True,
            "skill_mapping_verified": True,
            "difficulty_verified": True,
            "blueprint_compliance": True,
            "duplicate_check": True,
            "candidate_instructions_verified": True,
        },
    )

    rejected_set = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=2,
        label="Set B",
        status="rejected",
        reviewer_id=reviewer.id,
        reviewed_at=rejected_question.updated_at,
        review_comment=(
            "Question #"
            f"{rejected_question.id} was rejected. "
            "Reason: The question is too definition-oriented."
        ),
        review_checklist={
            "question_quality": False,
            "answer_keys_verified": False,
            "skill_mapping_verified": True,
            "difficulty_verified": True,
            "blueprint_compliance": False,
            "duplicate_check": False,
            "candidate_instructions_verified": True,
        },
    )

    db.add_all(
        [
            approved_set,
            rejected_set,
        ]
    )

    db.flush()

    approved_slot = QuestionSlot(
        assessment_set_id=approved_set.id,
        section_id=section.id,
        skill_id=skill.id,
        section_type="conceptual",
        difficulty="medium",
        slot_number=1,
        preferred_question_type="MCQ",
        current_question_id=approved_question.id,
        source_type="ai_generated",
        status="filled",
    )

    rejected_slot = QuestionSlot(
        assessment_set_id=rejected_set.id,
        section_id=section.id,
        skill_id=skill.id,
        section_type="conceptual",
        difficulty="medium",
        slot_number=1,
        preferred_question_type="MCQ",
        current_question_id=rejected_question.id,
        source_type="ai_generated",
        status="filled",
    )

    db.add_all(
        [
            approved_slot,
            rejected_slot,
        ]
    )

    db.commit()

    for item in (
        manager,
        reviewer,
        job,
        question_set,
        section,
        skill,
        approved_question,
        rejected_question,
        approved_set,
        rejected_set,
        approved_slot,
        rejected_slot,
    ):
        db.refresh(item)

    return {
        "manager": manager,
        "reviewer": reviewer,
        "job": job,
        "question_set": question_set,
        "section": section,
        "skill": skill,
        "approved_question": approved_question,
        "rejected_question": rejected_question,
        "approved_set": approved_set,
        "rejected_set": rejected_set,
        "approved_slot": approved_slot,
        "rejected_slot": rejected_slot,
    }


def cleanup(db, fixture):
    approved_set_id = fixture["approved_set"].id
    rejected_set_id = fixture["rejected_set"].id
    approved_question_id = fixture["approved_question"].id
    rejected_question_id = fixture["rejected_question"].id
    question_set_id = fixture["question_set"].id
    section_id = fixture["section"].id
    skill_id = fixture["skill"].id
    job_id = fixture["job"].id
    user_ids = [
        fixture["manager"].id,
        fixture["reviewer"].id,
    ]

    db.query(QuestionSlot).filter(
        QuestionSlot.assessment_set_id.in_(
            [
                approved_set_id,
                rejected_set_id,
            ]
        )
    ).delete(
        synchronize_session=False
    )

    db.query(AssessmentSet).filter(
        AssessmentSet.id.in_(
            [
                approved_set_id,
                rejected_set_id,
            ]
        )
    ).delete(
        synchronize_session=False
    )

    db.query(Question).filter(
        Question.id.in_(
            [
                approved_question_id,
                rejected_question_id,
            ]
        )
    ).delete(
        synchronize_session=False
    )

    db.query(Section).filter(
        Section.id == section_id
    ).delete(
        synchronize_session=False
    )

    db.query(QuestionSet).filter(
        QuestionSet.id == question_set_id
    ).delete(
        synchronize_session=False
    )

    db.query(JobAssessmentAccess).filter(
        JobAssessmentAccess.job_id == job_id
    ).delete(
        synchronize_session=False
    )

    db.query(Skill).filter(
        Skill.id == skill_id
    ).delete(
        synchronize_session=False
    )

    db.query(Job).filter(
        Job.id == job_id
    ).delete(
        synchronize_session=False
    )

    db.query(User).filter(
        User.id.in_(user_ids)
    ).delete(
        synchronize_session=False
    )

    db.commit()


def test_completed_review_queue_contains_approved_and_rejected_sets():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_fixture(db)

        token = token_for(
            fixture["reviewer"]
        )

        response = client.get(
            "/assessment-reviews/sets/completed",
            headers={
                "Authorization": f"Bearer {token}"
            },
        )

        assert response.status_code == 200

        data = response.json()

        matching = [
            item
            for item in data
            if item["question_set_id"]
            == fixture["question_set"].id
        ]

        assert len(matching) == 2

        statuses = {
            item["status"]
            for item in matching
        }

        assert statuses == {
            "approved",
            "rejected",
        }

        ids = {
            item["id"]
            for item in matching
        }

        assert fixture["approved_set"].id in ids
        assert fixture["rejected_set"].id in ids

        for item in matching:
            assert "assessment_sets" in item
            assert len(
                item["assessment_sets"]
            ) == 2

    finally:
        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        db.close()


def test_completed_review_queue_excludes_pending_sets():
    db = SessionLocal()
    fixture = None
    pending_question_set = None
    pending_set = None

    try:
        fixture = create_fixture(db)

        pending_question_set = QuestionSet(
            job_id=fixture["job"].id,
            name=(
                f"Pending History Question Set "
                f"{uuid4().hex[:8]}"
            ),
            description=(
                "Separate question set used to verify "
                "pending reviews are excluded."
            ),
            variant_count=2,
            status="draft",
            version=1,
            created_by=fixture["manager"].id,
        )

        db.add(
            pending_question_set
        )
        db.flush()

        pending_set = AssessmentSet(
            question_set_id=pending_question_set.id,
            variant_number=1,
            label="Set A",
            status="submitted_for_review",
            reviewer_id=None,
            reviewed_at=None,
            review_comment=None,
            review_checklist={},
        )

        db.add(
            pending_set
        )
        db.commit()

        db.refresh(
            pending_question_set
        )

        db.refresh(
            pending_set
        )

        token = token_for(
            fixture["reviewer"]
        )

        response = client.get(
            "/assessment-reviews/sets/completed",
            headers={
                "Authorization": f"Bearer {token}"
            },
        )

        assert response.status_code == 200

        data = response.json()

        matching_original = [
            item
            for item in data
            if item["question_set_id"]
            == fixture["question_set"].id
        ]

        assert len(
            matching_original
        ) == 2

        all_returned_ids = {
            item["id"]
            for item in data
        }

        assert (
            fixture["approved_set"].id
            in all_returned_ids
        )

        assert (
            fixture["rejected_set"].id
            in all_returned_ids
        )

        assert (
            pending_set.id
            not in all_returned_ids
        )

        pending_question_set_ids = {
            item["question_set_id"]
            for item in data
        }

        assert (
            pending_question_set.id
            not in pending_question_set_ids
        )

    finally:
        if pending_set is not None:
            db.delete(
                pending_set
            )
            db.commit()

        if pending_question_set is not None:
            db.delete(
                pending_question_set
            )
            db.commit()

        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        db.close()


def test_completed_approved_review_package_returns_persisted_review_state():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_fixture(db)

        token = token_for(
            fixture["reviewer"]
        )

        response = client.get(
            "/assessment-reviews/sets/completed/"
            f"{fixture['approved_set'].id}",
            headers={
                "Authorization": f"Bearer {token}"
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert (
            data["assessment_set_id"]
            == fixture["approved_set"].id
        )

        assert (
            data["status"]
            == "approved"
        )

        assert (
            data["review_status"]
            == "approved"
        )

        assert (
            data["reviewer_id"]
            == fixture["reviewer"].id
        )

        assert (
            data["reviewed_at"]
            is not None
        )

        assert (
            data["review_comment"]
            == "All questions verified and ready for HR handoff."
        )

        checklist = data[
            "review_checklist"
        ]

        assert (
            checklist["question_quality"]
            is True
        )

        assert (
            checklist["answer_keys_verified"]
            is True
        )

        assert (
            checklist["skill_mapping_verified"]
            is True
        )

        assert len(
            data["questions"]
        ) == 1

        question = data[
            "questions"
        ][0]

        assert (
            question["question_id"]
            == fixture["approved_question"].id
        )

        assert (
            question["status"]
            == "approved"
        )

        assert (
            question["question_text"]
            == fixture["approved_question"].question_text
        )

    finally:
        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        db.close()


def test_completed_rejected_review_package_returns_rejection_reason():
    db = SessionLocal()
    fixture = None

    try:
        fixture = create_fixture(db)

        token = token_for(
            fixture["reviewer"]
        )

        response = client.get(
            "/assessment-reviews/sets/completed/"
            f"{fixture['rejected_set'].id}",
            headers={
                "Authorization": f"Bearer {token}"
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert (
            data["assessment_set_id"]
            == fixture["rejected_set"].id
        )

        assert (
            data["status"]
            == "rejected"
        )

        assert (
            data["review_status"]
            == "rejected"
        )

        assert (
            data["reviewer_id"]
            == fixture["reviewer"].id
        )

        assert (
            data["reviewed_at"]
            is not None
        )

        assert (
            "definition-oriented"
            in data["review_comment"]
        )

        assert (
            data["review_checklist"][
                "question_quality"
            ]
            is False
        )

        assert len(
            data["questions"]
        ) == 1

        question = data[
            "questions"
        ][0]

        assert (
            question["question_id"]
            == fixture["rejected_question"].id
        )

        assert (
            question["status"]
            == "rejected"
        )

        assert (
            question["rejection_reason"]
            == "The question is too definition-oriented."
        )

    finally:
        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        db.close()


def test_completed_review_requires_assigned_reviewer():
    db = SessionLocal()
    fixture = None
    other_reviewer = None

    try:
        fixture = create_fixture(db)

        other_reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        token = token_for(
            other_reviewer
        )

        response = client.get(
            "/assessment-reviews/sets/completed/"
            f"{fixture['approved_set'].id}",
            headers={
                "Authorization": f"Bearer {token}"
            },
        )

        assert response.status_code == 403

        detail = response.json()[
            "detail"
        ]

        assert (
            detail
            == "You are not the assigned reviewer for this assessment set."
        )

    finally:
        if fixture is not None:
            cleanup(
                db,
                fixture,
            )

        if other_reviewer is not None:
            db.delete(
                other_reviewer
            )
            db.commit()

        db.close()