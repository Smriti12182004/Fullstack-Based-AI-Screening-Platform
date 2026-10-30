from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, PositiveInt


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
    workflow_status: Literal[
        "pending",
        "in_progress",
        "completed",
    ] = "pending"

    model_config = ConfigDict(
        from_attributes=True,
    )


class BulkJobDeleteRequest(BaseModel):
    """Request for deleting up to 100 recruiter-owned jobs."""

    job_ids: list[PositiveInt] = Field(
        min_length=1,
        max_length=100,
        description="Positive job IDs. Duplicate IDs are ignored.",
    )


class BulkJobDeleteFailure(BaseModel):
    """A job that could not be deleted."""

    job_id: PositiveInt
    reason: Literal["not_found", "blocked", "error"]
    detail: str


class BulkJobDeleteResponse(BaseModel):
    """Per-job results; successful and failed deletions can coexist."""

    requested_count: int = Field(ge=1)
    deleted_ids: list[PositiveInt] = Field(default_factory=list)
    failures: list[BulkJobDeleteFailure] = Field(default_factory=list)


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
    review_category: Literal["technical", "non_technical"] = "technical"
    is_mandatory: bool = True


class SkillExtractionResponseSchema(BaseModel):
    job_id: int
    skills: list[SkillExtractionSchema]
    experience_required: str | None


class SkillReviewSkillSchema(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=100,
    )
    category: Literal["technical", "non_technical"] = "technical"
    is_mandatory: bool = True


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