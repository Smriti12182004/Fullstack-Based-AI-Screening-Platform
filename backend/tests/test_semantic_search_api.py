"""
Semantic search API tests.

Coverage:
- Authentication and RBAC
- Approved-question retrieval
- Semantic similarity score presence
- Metadata filtering
- top_k behavior
- Invalid filter validation
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import app
from app.models import Question, Skill, User


client = TestClient(app)


@pytest.fixture
def assessment_manager_token():
    """Create a JWT for the existing Assessment Manager test user."""
    db = SessionLocal()

    try:
        manager = (
            db.query(User)
            .filter(User.role == "assessment_manager")
            .first()
        )

        assert manager is not None, (
            "This test requires an assessment_manager user."
        )

        return create_access_token(
            {
                "sub": str(manager.id),
                "role": manager.role,
            }
        )

    finally:
        db.close()


@pytest.fixture
def candidate_token():
    """Create a JWT for an existing candidate user."""
    db = SessionLocal()

    try:
        candidate = (
            db.query(User)
            .filter(User.role == "candidate")
            .first()
        )

        assert candidate is not None, (
            "This test requires at least one candidate user."
        )

        return create_access_token(
            {
                "sub": str(candidate.id),
                "role": candidate.role,
            }
        )

    finally:
        db.close()


@pytest.fixture
def semantic_test_data():
    """
    Create isolated approved/unapproved questions for semantic search tests.
    """
    db = SessionLocal()

    skill = None
    approved_question_1 = None
    approved_question_2 = None
    unapproved_question = None

    try:
        skill = Skill(
            name=f"s3-semantic-api-skill-{uuid4().hex[:8]}"
        )

        db.add(skill)
        db.flush()

        approved_question_1 = Question(
            question_text=(
                "Which Python collection stores only unique values?"
            ),
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=[
                "List",
                "Tuple",
                "Set",
                "Dictionary",
            ],
            correct_answer="Set",
            status="approved",
            source="manual",
        )

        approved_question_2 = Question(
            question_text=(
                "Which Python data type is immutable?"
            ),
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=[
                "List",
                "Dictionary",
                "Tuple",
                "Set",
            ],
            correct_answer="Tuple",
            status="approved",
            source="manual",
        )

        unapproved_question = Question(
            question_text=(
                "Which Python collection should not be returned "
                "because it is still pending review?"
            ),
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=[
                "List",
                "Tuple",
                "Set",
                "Dictionary",
            ],
            correct_answer="Set",
            status="pending_review",
            source="manual",
        )

        db.add_all(
            [
                approved_question_1,
                approved_question_2,
                unapproved_question,
            ]
        )

        db.commit()

        db.refresh(approved_question_1)
        db.refresh(approved_question_2)
        db.refresh(unapproved_question)

        yield {
            "skill": skill,
            "approved_1": approved_question_1,
            "approved_2": approved_question_2,
            "unapproved": unapproved_question,
        }

    finally:
        question_ids = [
            question.id
            for question in (
                approved_question_1,
                approved_question_2,
                unapproved_question,
            )
            if question is not None
        ]

        if question_ids:
            db.query(Question).filter(
                Question.id.in_(question_ids)
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


def test_semantic_search_requires_authentication():
    """Semantic search rejects unauthenticated requests."""
    response = client.get(
        "/questions/semantic-search",
        params={
            "query": "Python unique collection",
        },
    )

    assert response.status_code == 401


def test_candidate_cannot_use_semantic_search(
    candidate_token,
):
    """Candidates cannot access the semantic retrieval workspace."""
    response = client.get(
        "/questions/semantic-search",
        headers={
            "Authorization": f"Bearer {candidate_token}",
        },
        params={
            "query": "Python unique collection",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Insufficient permissions"


def test_semantic_search_returns_only_approved_questions(
    assessment_manager_token,
    semantic_test_data,
):
    """Semantic search excludes questions that are not approved."""
    response = client.get(
        "/questions/semantic-search",
        headers={
            "Authorization": f"Bearer {assessment_manager_token}",
        },
        params={
            "query": "Python unique collection values",
            "top_k": 10,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) >= 1

    returned_ids = {
        item["question"]["id"]
        for item in data
    }

    assert semantic_test_data["approved_1"].id in returned_ids
    assert semantic_test_data["unapproved"].id not in returned_ids

    for item in data:
        assert item["question"]["status"] == "approved"


def test_semantic_search_returns_similarity_scores(
    assessment_manager_token,
    semantic_test_data,
):
    """Each semantic result contains a numeric similarity score."""
    response = client.get(
        "/questions/semantic-search",
        headers={
            "Authorization": f"Bearer {assessment_manager_token}",
        },
        params={
            "query": "Python unique values",
            "top_k": 5,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) >= 1

    for item in data:
        assert "score" in item
        assert isinstance(item["score"], (int, float))


def test_semantic_search_applies_metadata_filters(
    assessment_manager_token,
    semantic_test_data,
):
    """Semantic search applies skill, type, and difficulty constraints."""
    response = client.get(
        "/questions/semantic-search",
        headers={
            "Authorization": f"Bearer {assessment_manager_token}",
        },
        params={
            "query": "Python unique values",
            "top_k": 10,
            "skill_id": semantic_test_data["skill"].id,
            "question_type": "MCQ",
            "difficulty": "easy",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) >= 1

    for item in data:
        question = item["question"]

        assert question["status"] == "approved"
        assert question["skill_id"] == semantic_test_data["skill"].id
        assert question["question_type"] == "MCQ"
        assert question["difficulty"] == "easy"


def test_semantic_search_respects_top_k(
    assessment_manager_token,
    semantic_test_data,
):
    """Semantic search does not return more than top_k results."""
    response = client.get(
        "/questions/semantic-search",
        headers={
            "Authorization": f"Bearer {assessment_manager_token}",
        },
        params={
            "query": "Python",
            "top_k": 1,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data) <= 1


@pytest.mark.parametrize(
    "params",
    [
        {
            "query": "Python",
            "question_type": "ESSAY",
        },
        {
            "query": "Python",
            "difficulty": "expert",
        },
    ],
)
def test_semantic_search_rejects_invalid_filters(
    assessment_manager_token,
    params,
):
    """Unsupported semantic-search filters are rejected."""
    response = client.get(
        "/questions/semantic-search",
        headers={
            "Authorization": f"Bearer {assessment_manager_token}",
        },
        params=params,
    )

    assert response.status_code == 422