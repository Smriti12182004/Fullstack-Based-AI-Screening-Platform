"""Sprint 2 automated tests."""

import json
import os
from uuid import uuid4
from unittest.mock import patch

import pytest
import requests
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models import Job, JobSkill, Question, Skill, User
from app.services.llm_service import (
    ExtractedSkill,
    LLMConnectionError,
    LLMQuotaError,
    LLMResponseError,
    SkillExtractionResponse,
    extract_skills_from_jd,
    normalize_extracted_skills,
)
from app.services.question_service import (
    QuestionServiceError,
    create_question,
    get_questions,
    update_question,
)
from app.services.skill_service import extract_and_save_job_skills


client = TestClient(app)

RECRUITER_EMAIL = os.getenv(
    "TEST_RECRUITER_EMAIL",
    "recruiter@test.com",
)

RECRUITER_PASSWORD = os.getenv(
    "TEST_RECRUITER_PASSWORD",
    "recruiter",
)


def login_recruiter() -> str:
    """Authenticate a recruiter and return the bearer token."""
    response = client.post(
        "/auth/login",
        json={
            "email": RECRUITER_EMAIL,
            "password": RECRUITER_PASSWORD,
        },
    )

    assert response.status_code == 200

    return response.json()["access_token"]


@pytest.fixture
def test_job():
    """Create an isolated recruiter-owned job for the test."""
    db = SessionLocal()
    job = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.email == RECRUITER_EMAIL)
            .first()
        )

        assert recruiter is not None, (
            f"Test recruiter '{RECRUITER_EMAIL}' does not exist."
        )

        job = Job(
            title=f"Sprint 2 Isolated Test Job {uuid4().hex[:8]}",
            description=(
                "Python backend developer with FastAPI "
                "and PostgreSQL experience."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        yield job

    finally:
        if job is not None:
            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

            db.commit()

        db.close()


@pytest.fixture
def test_skill():
    """Create an isolated skill for Question Bank tests."""
    db = SessionLocal()
    skill = None

    try:
        skill = Skill(
            name=f"s2-question-skill-{uuid4().hex[:8]}"
        )

        db.add(skill)
        db.commit()
        db.refresh(skill)

        yield skill

    finally:
        if skill is not None:
            db.query(Question).filter(
                Question.skill_id == skill.id
            ).delete(
                synchronize_session=False
            )

            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

            db.commit()

        db.close()


@pytest.fixture
def test_question(test_skill):
    """Create an isolated MCQ for Question Bank tests."""
    db = SessionLocal()
    question = None

    try:
        question = Question(
            question_text="What is Python?",
            question_type="MCQ",
            skill_id=test_skill.id,
            difficulty="medium",
            options=[
                "Programming language",
                "Database",
                "Operating system",
                "Browser",
            ],
            correct_answer="Programming language",
        )

        db.add(question)
        db.commit()
        db.refresh(question)

        yield question

    finally:
        if question is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

            db.commit()

        db.close()


# ============================================================================
# S2-01: Skill Extraction
# ============================================================================


def test_empty_job_description_returns_empty_skills():
    """Empty JD input is handled safely."""
    result = extract_skills_from_jd("   ")

    assert result.model_dump() == {
        "skills": [],
    }


def test_skill_names_are_normalized_and_duplicates_removed():
    """Skill names are normalized and duplicate names are removed."""
    extraction = SkillExtractionResponse(
        skills=[
            ExtractedSkill(
                name=" Python ",
                category="Programming Language",
            ),
            ExtractedSkill(
                name="python",
                category="Programming Language",
            ),
            ExtractedSkill(
                name="FastAPI",
                category="Framework",
            ),
        ]
    )

    result = normalize_extracted_skills(extraction)

    assert result.model_dump() == {
        "skills": [
            {
                "name": "python",
                "category": "Programming Language",
            },
            {
                "name": "fastapi",
                "category": "Framework",
            },
        ]
    }


def test_skill_extraction_endpoint_requires_authentication(
    test_job,
):
    """Skill extraction endpoint rejects unauthenticated requests."""
    response = client.post(
        f"/jobs/{test_job.id}/skills/extract",
    )

    assert response.status_code == 401


def test_skill_extraction_endpoint_returns_structured_skills(
    test_job,
):
    """Authenticated recruiter receives structured extracted skills."""
    token = login_recruiter()

    fake_skills = [
        ExtractedSkill(
            name="python",
            category="Programming Language",
        ),
        ExtractedSkill(
            name="fastapi",
            category="Framework",
        ),
    ]

    with patch(
        "app.api.routes.jobs.extract_and_save_job_skills",
        return_value=fake_skills,
    ):
        response = client.post(
            f"/jobs/{test_job.id}/skills/extract",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

    assert response.status_code == 200

    assert response.json() == {
        "job_id": test_job.id,
        "skills": [
            {
                "name": "python",
                "category": "Programming Language",
            },
            {
                "name": "fastapi",
                "category": "Framework",
            },
        ],
    }


def test_skill_extraction_service_failure_returns_503(
    test_job,
):
    """Skill extraction service failures are converted to a 503 response."""
    token = login_recruiter()

    with patch(
        "app.api.routes.jobs.extract_and_save_job_skills",
        side_effect=LLMQuotaError(
            "Ollama API quota or rate limit exceeded."
        ),
    ):
        response = client.post(
            f"/jobs/{test_job.id}/skills/extract",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

    assert response.status_code == 503

    assert response.json() == {
        "detail": "Skill extraction service is currently unavailable.",
    }


def test_job_description_with_no_identifiable_skills_returns_empty_list():
    """A valid JD without identifiable skills returns an empty skill list."""
    fake_extraction = {
        "skills": [],
    }

    mock_response = type(
        "MockResponse",
        (),
        {
            "status_code": 200,
            "json": lambda self: {
                "response": json.dumps(fake_extraction),
            },
            "raise_for_status": lambda self: None,
        },
    )()

    with patch(
        "app.services.llm_service.requests.post",
        return_value=mock_response,
    ):
        result = extract_skills_from_jd(
            "We are looking for a motivated team member "
            "to join our organization."
        )

    assert result.model_dump() == {
        "skills": [],
    }


def test_repeated_skill_extraction_does_not_create_duplicate_links(
    test_job,
):
    """Running extraction twice does not duplicate job-skill links."""
    db = SessionLocal()

    try:
        job = db.get(Job, test_job.id)

        assert job is not None

        fake_extraction = SkillExtractionResponse(
            skills=[
                ExtractedSkill(
                    name="Python",
                    category="Programming Language",
                ),
                ExtractedSkill(
                    name="FastAPI",
                    category="Framework",
                ),
            ]
        )

        with patch(
            "app.services.skill_service.extract_skills_from_jd",
            return_value=fake_extraction,
        ):
            extract_and_save_job_skills(db, job)
            extract_and_save_job_skills(db, job)

        links = (
            db.query(JobSkill)
            .filter(JobSkill.job_id == job.id)
            .all()
        )

        skill_ids = [link.skill_id for link in links]

        assert len(skill_ids) == len(set(skill_ids))

    finally:
        db.close()


def test_same_skill_is_reused_across_different_jobs():
    """The same skill record is reused across different jobs."""
    db = SessionLocal()
    job_1 = None
    job_2 = None
    created_skill = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.email == RECRUITER_EMAIL)
            .first()
        )

        assert recruiter is not None

        unique_skill_name = f"s2-shared-skill-{uuid4().hex[:8]}"

        job_1 = Job(
            title="Skill Reuse Test Job 1",
            description="Python backend developer.",
            created_by=recruiter.id,
        )

        job_2 = Job(
            title="Skill Reuse Test Job 2",
            description="Python backend developer.",
            created_by=recruiter.id,
        )

        db.add_all([job_1, job_2])
        db.commit()
        db.refresh(job_1)
        db.refresh(job_2)

        fake_extraction = SkillExtractionResponse(
            skills=[
                ExtractedSkill(
                    name=unique_skill_name,
                    category="Other",
                )
            ]
        )

        with patch(
            "app.services.skill_service.extract_skills_from_jd",
            return_value=fake_extraction,
        ):
            extract_and_save_job_skills(db, job_1)
            extract_and_save_job_skills(db, job_2)

        created_skill = (
            db.query(Skill)
            .filter(Skill.name == unique_skill_name)
            .first()
        )

        assert created_skill is not None

        links = (
            db.query(JobSkill)
            .filter(
                JobSkill.job_id.in_([job_1.id, job_2.id]),
                JobSkill.skill_id == created_skill.id,
            )
            .all()
        )

        assert len(links) == 2

        all_matching_skills = (
            db.query(Skill)
            .filter(Skill.name == unique_skill_name)
            .all()
        )

        assert len(all_matching_skills) == 1

    finally:
        if job_1 is not None:
            db.query(JobSkill).filter(
                JobSkill.job_id == job_1.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job_1.id
            ).delete(
                synchronize_session=False
            )

        if job_2 is not None:
            db.query(JobSkill).filter(
                JobSkill.job_id == job_2.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job_2.id
            ).delete(
                synchronize_session=False
            )

        if created_skill is not None:
            remaining_links = (
                db.query(JobSkill)
                .filter(JobSkill.skill_id == created_skill.id)
                .count()
            )

            if remaining_links == 0:
                db.query(Skill).filter(
                    Skill.id == created_skill.id
                ).delete(
                    synchronize_session=False
                )

        db.commit()
        db.close()


def test_recruiter_cannot_extract_skills_for_another_recruiters_job():
    """A recruiter cannot extract skills from another recruiter's job."""
    from app.core.security import create_access_token

    db = SessionLocal()

    other_recruiter = None
    job = None

    try:
        test_email = f"s2-other-recruiter-{uuid4().hex[:8]}@test.com"

        other_recruiter = User(
            email=test_email,
            password_hash="test-only-password-hash",
            role="recruiter",
        )

        db.add(other_recruiter)
        db.commit()
        db.refresh(other_recruiter)

        job = Job(
            title="Authorization Test Job",
            description="Python developer with FastAPI experience.",
            created_by=other_recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        token = create_access_token(
            {
                "sub": str(
                    (
                        db.query(User)
                        .filter(User.email == RECRUITER_EMAIL)
                        .first()
                    ).id
                ),
                "role": "recruiter",
            }
        )

        response = client.post(
            f"/jobs/{job.id}/skills/extract",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 403

        assert response.json()["detail"] == (
            "You are not allowed to extract skills for this job."
        )

    finally:
        if job is not None:
            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        if other_recruiter is not None:
            db.query(User).filter(
                User.id == other_recruiter.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_job_skill_duplicate_link_is_rejected_by_database(
    test_job,
):
    """Database prevents duplicate job-skill links."""
    db = SessionLocal()

    skill = None

    try:
        job = db.get(Job, test_job.id)

        assert job is not None

        unique_skill_name = f"s2-duplicate-skill-{uuid4().hex[:8]}"

        skill = Skill(name=unique_skill_name)

        db.add(skill)
        db.flush()

        existing_link = JobSkill(
            job_id=job.id,
            skill_id=skill.id,
        )

        db.add(existing_link)
        db.commit()

        # Detach the existing ORM instance so creating another
        # object with the same identity does not trigger an
        # SQLAlchemy identity-map conflict warning.
        db.expunge(existing_link)

        duplicate_link = JobSkill(
            job_id=job.id,
            skill_id=skill.id,
        )

        db.add(duplicate_link)

        with pytest.raises(IntegrityError):
            db.commit()

        db.rollback()

    finally:
        if skill is not None:
            db.query(JobSkill).filter(
                JobSkill.skill_id == skill.id
            ).delete(
                synchronize_session=False
            )

            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

            db.commit()

        db.close()


def test_malformed_llm_response_raises_llm_response_error():
    """Malformed LLM output is converted into a controlled service error."""
    mock_response = type(
        "MockResponse",
        (),
        {
            "status_code": 200,
            "json": lambda self: {
                "response": '{"skills": [invalid json]}',
            },
            "raise_for_status": lambda self: None,
        },
    )()

    with patch(
        "app.services.llm_service.requests.post",
        return_value=mock_response,
    ):
        with pytest.raises(
            LLMResponseError,
            match="Ollama returned an invalid structured skill response.",
        ):
            extract_skills_from_jd(
                "Python developer with FastAPI experience."
            )


def test_llm_call_uses_prepared_text_and_structured_output():
    """LLM call receives prepared JD text and requests JSON output."""
    mock_response = type(
        "MockResponse",
        (),
        {
            "status_code": 200,
            "json": lambda self: {
                "response": json.dumps(
                    {
                        "skills": [
                            {
                                "name": "python",
                                "category": "Programming Language",
                            }
                        ]
                    }
                ),
            },
            "raise_for_status": lambda self: None,
        },
    )()

    with patch(
        "app.services.llm_service.requests.post",
        return_value=mock_response,
    ) as mock_post:
        result = extract_skills_from_jd(
            "  Python developer\n\nwith   FastAPI experience.  "
        )

    assert result.model_dump() == {
        "skills": [
            {
                "name": "python",
                "category": "Programming Language",
            }
        ]
    }

    mock_post.assert_called_once()

    call_args = mock_post.call_args

    expected_url = (
        f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    )

    assert call_args.args[0] == expected_url

    request_json = call_args.kwargs["json"]

    assert request_json["model"] == settings.ollama_model
    assert request_json["stream"] is False
    assert request_json["format"] == "json"

    assert (
        "Python developer with FastAPI experience."
        in request_json["prompt"]
    )


def test_candidate_cannot_extract_job_skills(
    test_job,
):
    """A candidate cannot access the recruiter-only skill extraction endpoint."""
    from app.core.security import create_access_token

    db = SessionLocal()

    try:
        candidate = (
            db.query(User)
            .filter(User.role == "candidate")
            .first()
        )

        assert candidate is not None, (
            "This test requires at least one candidate user in the database."
        )

        token = create_access_token(
            {
                "sub": str(candidate.id),
                "role": candidate.role,
            }
        )

        response = client.post(
            f"/jobs/{test_job.id}/skills/extract",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Insufficient permissions"

    finally:
        db.close()


def test_skill_extraction_returns_404_for_missing_job():
    """Skill extraction returns 404 when the job does not exist."""
    token = login_recruiter()

    response = client.post(
        "/jobs/999999999/skills/extract",
        headers={
            "Authorization": f"Bearer {token}",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Job not found"


def test_skill_extraction_rejects_invalid_token(
    test_job,
):
    """Skill extraction rejects an invalid bearer token."""
    response = client.post(
        f"/jobs/{test_job.id}/skills/extract",
        headers={
            "Authorization": "Bearer invalid-token",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


def test_skill_extraction_rolls_back_on_database_error(
    test_job,
):
    """Database errors during skill persistence trigger a rollback."""
    db = SessionLocal()

    try:
        job = db.get(Job, test_job.id)

        assert job is not None

        fake_extraction = SkillExtractionResponse(
            skills=[
                ExtractedSkill(
                    name=f"rollback-test-skill-{uuid4().hex[:8]}",
                    category="Other",
                )
            ]
        )

        with patch(
            "app.services.skill_service.extract_skills_from_jd",
            return_value=fake_extraction,
        ), patch.object(
            db,
            "flush",
            side_effect=SQLAlchemyError(
                "Simulated database failure"
            ),
        ):
            with pytest.raises(SQLAlchemyError):
                extract_and_save_job_skills(db, job)

        assert db.in_transaction() is False

    finally:
        db.close()


def test_llm_connection_error_is_handled():
    """LLM connection failures are converted to LLMConnectionError."""
    connection_error = requests.exceptions.ConnectionError(
        "Ollama unavailable"
    )

    with patch(
        "app.services.llm_service.requests.post",
        side_effect=connection_error,
    ):
        with pytest.raises(
            LLMConnectionError,
            match="Unable to connect to Ollama API.",
        ):
            extract_skills_from_jd(
                "Python developer with FastAPI experience."
            )


def test_llm_rate_limit_error_is_handled():
    """LLM rate-limit failures are converted to LLMQuotaError."""
    mock_response = type(
        "MockResponse",
        (),
        {
            "status_code": 429,
        },
    )()

    rate_limit_error = requests.exceptions.HTTPError(
        "Rate limit exceeded",
        response=mock_response,
    )

    with patch(
        "app.services.llm_service.requests.post",
        side_effect=rate_limit_error,
    ):
        with pytest.raises(
            LLMQuotaError,
            match="Ollama API quota or rate limit exceeded.",
        ):
            extract_skills_from_jd(
                "Python developer with FastAPI experience."
            )


def test_skill_extraction_connection_failure_returns_503(
    test_job,
):
    """LLM connection failures are converted to a 503 response."""
    token = login_recruiter()

    with patch(
        "app.api.routes.jobs.extract_and_save_job_skills",
        side_effect=LLMConnectionError(
            "Unable to connect to Ollama API."
        ),
    ):
        response = client.post(
            f"/jobs/{test_job.id}/skills/extract",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Skill extraction service is currently unavailable."
    )


def test_skill_extraction_api_error_returns_503(
    test_job,
):
    """Ollama API errors are converted to a 503 response."""
    token = login_recruiter()

    with patch(
        "app.api.routes.jobs.extract_and_save_job_skills",
        side_effect=LLMResponseError(
            "Ollama API returned an error."
        ),
    ):
        response = client.post(
            f"/jobs/{test_job.id}/skills/extract",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Skill extraction service is currently unavailable."
    )


def test_extracted_skills_are_linked_to_correct_job():
    """Extracted skills are linked to the job being processed."""
    db = SessionLocal()
    job = None
    created_skill = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.email == RECRUITER_EMAIL)
            .first()
        )

        assert recruiter is not None

        unique_skill_name = f"s2-correct-job-skill-{uuid4().hex[:8]}"

        job = Job(
            title="Correct Job Link Test",
            description=(
                "Python backend developer with FastAPI experience."
            ),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        fake_extraction = SkillExtractionResponse(
            skills=[
                ExtractedSkill(
                    name=unique_skill_name,
                    category="Other",
                )
            ]
        )

        with patch(
            "app.services.skill_service.extract_skills_from_jd",
            return_value=fake_extraction,
        ):
            extract_and_save_job_skills(db, job)

        created_skill = (
            db.query(Skill)
            .filter(Skill.name == unique_skill_name)
            .first()
        )

        assert created_skill is not None

        correct_link = (
            db.query(JobSkill)
            .filter(
                JobSkill.job_id == job.id,
                JobSkill.skill_id == created_skill.id,
            )
            .first()
        )

        assert correct_link is not None
        assert correct_link.job_id == job.id

    finally:
        if job is not None:
            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        if created_skill is not None:
            remaining_links = (
                db.query(JobSkill)
                .filter(JobSkill.skill_id == created_skill.id)
                .count()
            )

            if remaining_links == 0:
                db.query(Skill).filter(
                    Skill.id == created_skill.id
                ).delete(
                    synchronize_session=False
                )

        db.commit()
        db.close()


def test_inconsistent_duplicate_skill_names_are_deduplicated():
    """Duplicate skill names are deduplicated even when categories differ."""
    extraction = SkillExtractionResponse(
        skills=[
            ExtractedSkill(
                name="Python",
                category="Programming Language",
            ),
            ExtractedSkill(
                name=" python ",
                category="Other",
            ),
            ExtractedSkill(
                name="PYTHON",
                category="Framework",
            ),
        ]
    )

    result = normalize_extracted_skills(extraction)

    assert len(result.skills) == 1
    assert result.skills[0].name == "python"


def test_empty_skill_names_are_removed():
    """Skills with empty names are removed during normalization."""
    extraction = SkillExtractionResponse(
        skills=[
            ExtractedSkill(
                name=" ",
                category="Other",
            ),
            ExtractedSkill(
                name="Python",
                category="Programming Language",
            ),
            ExtractedSkill(
                name="",
                category="Other",
            ),
        ]
    )

    result = normalize_extracted_skills(extraction)

    assert result.model_dump() == {
        "skills": [
            {
                "name": "python",
                "category": "Programming Language",
            }
        ]
    }


def test_empty_llm_output_returns_empty_skills():
    """Missing LLM output is handled safely."""
    mock_response = type(
        "MockResponse",
        (),
        {
            "status_code": 200,
            "json": lambda self: {
                "response": "",
            },
            "raise_for_status": lambda self: None,
        },
    )()

    with patch(
        "app.services.llm_service.requests.post",
        return_value=mock_response,
    ):
        result = extract_skills_from_jd(
            "Python developer with FastAPI experience."
        )

    assert result.model_dump() == {
        "skills": [],
    }


def test_overly_long_skill_name_is_removed():
    """Skill names exceeding the storage limit are not persisted."""
    extraction = SkillExtractionResponse(
        skills=[
            ExtractedSkill(
                name="A" * 101,
                category="Other",
            ),
            ExtractedSkill(
                name="Python",
                category="Programming Language",
            ),
        ]
    )

    result = normalize_extracted_skills(extraction)

    assert result.model_dump() == {
        "skills": [
            {
                "name": "python",
                "category": "Programming Language",
            }
        ]
    }


def test_oversized_job_description_returns_422():
    """Job descriptions exceeding the maximum length are rejected."""
    from app.services.llm_service import MAX_JD_LENGTH

    db = SessionLocal()
    job = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.email == RECRUITER_EMAIL)
            .first()
        )

        assert recruiter is not None

        job = Job(
            title="Oversized JD Test",
            description="A" * (MAX_JD_LENGTH + 1),
            created_by=recruiter.id,
        )

        db.add(job)
        db.commit()
        db.refresh(job)

        token = login_recruiter()

        response = client.post(
            f"/jobs/{job.id}/skills/extract",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"] == (
            "Job description exceeds the maximum allowed length."
        )

    finally:
        if job is not None:
            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

            db.commit()

        db.close()


def test_reextraction_removes_stale_job_skill_links(
    test_job,
):
    """Re-extraction removes skills no longer present in the JD."""
    db = SessionLocal()

    try:
        job = db.get(Job, test_job.id)

        assert job is not None

        first_extraction = SkillExtractionResponse(
            skills=[
                ExtractedSkill(
                    name=f"s2-python-{uuid4().hex[:8]}",
                    category="Programming Language",
                ),
                ExtractedSkill(
                    name=f"s2-fastapi-{uuid4().hex[:8]}",
                    category="Framework",
                ),
            ]
        )

        first_python_name = first_extraction.skills[0].name
        first_fastapi_name = first_extraction.skills[1].name

        second_extraction = SkillExtractionResponse(
            skills=[
                ExtractedSkill(
                    name=first_python_name,
                    category="Programming Language",
                )
            ]
        )

        with patch(
            "app.services.skill_service.extract_skills_from_jd",
            side_effect=[
                first_extraction,
                second_extraction,
            ],
        ):
            extract_and_save_job_skills(db, job)
            extract_and_save_job_skills(db, job)

        links = (
            db.query(JobSkill)
            .filter(JobSkill.job_id == job.id)
            .all()
        )

        linked_skill_names = {
            db.get(Skill, link.skill_id).name
            for link in links
            if db.get(Skill, link.skill_id) is not None
        }

        assert first_python_name in linked_skill_names
        assert first_fastapi_name not in linked_skill_names

    finally:
        db.close()


# ============================================================================
# S2-03: Question Bank Foundation
# ============================================================================


def test_question_service_creates_valid_mcq(test_skill):
    """Question service creates a valid MCQ with complete metadata."""
    db = SessionLocal()

    question = None

    try:
        question = create_question(
            db=db,
            question_text="Which keyword defines a Python function?",
            question_type="MCQ",
            skill_id=test_skill.id,
            difficulty="Medium",
            options=[
                "def",
                "func",
                "function",
                "define",
            ],
            correct_answer="def",
        )

        assert question.id is not None
        assert question.question_text == (
            "Which keyword defines a Python function?"
        )
        assert question.question_type == "MCQ"
        assert question.skill_id == test_skill.id
        assert question.difficulty == "medium"
        assert question.options == [
            "def",
            "func",
            "function",
            "define",
        ]
        assert question.correct_answer == "def"

    finally:
        if question is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )
            db.commit()

        db.close()


def test_question_service_creates_valid_free_text(test_skill):
    """Question service creates a valid free-text question."""
    db = SessionLocal()

    question = None

    try:
        question = create_question(
            db=db,
            question_text="Explain Python decorators.",
            question_type="FREE_TEXT",
            skill_id=test_skill.id,
            difficulty="easy",
            options=[
                "this should be ignored",
            ],
            correct_answer="this should also be ignored",
        )

        assert question.id is not None
        assert question.question_type == "FREE_TEXT"
        assert question.difficulty == "easy"
        assert question.options is None
        assert question.correct_answer is None

    finally:
        if question is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )
            db.commit()

        db.close()


def test_question_service_rejects_invalid_question_type(test_skill):
    """Question service rejects unsupported question types."""
    db = SessionLocal()

    try:
        with pytest.raises(
            QuestionServiceError,
            match="Question type must be MCQ or FREE_TEXT.",
        ):
            create_question(
                db=db,
                question_text="Invalid type question",
                question_type="ESSAY",
                skill_id=test_skill.id,
                difficulty="medium",
            )

    finally:
        db.close()


def test_question_service_rejects_invalid_difficulty(test_skill):
    """Question service rejects unsupported difficulty values."""
    db = SessionLocal()

    try:
        with pytest.raises(
            QuestionServiceError,
            match="Difficulty must be easy, medium, or hard.",
        ):
            create_question(
                db=db,
                question_text="Invalid difficulty question",
                question_type="FREE_TEXT",
                skill_id=test_skill.id,
                difficulty="expert",
            )

    finally:
        db.close()


def test_question_service_rejects_mcq_with_too_few_options(
    test_skill,
):
    """MCQ questions require at least two options."""
    db = SessionLocal()

    try:
        with pytest.raises(
            QuestionServiceError,
            match="MCQ questions must have at least two options.",
        ):
            create_question(
                db=db,
                question_text="Invalid MCQ",
                question_type="MCQ",
                skill_id=test_skill.id,
                difficulty="medium",
                options=["def"],
                correct_answer="def",
            )

    finally:
        db.close()


def test_question_service_rejects_invalid_mcq_correct_answer(
    test_skill,
):
    """MCQ correct answer must match one of the provided options."""
    db = SessionLocal()

    try:
        with pytest.raises(
            QuestionServiceError,
            match=(
                "MCQ correct answer must match one of the options."
            ),
        ):
            create_question(
                db=db,
                question_text="Invalid answer MCQ",
                question_type="MCQ",
                skill_id=test_skill.id,
                difficulty="medium",
                options=[
                    "def",
                    "func",
                    "function",
                ],
                correct_answer="return",
            )

    finally:
        db.close()


def test_question_service_rejects_missing_skill():
    """Question service rejects a question linked to a missing skill."""
    db = SessionLocal()

    try:
        with pytest.raises(
            QuestionServiceError,
            match="Skill not found.",
        ):
            create_question(
                db=db,
                question_text="Missing skill question",
                question_type="FREE_TEXT",
                skill_id=999999999,
                difficulty="medium",
            )

    finally:
        db.close()


def test_question_service_gets_questions_by_skill(
    test_skill,
    test_question,
):
    """Question service retrieves questions filtered by skill."""
    db = SessionLocal()

    try:
        questions = get_questions(
            db=db,
            skill_id=test_skill.id,
        )

        assert any(
            question.id == test_question.id
            for question in questions
        )

        assert all(
            question.skill_id == test_skill.id
            for question in questions
        )

    finally:
        db.close()


def test_question_service_filters_by_type_and_difficulty(
    test_skill,
):
    """Question service applies question type and difficulty filters."""
    db = SessionLocal()

    questions = []

    try:
        mcq = create_question(
            db=db,
            question_text="MCQ filtering test",
            question_type="MCQ",
            skill_id=test_skill.id,
            difficulty="medium",
            options=[
                "A",
                "B",
            ],
            correct_answer="A",
        )

        free_text = create_question(
            db=db,
            question_text="FREE_TEXT filtering test",
            question_type="FREE_TEXT",
            skill_id=test_skill.id,
            difficulty="easy",
        )

        questions = [
            mcq,
            free_text,
        ]

        result = get_questions(
            db=db,
            skill_id=test_skill.id,
            question_type="MCQ",
            difficulty="Medium",
        )

        assert len(result) == 1
        assert result[0].id == mcq.id
        assert result[0].question_type == "MCQ"
        assert result[0].difficulty == "medium"

    finally:
        for question in questions:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_question_service_rejects_invalid_filters(test_skill):
    """Question service rejects invalid retrieval filters."""
    db = SessionLocal()

    try:
        with pytest.raises(
            QuestionServiceError,
            match="Question type must be MCQ or FREE_TEXT.",
        ):
            get_questions(
                db=db,
                skill_id=test_skill.id,
                question_type="ESSAY",
            )

        with pytest.raises(
            QuestionServiceError,
            match="Difficulty must be easy, medium, or hard.",
        ):
            get_questions(
                db=db,
                skill_id=test_skill.id,
                difficulty="expert",
            )

    finally:
        db.close()


def test_question_service_updates_existing_question(
    test_question,
    test_skill,
):
    """Question service updates an existing question."""
    db = SessionLocal()

    try:
        question = update_question(
            db=db,
            question_id=test_question.id,
            question_text="Updated Python function question",
            question_type="MCQ",
            skill_id=test_skill.id,
            difficulty="hard",
            options=[
                "def",
                "return",
                "yield",
                "lambda",
            ],
            correct_answer="def",
        )

        assert question.id == test_question.id
        assert question.question_text == (
            "Updated Python function question"
        )
        assert question.question_type == "MCQ"
        assert question.skill_id == test_skill.id
        assert question.difficulty == "hard"
        assert question.options == [
            "def",
            "return",
            "yield",
            "lambda",
        ]
        assert question.correct_answer == "def"

    finally:
        db.close()


def test_question_service_update_rejects_missing_question():
    """Question service rejects updates for a missing question."""
    db = SessionLocal()

    try:
        with pytest.raises(
            QuestionServiceError,
            match="Question not found.",
        ):
            update_question(
                db=db,
                question_id=999999999,
                question_text="Missing question",
                question_type="FREE_TEXT",
                skill_id=4,
                difficulty="medium",
            )

    finally:
        db.close()


def test_create_question_endpoint_requires_authentication(
    test_skill,
):
    """Question creation endpoint rejects unauthenticated requests."""
    response = client.post(
        "/questions",
        json={
            "question_text": "Unauthorized question",
            "question_type": "FREE_TEXT",
            "skill_id": test_skill.id,
            "difficulty": "medium",
            "options": None,
            "correct_answer": None,
        },
    )

    assert response.status_code == 401


def test_create_question_endpoint_creates_mcq(test_skill):
    """Recruiter can create an MCQ through the API."""
    token = login_recruiter()

    response = client.post(
        "/questions",
        headers={
            "Authorization": f"Bearer {token}",
        },
        json={
            "question_text": "Which keyword defines a function?",
            "question_type": "MCQ",
            "skill_id": test_skill.id,
            "difficulty": "medium",
            "options": [
                "def",
                "func",
                "function",
                "define",
            ],
            "correct_answer": "def",
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["question_text"] == (
        "Which keyword defines a function?"
    )
    assert data["question_type"] == "MCQ"
    assert data["skill_id"] == test_skill.id
    assert data["difficulty"] == "medium"
    assert data["options"] == [
        "def",
        "func",
        "function",
        "define",
    ]
    assert data["correct_answer"] == "def"

    db = SessionLocal()

    try:
        question = db.get(Question, data["id"])

        assert question is not None
        assert question.question_text == (
            "Which keyword defines a function?"
        )

    finally:
        if question is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )
            db.commit()

        db.close()


def test_get_questions_endpoint_returns_filtered_results(
    test_question,
    test_skill,
):
    """Recruiter can retrieve questions using all supported filters."""
    token = login_recruiter()

    response = client.get(
        "/questions",
        params={
            "skill_id": test_skill.id,
            "question_type": "MCQ",
            "difficulty": "Medium",
        },
        headers={
            "Authorization": f"Bearer {token}",
        },
    )

    assert response.status_code == 200

    data = response.json()

    matching_question = next(
        (
            question
            for question in data
            if question["id"] == test_question.id
        ),
        None,
    )

    assert matching_question is not None
    assert matching_question["skill_id"] == test_skill.id
    assert matching_question["question_type"] == "MCQ"
    assert matching_question["difficulty"] == "medium"


def test_get_questions_endpoint_rejects_invalid_question_type():
    """GET /questions rejects unsupported question types."""
    token = login_recruiter()

    response = client.get(
        "/questions",
        params={
            "question_type": "ESSAY",
        },
        headers={
            "Authorization": f"Bearer {token}",
        },
    )

    assert response.status_code == 422

    assert response.json() == {
        "detail": "Question type must be MCQ or FREE_TEXT."
    }


def test_get_questions_endpoint_rejects_invalid_difficulty():
    """GET /questions rejects unsupported difficulty values."""
    token = login_recruiter()

    response = client.get(
        "/questions",
        params={
            "difficulty": "expert",
        },
        headers={
            "Authorization": f"Bearer {token}",
        },
    )

    assert response.status_code == 422

    assert response.json() == {
        "detail": "Difficulty must be easy, medium, or hard."
    }


def test_update_question_endpoint_updates_existing_question(
    test_question,
    test_skill,
):
    """Recruiter can update an existing question through the API."""
    token = login_recruiter()

    response = client.put(
        f"/questions/{test_question.id}",
        headers={
            "Authorization": f"Bearer {token}",
        },
        json={
            "question_text": "Updated API question text",
            "question_type": "MCQ",
            "skill_id": test_skill.id,
            "difficulty": "hard",
            "options": [
                "A",
                "B",
                "C",
                "D",
            ],
            "correct_answer": "A",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == test_question.id
    assert data["question_text"] == "Updated API question text"
    assert data["question_type"] == "MCQ"
    assert data["skill_id"] == test_skill.id
    assert data["difficulty"] == "hard"
    assert data["options"] == [
        "A",
        "B",
        "C",
        "D",
    ]
    assert data["correct_answer"] == "A"

    assert data["updated_at"] != data["created_at"]


def test_update_question_endpoint_requires_authentication(
    test_question,
    test_skill,
):
    """Question update endpoint rejects unauthenticated requests."""
    response = client.put(
        f"/questions/{test_question.id}",
        json={
            "question_text": "Unauthorized update",
            "question_type": "MCQ",
            "skill_id": test_skill.id,
            "difficulty": "medium",
            "options": [
                "A",
                "B",
            ],
            "correct_answer": "A",
        },
    )

    assert response.status_code == 401


def test_update_question_endpoint_rejects_invalid_mcq_answer(
    test_question,
    test_skill,
):
    """Question update endpoint rejects an invalid MCQ answer."""
    token = login_recruiter()

    response = client.put(
        f"/questions/{test_question.id}",
        headers={
            "Authorization": f"Bearer {token}",
        },
        json={
            "question_text": "Invalid updated question",
            "question_type": "MCQ",
            "skill_id": test_skill.id,
            "difficulty": "medium",
            "options": [
                "A",
                "B",
                "C",
            ],
            "correct_answer": "return",
        },
    )

    assert response.status_code == 422

    assert response.json() == {
        "detail": (
            "MCQ correct answer must match one of the options."
        )
    }


def test_updated_question_is_persisted_in_database(
    test_question,
    test_skill,
):
    """Updated Question Bank data is persisted in PostgreSQL."""
    token = login_recruiter()

    response = client.put(
        f"/questions/{test_question.id}",
        headers={
            "Authorization": f"Bearer {token}",
        },
        json={
            "question_text": "Database persistence verification",
            "question_type": "MCQ",
            "skill_id": test_skill.id,
            "difficulty": "easy",
            "options": [
                "A",
                "B",
                "C",
                "D",
            ],
            "correct_answer": "B",
        },
    )

    assert response.status_code == 200

    db = SessionLocal()

    try:
        question = db.get(Question, test_question.id)

        assert question is not None
        assert question.question_text == (
            "Database persistence verification"
        )
        assert question.question_type == "MCQ"
        assert question.skill_id == test_skill.id
        assert question.difficulty == "easy"
        assert question.options == [
            "A",
            "B",
            "C",
            "D",
        ]
        assert question.correct_answer == "B"

    finally:
        db.close()

def test_candidate_cannot_create_question(test_skill):
    """A candidate cannot create a Question Bank question."""
    from app.core.security import create_access_token

    db = SessionLocal()

    try:
        candidate = (
            db.query(User)
            .filter(User.role == "candidate")
            .first()
        )

        assert candidate is not None, (
            "This test requires at least one candidate user in the database."
        )

        token = create_access_token(
            {
                "sub": str(candidate.id),
                "role": candidate.role,
            }
        )

        response = client.post(
            "/questions",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_text": "Candidate should not create this",
                "question_type": "FREE_TEXT",
                "skill_id": test_skill.id,
                "difficulty": "medium",
                "options": None,
                "correct_answer": None,
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Insufficient permissions"

    finally:
        db.close()
def test_candidate_cannot_update_question(
    test_question,
    test_skill,
):
    """A candidate cannot update a Question Bank question."""
    from app.core.security import create_access_token

    db = SessionLocal()

    try:
        candidate = (
            db.query(User)
            .filter(User.role == "candidate")
            .first()
        )

        assert candidate is not None, (
            "This test requires at least one candidate user in the database."
        )

        token = create_access_token(
            {
                "sub": str(candidate.id),
                "role": candidate.role,
            }
        )

        response = client.put(
            f"/questions/{test_question.id}",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "question_text": "Candidate should not update this",
                "question_type": "MCQ",
                "skill_id": test_skill.id,
                "difficulty": "medium",
                "options": [
                    "A",
                    "B",
                ],
                "correct_answer": "A",
            },
        )

        assert response.status_code == 403
        assert response.json()["detail"] == "Insufficient permissions"

    finally:
        db.close()
def test_update_question_endpoint_returns_404_for_missing_question():
    """PUT /questions/{id} returns 404 when the question does not exist."""
    token = login_recruiter()

    response = client.put(
        "/questions/999999999",
        headers={
            "Authorization": f"Bearer {token}",
        },
        json={
            "question_text": "This question does not exist",
            "question_type": "FREE_TEXT",
            "skill_id": 4,
            "difficulty": "medium",
            "options": None,
            "correct_answer": None,
        },
    )

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Question not found."
    }

def test_failed_question_update_does_not_modify_existing_question(
    test_question,
):
    """A failed question update does not modify the existing record."""
    token = login_recruiter()

    original_text = test_question.question_text
    original_type = test_question.question_type
    original_skill_id = test_question.skill_id
    original_difficulty = test_question.difficulty
    original_options = test_question.options
    original_correct_answer = test_question.correct_answer

    response = client.put(
        f"/questions/{test_question.id}",
        headers={
            "Authorization": f"Bearer {token}",
        },
        json={
            "question_text": "This update must fail",
            "question_type": "MCQ",
            "skill_id": test_question.skill_id,
            "difficulty": "medium",
            "options": [
                "A",
                "B",
                "C",
            ],
            "correct_answer": "INVALID",
        },
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": (
            "MCQ correct answer must match one of the options."
        )
    }

    db = SessionLocal()

    try:
        question = db.get(Question, test_question.id)

        assert question is not None
        assert question.question_text == original_text
        assert question.question_type == original_type
        assert question.skill_id == original_skill_id
        assert question.difficulty == original_difficulty
        assert question.options == original_options
        assert question.correct_answer == original_correct_answer

    finally:
        db.close()




# S2-04: Curated Seed Questions




def test_seed_question_set_covers_required_core_skills():
    """S2-04 seed data covers all required core skills."""
    from app.db.seed_questions import SEED_QUESTIONS, SEED_SKILLS

    required_skills = {
        "python",
        "sql",
        "machine learning",
        "deep learning",
        "statistics",
    }

    assert set(SEED_SKILLS) == required_skills
    assert {seed["skill"] for seed in SEED_QUESTIONS} == required_skills


def test_seed_questions_have_complete_metadata():
    """Every curated seed question has complete required metadata."""
    from app.db.seed_questions import SEED_QUESTIONS

    for seed in SEED_QUESTIONS:
        assert seed["skill"]
        assert seed["question_text"]
        assert seed["question_type"] in {"MCQ", "FREE_TEXT"}
        assert seed["difficulty"] in {"easy", "medium", "hard"}

        if seed["question_type"] == "MCQ":
            assert seed["options"]
            assert len(seed["options"]) >= 2
            assert seed["correct_answer"] in seed["options"]


def test_seed_questions_are_loaded_into_question_bank():
    """All curated seed questions are persisted in the question bank."""
    from app.db.seed_questions import SEED_QUESTIONS, SEED_SKILLS

    db = SessionLocal()

    try:
        skills = {
            skill.name: skill.id
            for skill in db.query(Skill)
            .filter(Skill.name.in_(SEED_SKILLS))
            .all()
        }

        assert set(skills) == set(SEED_SKILLS)

        for seed in SEED_QUESTIONS:
            question = (
                db.query(Question)
                .filter(
                    Question.skill_id == skills[seed["skill"]],
                    Question.question_text
                    == seed["question_text"],
                )
                .first()
            )

            assert question is not None
            assert question.question_type == seed["question_type"]
            assert question.difficulty == seed["difficulty"]

            if seed["question_type"] == "MCQ":
                assert question.options == seed["options"]
                assert question.correct_answer == seed["correct_answer"]

    finally:
        db.close()

def test_seed_questions_are_idempotent():
    """Running the seed process twice does not create duplicates."""
    from app.db.seed_questions import (
        SEED_QUESTIONS,
        SEED_SKILLS,
        seed_questions,
    )

    db = SessionLocal()

    try:
        before_count = (
            db.query(Question)
            .join(Skill, Question.skill_id == Skill.id)
            .filter(
                Skill.name.in_(SEED_SKILLS),
                Question.question_text.in_(
                    [
                        seed["question_text"]
                        for seed in SEED_QUESTIONS
                    ]
                ),
            )
            .count()
        )
    finally:
        db.close()

    seed_questions()
    seed_questions()

    db = SessionLocal()

    try:
        after_count = (
            db.query(Question)
            .join(Skill, Question.skill_id == Skill.id)
            .filter(
                Skill.name.in_(SEED_SKILLS),
                Question.question_text.in_(
                    [
                        seed["question_text"]
                        for seed in SEED_QUESTIONS
                    ]
                ),
            )
            .count()
        )

        assert after_count == before_count
    finally:
        db.close()
def test_seed_questions_are_idempotent():
    """Running the seed process twice does not create duplicates."""
    from app.db.seed_questions import (
        SEED_QUESTIONS,
        SEED_SKILLS,
        seed_questions,
    )

    expected_count = len(SEED_QUESTIONS)

    db = SessionLocal()

    try:
        before_count = (
            db.query(Question)
            .join(Skill, Question.skill_id == Skill.id)
            .filter(
                Skill.name.in_(SEED_SKILLS),
                Question.question_text.in_(
                    [
                        seed["question_text"]
                        for seed in SEED_QUESTIONS
                    ]
                ),
            )
            .count()
        )

        assert before_count == expected_count
    finally:
        db.close()

    seed_questions()
    seed_questions()

    db = SessionLocal()

    try:
        after_count = (
            db.query(Question)
            .join(Skill, Question.skill_id == Skill.id)
            .filter(
                Skill.name.in_(SEED_SKILLS),
                Question.question_text.in_(
                    [
                        seed["question_text"]
                        for seed in SEED_QUESTIONS
                    ]
                ),
            )
            .count()
        )

        assert after_count == expected_count
        assert after_count == before_count
    finally:
        db.close()