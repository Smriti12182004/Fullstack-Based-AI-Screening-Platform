from datetime import datetime

from pydantic import BaseModel, Field
from typing import Literal


class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=20)


class JobResponse(BaseModel):
    id: int
    title: str
    description: str
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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


class SkillReviewSkillSchema(BaseModel):
    name: str = Field(min_length=1, max_length=100)


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