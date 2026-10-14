from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AssessmentAssignmentStatus = Literal[
    "assigned",
    "in_progress",
    "completed",
    "expired",
    "cancelled",
]


class AssessmentAssignmentCreateRequest(BaseModel):
    candidate_id: int = Field(gt=0)
    opens_at: datetime
    closes_at: datetime


class AssessmentAssignmentResponse(BaseModel):
    id: int
    assessment_id: int
    candidate_id: int
    assigned_by: int
    status: AssessmentAssignmentStatus
    opens_at: datetime
    closes_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssessmentAssignmentListResponse(BaseModel):
    items: list[AssessmentAssignmentResponse]