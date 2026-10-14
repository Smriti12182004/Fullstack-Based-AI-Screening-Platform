from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AssessmentStatus = Literal[
    "draft",
    "ready",
    "published",
]


AssessmentReviewStatus = Literal[
    "pending",
    "approved",
    "rejected",
]


class AssessmentAssemblyRequest(BaseModel):
    question_set_id: int = Field(gt=0)
    title: str = Field(
        min_length=1,
        max_length=255,
    )
    variant_number: int | None = Field(
        default=None,
        ge=1,
        le=10,
    )


class AssessmentVariantsAssemblyRequest(BaseModel):
    question_set_id: int = Field(gt=0)
    title: str = Field(
        min_length=1,
        max_length=255,
    )


class AssessmentAssignmentRequest(BaseModel):
    candidate_id: int = Field(gt=0)


class AssessmentResponse(BaseModel):
    id: int
    job_id: int
    question_set_id: int | None
    variant_number: int | None
    title: str
    status: AssessmentStatus

    review_status: AssessmentReviewStatus
    reviewer_id: int | None
    reviewed_at: datetime | None
    review_comment: str | None
    review_checklist: dict = Field(
        default_factory=dict,
    )

    model_config = ConfigDict(
        from_attributes=True,
    )