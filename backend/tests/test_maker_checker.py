"""S4-01 automated maker-checker workflow tests."""

from uuid import uuid4

import pytest

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Question, Skill, User
from app.services.question_service import (
    QuestionServiceError,
    approve_question,
    create_question,
    reject_question,
)


TEST_PASSWORD = "Test@12345"


def create_test_user(db, role: str) -> User:
    """Create an isolated test user."""
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"s4_{role}_{unique_id}",
        email=f"s4_{role}_{unique_id}@test.com",
        password_hash=hash_password(TEST_PASSWORD),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def create_test_skill(db) -> Skill:
    """Create an isolated test skill."""
    skill = Skill(
        name=f"s4-maker-checker-skill-{uuid4().hex[:10]}",
    )

    db.add(skill)
    db.flush()

    return skill


def create_test_question(
    db,
    *,
    creator_id: int,
    skill_id: int,
) -> Question:
    """Create a pending-review question through the service."""
    return create_question(
        db=db,
        question_text=(
            f"S4-01 maker-checker question "
            f"{uuid4().hex[:10]}: "
            "Which Python collection stores unique values?"
        ),
        question_type="MCQ",
        skill_id=skill_id,
        difficulty="easy",
        options=[
            "List",
            "Tuple",
            "Set",
            "Dictionary",
        ],
        correct_answer="Set",
        created_by=creator_id,
    )


def test_manager_created_question_starts_pending_review():
    """A newly created question must enter the review workflow."""

    db = SessionLocal()

    manager = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        assert question.id is not None
        assert question.status == "pending_review"
        assert question.created_by == manager.id
        assert question.reviewed_by is None
        assert question.reviewed_at is None
        assert question.rejection_reason is None

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_question_creator_cannot_approve_own_question():
    """The question creator must not be able to approve their own question."""

    db = SessionLocal()

    manager = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        with pytest.raises(
            QuestionServiceError,
            match="cannot approve their own question",
        ):
            approve_question(
                db=db,
                question_id=question.id,
                reviewer_id=manager.id,
            )

        db.refresh(question)

        assert question.status == "pending_review"
        assert question.reviewed_by is None
        assert question.reviewed_at is None

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_reviewer_can_approve_question_and_audit_fields_are_recorded():
    """A different reviewer can approve a pending question."""

    db = SessionLocal()

    manager = None
    reviewer = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        approved_question = approve_question(
            db=db,
            question_id=question.id,
            reviewer_id=reviewer.id,
        )

        assert approved_question.status == "approved"
        assert approved_question.created_by == manager.id
        assert approved_question.reviewed_by == reviewer.id
        assert approved_question.reviewed_at is not None
        assert approved_question.rejection_reason is None

        db.refresh(question)

        assert question.status == "approved"
        assert question.reviewed_by == reviewer.id
        assert question.reviewed_at is not None
        assert question.created_by != question.reviewed_by

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if reviewer is not None and reviewer.id is not None:
            db.query(User).filter(
                User.id == reviewer.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_question_creator_cannot_reject_own_question():
    """The question creator must not be able to reject their own question."""

    db = SessionLocal()

    manager = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        with pytest.raises(
            QuestionServiceError,
            match="cannot reject their own question",
        ):
            reject_question(
                db=db,
                question_id=question.id,
                reviewer_id=manager.id,
                rejection_reason=(
                    "Manager must not reject own question."
                ),
            )

        db.refresh(question)

        assert question.status == "pending_review"
        assert question.reviewed_by is None
        assert question.reviewed_at is None
        assert question.rejection_reason is None

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_reviewer_can_reject_question_and_reason_is_recorded():
    """A reviewer can reject a pending question with a reason."""

    db = SessionLocal()

    manager = None
    reviewer = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        rejection_reason = (
            "The question is too basic for the configured "
            "assessment difficulty."
        )

        rejected_question = reject_question(
            db=db,
            question_id=question.id,
            reviewer_id=reviewer.id,
            rejection_reason=rejection_reason,
        )

        assert rejected_question.status == "rejected"
        assert rejected_question.created_by == manager.id
        assert rejected_question.reviewed_by == reviewer.id
        assert rejected_question.reviewed_at is not None
        assert rejected_question.rejection_reason == rejection_reason

        db.refresh(question)

        assert question.status == "rejected"
        assert question.reviewed_by == reviewer.id
        assert question.reviewed_at is not None
        assert question.rejection_reason == rejection_reason

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if reviewer is not None and reviewer.id is not None:
            db.query(User).filter(
                User.id == reviewer.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_rejection_requires_a_non_empty_reason():
    """A rejection without a meaningful reason must fail."""

    db = SessionLocal()

    manager = None
    reviewer = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        with pytest.raises(
            QuestionServiceError,
            match="Rejection reason is required",
        ):
            reject_question(
                db=db,
                question_id=question.id,
                reviewer_id=reviewer.id,
                rejection_reason="   ",
            )

        db.refresh(question)

        assert question.status == "pending_review"
        assert question.reviewed_by is None
        assert question.reviewed_at is None
        assert question.rejection_reason is None

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if reviewer is not None and reviewer.id is not None:
            db.query(User).filter(
                User.id == reviewer.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_approved_question_cannot_be_approved_again():
    """Approval is only valid from the pending_review state."""

    db = SessionLocal()

    manager = None
    reviewer = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        approve_question(
            db=db,
            question_id=question.id,
            reviewer_id=reviewer.id,
        )

        with pytest.raises(
            QuestionServiceError,
            match="Only questions pending review can be approved",
        ):
            approve_question(
                db=db,
                question_id=question.id,
                reviewer_id=reviewer.id,
            )

        db.refresh(question)

        assert question.status == "approved"
        assert question.reviewed_by == reviewer.id
        assert question.reviewed_at is not None

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if reviewer is not None and reviewer.id is not None:
            db.query(User).filter(
                User.id == reviewer.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_rejected_question_cannot_be_rejected_again():
    """Rejection is only valid from the pending_review state."""

    db = SessionLocal()

    manager = None
    reviewer = None
    skill = None
    question = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )

        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        skill = create_test_skill(db)

        question = create_test_question(
            db,
            creator_id=manager.id,
            skill_id=skill.id,
        )

        rejection_reason = "Question requires revision."

        reject_question(
            db=db,
            question_id=question.id,
            reviewer_id=reviewer.id,
            rejection_reason=rejection_reason,
        )

        with pytest.raises(
            QuestionServiceError,
            match="Only questions pending review can be rejected",
        ):
            reject_question(
                db=db,
                question_id=question.id,
                reviewer_id=reviewer.id,
                rejection_reason="Second rejection attempt.",
            )

        db.refresh(question)

        assert question.status == "rejected"
        assert question.reviewed_by == reviewer.id
        assert question.reviewed_at is not None
        assert question.rejection_reason == rejection_reason

    finally:
        if question is not None and question.id is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None and skill.id is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        if reviewer is not None and reviewer.id is not None:
            db.query(User).filter(
                User.id == reviewer.id
            ).delete(
                synchronize_session=False
            )

        if manager is not None and manager.id is not None:
            db.query(User).filter(
                User.id == manager.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()