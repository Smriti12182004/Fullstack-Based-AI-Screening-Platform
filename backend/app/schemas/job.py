from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class JobCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=255,
    )
    description: str = Field(
        min_length=20,
    )
    experience_required: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )


class JobResponse(BaseModel):
    id: int
    title: str
    description: str
    experience_required: str | None = None
    created_by: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SkillExtractionSchema(BaseModel):
    name: str
    category: Literal[
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


class SkillExtractionResponseSchema(BaseModel):
    job_id: int
    skills: list[SkillExtractionSchema]
    experience_required: str | None = None


class SkillReviewSkillSchema(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
    )


class SkillReviewUpdateSchema(BaseModel):
    skills: list[SkillReviewSkillSchema]


class SkillReviewResponseSchema(BaseModel):
    job_id: int
    status: Literal["pending", "confirmed"]
    skills: list[SkillReviewSkillSchema]
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None


class SkillReviewConfirmResponseSchema(BaseModel):
    job_id: int
    status: Literal["confirmed"]
    skills: list[SkillReviewSkillSchema]
    reviewed_by: int
    reviewed_at: datetime


# ---------------------------------------------------------
# Job Description Generation
# ---------------------------------------------------------


class JobDescriptionGenerationRequest(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=255,
    )
    skills: list[str] = Field(
        min_length=1,
        max_length=50,
    )
    experience_required: str = Field(
        min_length=1,
        max_length=100,
    )
    max_words: int = Field(
        default=300,
        ge=50,
        le=2000,
    )
    output_format: Literal[
        "paragraphs",
        "bullets",
        "mixed",
    ] = "mixed"
    additional_instructions: str | None = Field(
        default=None,
        max_length=1000,
    )


class JobDescriptionGenerationResponse(BaseModel):
    title: str
    description: str
    word_count: int