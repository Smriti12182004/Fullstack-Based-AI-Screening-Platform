from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class JobCreate(BaseModel):
    title: str = Field(
        ...,
        min_length=3,
        max_length=255,
    )
    description: str = Field(
        ...,
        min_length=20,
    )


class JobResponse(BaseModel):
    id: int
    title: str
    description: str
    created_by: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ExtractedSkillResponse(BaseModel):
    name: str
    category: str


class SkillExtractionResponseSchema(BaseModel):
    job_id: int
    skills: list[ExtractedSkillResponse]