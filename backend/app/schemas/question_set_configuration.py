from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionSetConfigurationCreate(BaseModel):
    total_questions: int = Field(gt=0)
    duration_minutes: int = Field(gt=0)
    candidate_instructions: str | None = Field(
        default=None,
        max_length=5000,
    )


class QuestionSetConfigurationResponse(BaseModel):
    id: int
    question_set_id: int
    total_questions: int
    duration_minutes: int
    candidate_instructions: str | None

    section_question_count: int
    easy_count: int
    medium_count: int
    hard_count: int

    warnings: list[str]

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)