from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AssessmentStatus = Literal[
    "draft",
    "ready",
    "published",
]


class AssessmentAssemblyRequest(BaseModel):
    question_set_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=255)


class AssessmentResponse(BaseModel):
    id: int
    job_id: int
    title: str
    status: AssessmentStatus

    model_config = ConfigDict(from_attributes=True)