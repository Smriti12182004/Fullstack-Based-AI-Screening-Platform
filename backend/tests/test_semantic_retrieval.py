"""
Semantic retrieval tests for Evalyn.

Coverage:
- Only approved questions are returned.
- Skill filtering is enforced.
- Question-type and difficulty filters are enforced.
- Semantic similarity returns relevant content.
"""

from uuid import uuid4

import pytest

from app.db.session import SessionLocal
from app.models import Question, Skill
from app.services.semantic_retrieval_service import (
    SemanticRetrievalService,
    SemanticRetrievalError,
)


@pytest.fixture
def db():
    """Provide an isolated database session and roll back test data."""
    session = SessionLocal()

    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(scope="module")
def retrieval_service():
    """
    Load the embedding model once for the test module.

    Loading the Sentence Transformer for every test would be unnecessarily
    expensive and would not test a different code path.
    """
    return SemanticRetrievalService(
        model_name="all-MiniLM-L6-v2"
    )


@pytest.fixture
def test_skill(db):
    """Create an isolated skill for retrieval tests."""
    skill = Skill(
        name=f"semantic-retrieval-{uuid4().hex[:8]}"
    )

    db.add(skill)
    db.flush()

    return skill


def create_question(
    db,
    *,
    skill_id: int,
    question_text: str,
    question_type: str = "MCQ",
    difficulty: str = "medium",
    status: str = "approved",
) -> Question:
    """Create an isolated question without using the question service."""
    question = Question(
        question_text=question_text,
        question_type=question_type,
        skill_id=skill_id,
        difficulty=difficulty,
        options=(
            [
                "Option A",
                "Option B",
                "Option C",
                "Option D",
            ]
            if question_type == "MCQ"
            else None
        ),
        correct_answer="Option A" if question_type == "MCQ" else None,
        status=status,
    )

    db.add(question)
    db.flush()

    return question


def build_test_index(
    db,
    retrieval_service,
    questions,
) -> int:
    """Build the FAISS index from the provided test questions."""
    return retrieval_service.build_index(questions)


def test_only_approved_questions_are_retrieved(
    db,
    retrieval_service,
    test_skill,
):
    """Pending-review questions must never be returned by retrieval."""

    approved_question = create_question(
        db,
        skill_id=test_skill.id,
        question_text=(
            "Which Python data structure cannot be changed "
            "after it is created?"
        ),
        status="approved",
    )

    pending_question = create_question(
        db,
        skill_id=test_skill.id,
        question_text=(
            "Which Python collection stores unique values?"
        ),
        status="pending_review",
    )

    db.flush()

    questions = [
        approved_question,
        pending_question,
    ]

    indexed = build_test_index(
        db,
        retrieval_service,
        questions,
    )

    assert indexed == 1
    assert retrieval_service.indexed_count() == 1

    results = retrieval_service.search(
        db,
        query_text="Python immutable data structure",
        top_k=5,
        skill_id=test_skill.id,
    )

    result_ids = {
        result.question.id
        for result in results
    }

    assert approved_question.id in result_ids
    assert pending_question.id not in result_ids

    assert all(
        result.question.status == "approved"
        for result in results
    )


def test_skill_filter_is_enforced(
    db,
    retrieval_service,
):
    """Semantic similarity must not override the requested skill."""

    python_skill = Skill(
        name=f"python-{uuid4().hex[:8]}"
    )

    java_skill = Skill(
        name=f"java-{uuid4().hex[:8]}"
    )

    db.add_all(
        [
            python_skill,
            java_skill,
        ]
    )
    db.flush()

    python_question = create_question(
        db,
        skill_id=python_skill.id,
        question_text=(
            "What does polymorphism mean in Python "
            "object-oriented programming?"
        ),
    )

    java_question = create_question(
        db,
        skill_id=java_skill.id,
        question_text=(
            "What does polymorphism mean in Java "
            "object-oriented programming?"
        ),
    )

    db.flush()

    build_test_index(
        db,
        retrieval_service,
        [
            python_question,
            java_question,
        ],
    )

    results = retrieval_service.search(
        db,
        query_text="Explain polymorphism in object-oriented programming",
        top_k=5,
        skill_id=python_skill.id,
    )

    assert results
    assert all(
        result.question.skill_id == python_skill.id
        for result in results
    )

    result_ids = {
        result.question.id
        for result in results
    }

    assert python_question.id in result_ids
    assert java_question.id not in result_ids


def test_question_type_and_difficulty_filters_are_enforced(
    db,
    retrieval_service,
    test_skill,
):
    """All requested metadata filters must be respected."""

    matching_question = create_question(
        db,
        skill_id=test_skill.id,
        question_text=(
            "Which Python collection is immutable?"
        ),
        question_type="MCQ",
        difficulty="medium",
    )

    free_text_question = create_question(
        db,
        skill_id=test_skill.id,
        question_text=(
            "Explain why tuples are immutable in Python."
        ),
        question_type="FREE_TEXT",
        difficulty="medium",
    )

    easy_question = create_question(
        db,
        skill_id=test_skill.id,
        question_text=(
            "What symbol starts a Python comment?"
        ),
        question_type="MCQ",
        difficulty="easy",
    )

    db.flush()

    build_test_index(
        db,
        retrieval_service,
        [
            matching_question,
            free_text_question,
            easy_question,
        ],
    )

    results = retrieval_service.search(
        db,
        query_text="Python immutable collection",
        top_k=5,
        skill_id=test_skill.id,
        question_type="MCQ",
        difficulty="medium",
    )

    assert results
    assert len(results) == 1
    assert results[0].question.id == matching_question.id
    assert results[0].question.question_type == "MCQ"
    assert results[0].question.difficulty == "medium"


def test_semantic_similarity_returns_relevant_question(
    db,
    retrieval_service,
    test_skill,
):
    """A semantically related question should rank in the retrieval results."""

    relevant_question = create_question(
        db,
        skill_id=test_skill.id,
        question_text=(
            "Which Python data type is immutable and commonly "
            "used for fixed collections of values?"
        ),
    )

    unrelated_question = create_question(
        db,
        skill_id=test_skill.id,
        question_text=(
            "What is the purpose of an HTTP status code "
            "in a REST API response?"
        ),
    )

    db.flush()

    build_test_index(
        db,
        retrieval_service,
        [
            relevant_question,
            unrelated_question,
        ],
    )

    results = retrieval_service.search(
        db,
        query_text=(
            "Which Python collection cannot be modified "
            "after creation?"
        ),
        top_k=2,
        skill_id=test_skill.id,
    )

    assert results

    result_ids = [
        result.question.id
        for result in results
    ]

    assert relevant_question.id in result_ids

    relevant_position = result_ids.index(
        relevant_question.id
    )

    if unrelated_question.id in result_ids:
        unrelated_position = result_ids.index(
            unrelated_question.id
        )

        assert relevant_position < unrelated_position


def test_invalid_search_inputs_are_rejected(
    db,
    retrieval_service,
):
    """Invalid semantic-search parameters should fail clearly."""

    with pytest.raises(SemanticRetrievalError):
        retrieval_service.search(
            db,
            query_text="",
        )

    with pytest.raises(SemanticRetrievalError):
        retrieval_service.search(
            db,
            query_text="Python questions",
            top_k=0,
        )

    with pytest.raises(SemanticRetrievalError):
        retrieval_service.search(
            db,
            query_text="Python questions",
            difficulty="invalid",
        )

    with pytest.raises(SemanticRetrievalError):
        retrieval_service.search(
            db,
            query_text="Python questions",
            question_type="INVALID",
        )