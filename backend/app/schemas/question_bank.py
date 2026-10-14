from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionBankCreate(BaseModel):
    job_id: int = Field(
        gt=0,
    )

    hiring_year: int = Field(
        ge=2020,
        le=2100,
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


class QuestionBankResponse(BaseModel):
    id: int

    job_id: int

    hiring_year: int

    name: str

    description: str | None = None

    status: str

    created_by: int | None = None

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )