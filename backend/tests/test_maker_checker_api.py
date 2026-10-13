"""S4-01 maker-checker API authorization and workflow tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.main import app
from app.models import Question, Skill, User
from app.services.question_service import create_question


client = TestClient(app)


def create_test_user(db, role: str) -> User:
    """Create an isolated user for API authorization tests."""
    unique_id = uuid4().hex[:10]

    user = User(
        username=f"s4_api_{role}_{unique_id}",
        email=f"s4_api_{role}_{unique_id}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def create_test_skill(db) -> Skill:
    """Create an isolated skill."""
    skill = Skill(
        name=f"s4-api-maker-checker-skill-{uuid4().hex[:10]}",
    )

    db.add(skill)
    db.flush()

    return skill


def create_access_token_for_user(user: User) -> str:
    """Create an access token using the application's JWT helper."""
    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


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
            f"S4-01 API maker-checker question "
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


def delete_question(db, question_id: int) -> None:
    """Delete a test question and its related version records."""
    question = db.get(Question, question_id)

    if question is None:
        return

    db.query(Question).filter(
        Question.id == question_id
    ).delete(
        synchronize_session=False
    )


def delete_user(db, user_id: int) -> None:
    """Delete a test user."""
    if user_id is None:
        return

    db.query(User).filter(
        User.id == user_id
    ).delete(
        synchronize_session=False
    )


def delete_skill(db, skill_id: int) -> None:
    """Delete a test skill."""
    if skill_id is None:
        return

    db.query(Skill).filter(
        Skill.id == skill_id
    ).delete(
        synchronize_session=False
    )


def test_reviewer_can_view_question_bank():
    """Assessment reviewers can access the question bank."""

    db = SessionLocal()

    reviewer = None

    try:
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        db.commit()

        token = create_access_token_for_user(reviewer)

        response = client.get(
            "/questions",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    finally:
        if reviewer is not None:
            delete_user(db, reviewer.id)

        db.commit()
        db.close()


def test_reviewer_cannot_create_question():
    """Assessment reviewers cannot create questions."""

    db = SessionLocal()

    reviewer = None
    skill = None

    try:
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        skill = create_test_skill(db)

        db.commit()

        token = create_access_token_for_user(reviewer)

        response = client.post(
            "/questions",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_text": (
                    f"Reviewer create authorization test "
                    f"{uuid4().hex[:10]}"
                ),
                "question_type": "MCQ",
                "skill_id": skill.id,
                "difficulty": "medium",
                "options": [
                    "A",
                    "B",
                    "C",
                    "D",
                ],
                "correct_answer": "A",
            },
        )

        assert response.status_code == 403

    finally:
        if skill is not None:
            delete_skill(db, skill.id)

        if reviewer is not None:
            delete_user(db, reviewer.id)

        db.commit()
        db.close()


def test_reviewer_cannot_update_question():
    """Assessment reviewers cannot edit questions."""

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

        db.commit()

        token = create_access_token_for_user(reviewer)

        response = client.put(
            f"/questions/{question.id}",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_text": (
                    f"Reviewer update authorization test "
                    f"{uuid4().hex[:10]}"
                ),
                "question_type": "MCQ",
                "skill_id": skill.id,
                "difficulty": "medium",
                "options": [
                    "A",
                    "B",
                    "C",
                    "D",
                ],
                "correct_answer": "A",
            },
        )

        assert response.status_code == 403

        db.refresh(question)

        assert question.status == "pending_review"

    finally:
        if question is not None:
            delete_question(db, question.id)

        if skill is not None:
            delete_skill(db, skill.id)

        if reviewer is not None:
            delete_user(db, reviewer.id)

        if manager is not None:
            delete_user(db, manager.id)

        db.commit()
        db.close()


def test_manager_cannot_approve_question():
    """Assessment managers cannot perform reviewer approval."""

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

        db.commit()

        token = create_access_token_for_user(manager)

        response = client.post(
            f"/questions/{question.id}/approve",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 403

        db.refresh(question)

        assert question.status == "pending_review"
        assert question.reviewed_by is None
        assert question.reviewed_at is None

    finally:
        if question is not None:
            delete_question(db, question.id)

        if skill is not None:
            delete_skill(db, skill.id)

        if manager is not None:
            delete_user(db, manager.id)

        db.commit()
        db.close()


def test_manager_cannot_reject_question():
    """Assessment managers cannot perform reviewer rejection."""

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

        db.commit()

        token = create_access_token_for_user(manager)

        response = client.post(
            f"/questions/{question.id}/reject",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "rejection_reason": (
                    "Manager must not reject questions."
                ),
            },
        )

        assert response.status_code == 403

        db.refresh(question)

        assert question.status == "pending_review"
        assert question.reviewed_by is None
        assert question.reviewed_at is None
        assert question.rejection_reason is None

    finally:
        if question is not None:
            delete_question(db, question.id)

        if skill is not None:
            delete_skill(db, skill.id)

        if manager is not None:
            delete_user(db, manager.id)

        db.commit()
        db.close()


def test_reviewer_can_approve_question_through_api():
    """A reviewer can approve a pending question through the API."""

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

        db.commit()

        token = create_access_token_for_user(reviewer)

        response = client.post(
            f"/questions/{question.id}/approve",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["id"] == question.id
        assert data["status"] == "approved"
        assert data["created_by"] == manager.id
        assert data["reviewed_by"] == reviewer.id
        assert data["reviewed_at"] is not None
        assert data["rejection_reason"] is None

        db.refresh(question)

        assert question.status == "approved"
        assert question.reviewed_by == reviewer.id
        assert question.reviewed_at is not None

    finally:
        if question is not None:
            delete_question(db, question.id)

        if skill is not None:
            delete_skill(db, skill.id)

        if reviewer is not None:
            delete_user(db, reviewer.id)

        if manager is not None:
            delete_user(db, manager.id)

        db.commit()
        db.close()


def test_reviewer_can_reject_question_through_api():
    """A reviewer can reject a pending question through the API."""

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

        db.commit()

        rejection_reason = (
            "The question requires revision before approval."
        )

        token = create_access_token_for_user(reviewer)

        response = client.post(
            f"/questions/{question.id}/reject",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "rejection_reason": rejection_reason,
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert data["id"] == question.id
        assert data["status"] == "rejected"
        assert data["created_by"] == manager.id
        assert data["reviewed_by"] == reviewer.id
        assert data["reviewed_at"] is not None
        assert data["rejection_reason"] == rejection_reason

        db.refresh(question)

        assert question.status == "rejected"
        assert question.reviewed_by == reviewer.id
        assert question.reviewed_at is not None
        assert question.rejection_reason == rejection_reason

    finally:
        if question is not None:
            delete_question(db, question.id)

        if skill is not None:
            delete_skill(db, skill.id)

        if reviewer is not None:
            delete_user(db, reviewer.id)

        if manager is not None:
            delete_user(db, manager.id)

        db.commit()
        db.close()