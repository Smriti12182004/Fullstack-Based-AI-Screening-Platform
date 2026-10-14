from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Difficulty = Literal["easy", "medium", "hard"]
SectionType = Literal["conceptual", "implementation", "free_text"]
QuestionType = Literal["MCQ", "FREE_TEXT"]


class ManualQuestionRequest(BaseModel):
    question_text: str = Field(min_length=1, max_length=1000)
    question_type: QuestionType
    options: list[str] = Field(default_factory=list)
    correct_answer: str | None = None
    explanation: str | None = Field(default=None, max_length=2000)


class QuestionRatingRequest(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=3)


class GenerationAttemptResponse(BaseModel):
    id: int
    question_slot_id: int
    attempt_number: int
    status: str
    question_text: str | None
    question_type: str | None
    section_type: str | None
    skill_id: int | None
    difficulty: str | None
    options: list[str] | None
    correct_answer: str | None
    explanation: str | None
    provider: str | None
    model_name: str | None
    request_id: str | None
    validation_status: str | None
    validation_errors: list[str] | None
    error_message: str | None
    candidate_question_id: int | None
    previous_question_id: int | None
    created_at: datetime
    completed_at: datetime | None
    accepted_at: datetime | None
    restored_at: datetime | None

    class Config:
        from_attributes = True


class EditQuestionRequest(BaseModel):
    question_text: str = Field(min_length=1, max_length=1000)
    question_type: QuestionType
    options: list[str] = Field(default_factory=list)
    correct_answer: str | None = None
    explanation: str | None = Field(default=None, max_length=2000)
