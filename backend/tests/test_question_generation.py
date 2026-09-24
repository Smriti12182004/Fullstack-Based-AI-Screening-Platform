"""Sprint 3 AI question-generation tests."""

from unittest.mock import patch
from uuid import uuid4

import pytest

from app.db.session import SessionLocal
from app.models import Job, Question, Skill, User
from app.services.llm_service import GeneratedQuestion
from app.services.question_service import (
    QuestionServiceError,
    generate_questions,
)


@pytest.fixture
def generation_context():
    """
    Create an isolated job and two skills for AI-generation tests.

    The skill-confirmation dependency is mocked in the individual tests,
    so these tests focus on the question-generation service itself.
    """
    db = SessionLocal()

    job = None
    skills = []

    try:
        user = db.query(User).first()

        assert user is not None, (
            "At least one user must exist before running "
            "question-generation tests."
        )

        job = Job(
            title=f"S3 AI Generation Test Job {uuid4().hex[:8]}",
            description=(
                "Test job for Sprint 3 AI question generation."
            ),
            experience_required=2,
            created_by=user.id,
        )

        skill_one = Skill(
            name=f"S3 Python {uuid4().hex[:8]}",
        )

        skill_two = Skill(
            name=f"S3 SQL {uuid4().hex[:8]}",
        )

        db.add(job)
        db.add(skill_one)
        db.add(skill_two)

        db.commit()

        db.refresh(job)
        db.refresh(skill_one)
        db.refresh(skill_two)

        skills = [skill_one, skill_two]

        yield db, job, skills, user.id

    finally:
        if job is not None:
            db.query(Question).filter(
                Question.created_by == user.id,
                Question.question_text.like(
                    "S3 %"
                ),
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        for skill in skills:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def make_generated_question(
    skill_name: str,
    question_text: str,
    difficulty: str = "medium",
) -> GeneratedQuestion:
    """Return a valid deterministic generated MCQ."""
    return GeneratedQuestion(
        question_text=question_text,
        skill_name=skill_name,
        difficulty=difficulty,
        options=[
            "Option A",
            "Option B",
            "Option C",
            "Option D",
        ],
        correct_answer="Option B",
        explanation="Deterministic test explanation.",
    )


def test_generate_questions_creates_pending_ai_questions(
    generation_context,
):
    """AI-generated questions are persisted as pending_review."""
    db, job, skills, user_id = generation_context

    generated_questions = [
        make_generated_question(
            skill_name=skills[0].name,
            question_text=(
                f"S3 Python question {uuid4().hex[:8]}"
            ),
            difficulty="medium",
        ),
        make_generated_question(
            skill_name=skills[0].name,
            question_text=(
                f"S3 Python second question {uuid4().hex[:8]}"
            ),
            difficulty="medium",
        ),
    ]

    with patch(
        "app.services.question_service.are_job_skills_confirmed",
        return_value=True,
    ), patch(
        "app.services.question_service.get_job_skills",
        return_value=skills,
    ), patch(
        "app.services.question_service.generate_questions_from_skills",
        return_value=generated_questions,
    ) as mock_generator:

        questions = generate_questions(
            db=db,
            job_id=job.id,
            skill_ids=[skills[0].id],
            number_of_questions=2,
            difficulty="medium",
            created_by=user_id,
        )

    assert mock_generator.called is True

    assert len(questions) == 2

    for question in questions:
        assert question.question_type == "MCQ"
        assert question.skill_id == skills[0].id
        assert question.difficulty == "medium"
        assert question.status == "pending_review"
        assert question.source == "ai_generated"
        assert question.created_by == user_id
        assert question.reviewed_by is None
        assert question.reviewed_at is None
        assert question.rejection_reason is None
        assert len(question.options) == 4
        assert question.correct_answer in question.options
        assert question.explanation == (
            "Deterministic test explanation."
        )


def test_generate_questions_uses_only_selected_confirmed_skills(
    generation_context,
):
    """
    Selected skills must be part of the confirmed job skills.
    """
    db, job, skills, user_id = generation_context

    generated_question = make_generated_question(
        skill_name=skills[0].name,
        question_text=(
            f"S3 selected skill question {uuid4().hex[:8]}"
        ),
        difficulty="easy",
    )

    with patch(
        "app.services.question_service.are_job_skills_confirmed",
        return_value=True,
    ), patch(
        "app.services.question_service.get_job_skills",
        return_value=skills,
    ), patch(
        "app.services.question_service.generate_questions_from_skills",
        return_value=[generated_question],
    ) as mock_generator:

        questions = generate_questions(
            db=db,
            job_id=job.id,
            skill_ids=[skills[0].id],
            number_of_questions=1,
            difficulty="easy",
            created_by=user_id,
        )

    assert len(questions) == 1

    call_kwargs = mock_generator.call_args.kwargs

    assert call_kwargs["number_of_questions"] == 1
    assert call_kwargs["difficulty"] == "easy"

    passed_skills = call_kwargs["skills"]

    assert len(passed_skills) == 1
    assert passed_skills[0]["skill_id"] == skills[0].id
    assert passed_skills[0]["skill_name"] == skills[0].name
    assert passed_skills[0]["category"] == "Other"


def test_generate_questions_rejects_unconfirmed_selected_skill(
    generation_context,
):
    """
    A skill outside the confirmed skill set cannot be used for generation.
    """
    db, job, skills, user_id = generation_context

    unconfirmed_skill = Skill(
        name=f"S3 Unconfirmed {uuid4().hex[:8]}"
    )

    db.add(unconfirmed_skill)
    db.commit()
    db.refresh(unconfirmed_skill)

    try:
        with patch(
            "app.services.question_service.are_job_skills_confirmed",
            return_value=True,
        ), patch(
            "app.services.question_service.get_job_skills",
            return_value=skills,
        ), patch(
            "app.services.question_service.generate_questions_from_skills",
        ) as mock_generator:

            with pytest.raises(
                QuestionServiceError,
                match=(
                    "Selected skill is not part of the "
                    "confirmed skills for this job."
                ),
            ):
                generate_questions(
                    db=db,
                    job_id=job.id,
                    skill_ids=[unconfirmed_skill.id],
                    number_of_questions=1,
                    difficulty="medium",
                    created_by=user_id,
                )

        mock_generator.assert_not_called()

    finally:
        db.query(Skill).filter(
            Skill.id == unconfirmed_skill.id
        ).delete(
            synchronize_session=False
        )

        db.commit()


def test_generate_questions_requires_confirmed_job_skills(
    generation_context,
):
    """Generation is blocked until job skills are confirmed."""
    db, job, skills, user_id = generation_context

    with patch(
        "app.services.question_service.are_job_skills_confirmed",
        return_value=False,
    ), patch(
        "app.services.question_service.generate_questions_from_skills",
    ) as mock_generator:

        with pytest.raises(
            QuestionServiceError,
            match=(
                "Questions can only be generated after "
                "the job skills are confirmed."
            ),
        ):
            generate_questions(
                db=db,
                job_id=job.id,
                skill_ids=[skills[0].id],
                number_of_questions=1,
                difficulty="medium",
                created_by=user_id,
            )

    mock_generator.assert_not_called()


def test_generate_questions_rejects_invalid_question_count(
    generation_context,
):
    """Generation rejects counts outside the allowed range."""
    db, job, skills, user_id = generation_context

    with patch(
        "app.services.question_service.are_job_skills_confirmed",
        return_value=True,
    ), patch(
        "app.services.question_service.get_job_skills",
        return_value=skills,
    ), patch(
        "app.services.question_service.generate_questions_from_skills",
    ) as mock_generator:

        with pytest.raises(
            QuestionServiceError,
            match="Number of questions must be between 1 and 20.",
        ):
            generate_questions(
                db=db,
                job_id=job.id,
                skill_ids=[skills[0].id],
                number_of_questions=21,
                difficulty="medium",
                created_by=user_id,
            )

    mock_generator.assert_not_called()


def test_generate_questions_rejects_invalid_difficulty(
    generation_context,
):
    """Generation rejects unsupported difficulty values."""
    db, job, skills, user_id = generation_context

    with patch(
        "app.services.question_service.are_job_skills_confirmed",
        return_value=True,
    ), patch(
        "app.services.question_service.get_job_skills",
        return_value=skills,
    ), patch(
        "app.services.question_service.generate_questions_from_skills",
    ) as mock_generator:

        with pytest.raises(
            QuestionServiceError,
            match=(
                "Difficulty must be easy, medium, or hard."
            ),
        ):
            generate_questions(
                db=db,
                job_id=job.id,
                skill_ids=[skills[0].id],
                number_of_questions=1,
                difficulty="expert",
                created_by=user_id,
            )

    mock_generator.assert_not_called()


def test_generate_questions_rejects_duplicate_existing_question(
    generation_context,
):
    """Generated text cannot duplicate an existing bank question."""
    db, job, skills, user_id = generation_context

    duplicate_text = (
        f"S3 duplicate question {uuid4().hex[:8]}"
    )

    existing_question = Question(
        question_text=duplicate_text,
        question_type="MCQ",
        skill_id=skills[0].id,
        difficulty="medium",
        options=[
            "Option A",
            "Option B",
        ],
        correct_answer="Option B",
        status="approved",
        source="manual",
        explanation=None,
        created_by=user_id,
        reviewed_by=None,
        reviewed_at=None,
        rejection_reason=None,
    )

    db.add(existing_question)
    db.commit()

    generated_question = make_generated_question(
        skill_name=skills[0].name,
        question_text=duplicate_text,
        difficulty="medium",
    )

    try:
        with patch(
            "app.services.question_service.are_job_skills_confirmed",
            return_value=True,
        ), patch(
            "app.services.question_service.get_job_skills",
            return_value=skills,
        ), patch(
            "app.services.question_service.generate_questions_from_skills",
            return_value=[generated_question],
        ):

            with pytest.raises(
                QuestionServiceError,
                match=(
                    "Generated question duplicates an existing "
                    "question in the question bank."
                ),
            ):
                generate_questions(
                    db=db,
                    job_id=job.id,
                    skill_ids=[skills[0].id],
                    number_of_questions=1,
                    difficulty="medium",
                    created_by=user_id,
                )

        persisted_duplicate = db.query(
            Question
        ).filter(
            Question.question_text == duplicate_text,
            Question.id != existing_question.id,
        ).first()

        assert persisted_duplicate is None

    finally:
        db.query(Question).filter(
            Question.id == existing_question.id
        ).delete(
            synchronize_session=False
        )

        db.commit()