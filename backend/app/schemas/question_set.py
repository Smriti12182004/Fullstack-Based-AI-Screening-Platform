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

    hiring_year: int = Field(
        ge=2020,
        le=2100,
    )

    hiring_cycle: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
    )

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )

    description: str | None = Field(
        default=None,
        max_length=5000,
    )

    # One blueprint creates Set A + Set B only.
    variant_count: int = Field(
        default=2,
        ge=2,
        le=2,
    )


class QuestionSetResponse(BaseModel):
    id: int

    job_id: int

    name: str

    description: str | None

    hiring_year: int | None

    hiring_cycle: str | None

    variant_count: int

    status: QuestionSetStatus

    version: int

    created_by: int

    reviewed_by: int | None

    reviewed_at: datetime | None

    rejection_reason: str | None

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )
