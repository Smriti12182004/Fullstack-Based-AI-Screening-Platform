from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QuestionType = Literal["MCQ", "FREE_TEXT"]
Difficulty = Literal["easy", "medium", "hard"]


class QuestionBase(BaseModel):
    question_text: str = Field(min_length=1)
    question_type: QuestionType
    skill_id: int
    difficulty: Difficulty
    options: list[str] | None = None
    correct_answer: str | None = None


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    question_text: str | None = Field(default=None, min_length=1)
    question_type: QuestionType | None = None
    skill_id: int | None = None
    difficulty: Difficulty | None = None
    options: list[str] | None = None
    correct_answer: str | None = None


class QuestionResponse(QuestionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)