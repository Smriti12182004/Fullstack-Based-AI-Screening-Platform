from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QuestionSetStatus = Literal[
    "draft",
    "under_review",
    "approved",
    "rejected",
    "published",
]


class QuestionSetCreate(BaseModel):
    job_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class QuestionSetResponse(BaseModel):
    id: int
    job_id: int
    name: str
    description: str | None
    status: QuestionSetStatus
    version: int
    created_by: int
    reviewed_by: int | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)