"""S4-02 question version history API tests."""

import os
from uuid import uuid4

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models import Question, QuestionVersion, Skill, User
from app.services.question_service import (
    create_question,
    update_question,
)


client = TestClient(app)


ASSESSMENT_MANAGER_EMAIL = os.getenv(
    "TEST_ASSESSMENT_MANAGER_EMAIL",
    "s4_assessment_manager@test.com",
)

ASSESSMENT_REVIEWER_EMAIL = os.getenv(
    "TEST_ASSESSMENT_REVIEWER_EMAIL",
    "s4_assessment_reviewer@test.com",
)

TEST_PASSWORD = os.getenv(
    "TEST_ASSESSMENT_PASSWORD",
    "Test@12345",
)


def login(email: str) -> str:
    response = client.post(
        "/auth/login",
        json={
            "email": email,
            "password": TEST_PASSWORD,
        },
    )

    assert response.status_code == 200

    return response.json()["access_token"]


def test_reviewer_can_view_question_version_history():
    """Assessment Reviewer can retrieve all stored question versions."""

    db = SessionLocal()

    skill = None
    question = None

    try:
        manager = (
            db.query(User)
            .filter(
                User.email
                == ASSESSMENT_MANAGER_EMAIL
            )
            .first()
        )

        reviewer = (
            db.query(User)
            .filter(
                User.email
                == ASSESSMENT_REVIEWER_EMAIL
            )
            .first()
        )

        assert manager is not None
        assert reviewer is not None

        skill = Skill(
            name=f"s4-version-api-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.commit()
        db.refresh(skill)

        question = create_question(
            db=db,
            question_text="Version one API question",
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=[
                "A",
                "B",
                "C",
                "D",
            ],
            correct_answer="A",
            created_by=manager.id,
        )

        update_question(
            db=db,
            question_id=question.id,
            question_text="Version two API question",
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="hard",
            options=[
                "A2",
                "B2",
                "C2",
                "D2",
            ],
            correct_answer="B2",
            updated_by=manager.id,
        )

        token = login(
            ASSESSMENT_REVIEWER_EMAIL
        )

        response = client.get(
            f"/questions/{question.id}/versions",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert len(data) == 2

        assert data[0]["question_id"] == question.id
        assert data[0]["version"] == 1
        assert data[0]["question_text"] == (
            "Version one API question"
        )
        assert data[0]["difficulty"] == "easy"

        assert data[1]["question_id"] == question.id
        assert data[1]["version"] == 2
        assert data[1]["question_text"] == (
            "Version two API question"
        )
        assert data[1]["difficulty"] == "hard"

    finally:
        if question is not None:
            db.query(
                QuestionVersion
            ).filter(
                QuestionVersion.question_id
                == question.id
            ).delete(
                synchronize_session=False
            )

            db.query(
                Question
            ).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None:
            db.query(
                Skill
            ).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()