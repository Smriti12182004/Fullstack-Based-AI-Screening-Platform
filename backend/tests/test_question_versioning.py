"""S4-02 question version history tests."""

from uuid import uuid4

from app.db.session import SessionLocal
from app.models import Question, QuestionVersion, Skill
from app.services.question_service import update_question


def test_question_version_history_is_created_on_edit():
    """Editing a question creates a new retained content version."""

    db = SessionLocal()

    skill = None
    question = None

    try:
        skill = Skill(
            name=f"s4-version-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.flush()

        question = Question(
            question_text="Version one question",
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
            status="approved",
            source="manual",
            explanation="Version one explanation",
            version=1,
        )

        db.add(question)
        db.flush()

        version_one = QuestionVersion(
            question_id=question.id,
            version=1,
            question_text=question.question_text,
            question_type=question.question_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            source=question.source,
            changed_by=None,
        )

        db.add(version_one)
        db.commit()
        db.refresh(question)

        updated_question = update_question(
            db=db,
            question_id=question.id,
            question_text="Version two question",
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
            updated_by=None,
        )

        assert updated_question.id == question.id
        assert updated_question.version == 2
        assert updated_question.status == "pending_review"
        assert updated_question.question_text == (
            "Version two question"
        )
        assert updated_question.difficulty == "hard"
        assert updated_question.correct_answer == "B2"

        versions = (
            db.query(QuestionVersion)
            .filter(
                QuestionVersion.question_id
                == question.id
            )
            .order_by(
                QuestionVersion.version
            )
            .all()
        )

        assert len(versions) == 2

        assert versions[0].version == 1
        assert versions[0].question_text == (
            "Version one question"
        )
        assert versions[0].difficulty == "easy"
        assert versions[0].options == [
            "A",
            "B",
            "C",
            "D",
        ]
        assert versions[0].correct_answer == "A"

        assert versions[1].version == 2
        assert versions[1].question_text == (
            "Version two question"
        )
        assert versions[1].difficulty == "hard"
        assert versions[1].options == [
            "A2",
            "B2",
            "C2",
            "D2",
        ]
        assert versions[1].correct_answer == "B2"

    finally:
        if question is not None:
            db.query(QuestionVersion).filter(
                QuestionVersion.question_id
                == question.id
            ).delete(
                synchronize_session=False
            )

            db.query(Question).filter(
                Question.id == question.id
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