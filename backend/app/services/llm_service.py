import json
from typing import Literal

import requests
from pydantic import BaseModel, ValidationError

from app.core.config import settings


MAX_JD_LENGTH = 12000
MAX_SKILL_NAME_LENGTH = 100


class LLMServiceError(Exception):
    """Base exception for LLM service failures."""


class LLMQuotaError(LLMServiceError):
    """Raised when the LLM quota or rate limit is exceeded."""


class LLMConnectionError(LLMServiceError):
    """Raised when the LLM API cannot be reached."""


class LLMResponseError(LLMServiceError):
    """Raised when the LLM returns an invalid response."""


SkillCategory = Literal[
    "Programming Language",
    "Framework",
    "Library",
    "Database",
    "Cloud",
    "DevOps",
    "Testing",
    "Development Tool",
    "Professional Skill",
    "Certification",
    "Other",
]


class ExtractedSkill(BaseModel):
    name: str
    category: SkillCategory


class SkillExtractionResponse(BaseModel):
    skills: list[ExtractedSkill]


def prepare_jd_text(jd_text: str) -> str:
    """Prepare job description text for LLM processing."""
    if not jd_text:
        return ""

    prepared_text = " ".join(jd_text.strip().split())

    if len(prepared_text) > MAX_JD_LENGTH:
        raise ValueError(
            "Job description exceeds the maximum allowed length."
        )

    return prepared_text


def extract_skills_from_jd(
    jd_text: str,
) -> SkillExtractionResponse:
    """Extract structured skills from a job description using Ollama."""
    prepared_text = prepare_jd_text(jd_text)

    if not prepared_text:
        return SkillExtractionResponse(skills=[])

    ollama_url = (
        f"{settings.ollama_base_url.rstrip('/')}/api/generate"
    )

    prompt = f"""
Extract skills explicitly supported by the job description.

Rules:

- Do not infer skills from the job title alone.
- Do not invent skills.
- Include relevant programming languages, frameworks, libraries,
  databases, cloud technologies, DevOps tools, testing tools,
  development tools, and professional skills.
- Do not include job titles, company names, responsibilities,
  years of experience, salary, or education as skills.
- Normalize obvious duplicate mentions.
- Return an empty skills list when no relevant skills are present.
- Every skill must have exactly one category.

Allowed categories:

Programming Language
Framework
Library
Database
Cloud
DevOps
Testing
Development Tool
Professional Skill
Certification
Other

Return ONLY valid JSON in this exact structure:

{{
    "skills": [
        {{
            "name": "python",
            "category": "Programming Language"
        }}
    ]
}}

Job Description:

{prepared_text}
""".strip()

    try:
        response = requests.post(
            ollama_url,
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
            },
            timeout=120,
        )

        response.raise_for_status()

    except requests.exceptions.Timeout as exc:
        raise LLMConnectionError(
            "Unable to connect to Ollama API."
        ) from exc

    except requests.exceptions.ConnectionError as exc:
        raise LLMConnectionError(
            "Unable to connect to Ollama API."
        ) from exc

    except requests.exceptions.HTTPError as exc:
        status_code = (
            exc.response.status_code
            if exc.response is not None
            else None
        )

        if status_code == 429:
            raise LLMQuotaError(
                "Ollama API quota or rate limit exceeded."
            ) from exc

        raise LLMResponseError(
            "Ollama API returned an error."
        ) from exc

    except requests.exceptions.RequestException as exc:
        raise LLMResponseError(
            "Ollama API returned an error."
        ) from exc

    try:
        response_json = response.json()
        raw_text = response_json.get("response")

        if not raw_text:
            return SkillExtractionResponse(skills=[])

        parsed_data = json.loads(raw_text)

        return SkillExtractionResponse.model_validate(
            parsed_data
        )

    except (
        json.JSONDecodeError,
        ValidationError,
        TypeError,
    ) as exc:
        raise LLMResponseError(
            "Ollama returned an invalid structured skill response."
        ) from exc


def normalize_skill_name(skill_name: str) -> str:
    """Normalize a skill name for consistent storage."""
    return " ".join(skill_name.strip().lower().split())


def normalize_extracted_skills(
    extraction: SkillExtractionResponse,
) -> SkillExtractionResponse:
    """Normalize skill names and remove invalid or duplicate skills."""
    normalized_skills: list[ExtractedSkill] = []
    seen: set[str] = set()

    for skill in extraction.skills:
        normalized_name = normalize_skill_name(skill.name)

        if not normalized_name:
            continue

        if len(normalized_name) > MAX_SKILL_NAME_LENGTH:
            continue

        if normalized_name in seen:
            continue

        seen.add(normalized_name)

        normalized_skills.append(
            ExtractedSkill(
                name=normalized_name,
                category=skill.category,
            )
        )

    return SkillExtractionResponse(
        skills=normalized_skills
    )