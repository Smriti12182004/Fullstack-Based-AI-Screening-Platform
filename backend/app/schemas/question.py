from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QuestionType = Literal["MCQ", "FREE_TEXT"]
Difficulty = Literal["easy", "medium", "hard"]
SectionType = Literal["conceptual", "implementation", "free_text"]


class QuestionBase(BaseModel):
    question_text: str = Field(min_length=1)
    question_type: QuestionType
    # Backward-compatible: older callers may omit section_type.
    # The service then infers conceptual for MCQ and free_text for FREE_TEXT.
    section_type: SectionType | None = None
    skill_id: int = Field(gt=0)
    difficulty: Difficulty
    options: list[str] | None = None
    correct_answer: str | None = None


class QuestionCreate(QuestionBase):
    question_bank_id: int | None = Field(default=None, gt=0)


class QuestionUpdate(BaseModel):
    question_text: str | None = Field(default=None, min_length=1)
    question_type: QuestionType | None = None
    section_type: SectionType | None = None
    skill_id: int | None = Field(default=None, gt=0)
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
    question_bank_id: int | None = None
    status: str
    source: str
    explanation: str | None = None
    rejection_reason: str | None = None
    created_by: int | None = None
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionVersionResponse(BaseModel):
    id: int
    question_id: int
    version: int
    question_text: str
    question_type: QuestionType
    section_type: SectionType
    skill_id: int
    difficulty: Difficulty
    options: list[str] | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    source: str
    changed_by: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QuestionGenerationRequest(BaseModel):
    job_id: int = Field(gt=0)
    skill_ids: list[int] | None = None
    generation_mode: Literal[
        "job_description", "selected_skills", "custom_topic"
    ] | None = None
    custom_topic: str | None = Field(default=None, max_length=500)
    number_of_questions: int = Field(default=5, ge=1, le=20)
    difficulty: Difficulty = "medium"
    section_type: SectionType = "conceptual"
    hiring_year: int | None = Field(default=None, ge=2020, le=2100)


class QuestionGenerationResponse(BaseModel):
    job_id: int
    hiring_year: int
    number_requested: int
    generated_count: int
    questions: list[QuestionResponse]
