from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QuestionType = Literal["MCQ", "FREE_TEXT"]

Difficulty = Literal["easy", "medium", "hard"]


class QuestionBase(BaseModel):
    question_text: str = Field(
        min_length=1,
    )

    question_type: QuestionType

    skill_id: int

    difficulty: Difficulty

    options: list[str] | None = None

    correct_answer: str | None = None


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    question_text: str | None = Field(
        default=None,
        min_length=1,
    )

    question_type: QuestionType | None = None

    skill_id: int | None = None

    difficulty: Difficulty | None = None

    options: list[str] | None = None

    correct_answer: str | None = None


class QuestionRejectRequest(BaseModel):
    rejection_reason: str = Field(
        min_length=1,
        max_length=5000,
    )


class QuestionResponse(QuestionBase):
    id: int

    status: str

    source: str

    version: int

    explanation: str | None = None

    rejection_reason: str | None = None

    created_by: int | None = None

    reviewed_by: int | None = None

    reviewed_at: datetime | None = None

    created_at: datetime

    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class QuestionVersionResponse(BaseModel):
    id: int

    question_id: int

    version: int

    question_text: str

    question_type: QuestionType

    skill_id: int

    difficulty: Difficulty

    options: list[str] | None = None

    correct_answer: str | None = None

    explanation: str | None = None

    source: str

    changed_by: int | None = None

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class QuestionGenerationRequest(BaseModel):
    job_id: int

    skill_ids: list[int] | None = None

    number_of_questions: int = Field(
        default=5,
        ge=1,
        le=20,
    )

    difficulty: Difficulty = "medium"


class QuestionGenerationResponse(BaseModel):
    job_id: int

    number_requested: int

    generated_count: int

    questions: list[QuestionResponse]