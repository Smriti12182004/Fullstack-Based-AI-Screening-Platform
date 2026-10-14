from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


AssessmentHRInboxReviewStatus = Literal["approved"]


class AssessmentHRInboxItem(BaseModel):
    assessment_set_id: int
    assessment_id: int | None = None
    job_id: int
    job_title: str
    question_set_id: int
    title: str
    label: str
    variant_number: int
    assessment_status: str | None = None
    review_status: AssessmentHRInboxReviewStatus
    sent_to_hr: bool
    sent_to_hr_at: datetime | None = None
    question_count: int = Field(ge=0)
    duration_minutes: int | None = Field(
        default=None,
        ge=1,
    )


class AssessmentHRInboxResponse(BaseModel):
    items: list[AssessmentHRInboxItem]