from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Difficulty = Literal["easy", "medium", "hard"]
SectionType = Literal["conceptual", "implementation", "free_text"]


class SectionSkillAllocationCreate(BaseModel):
    skill_id: int = Field(gt=0)
    easy_count: int = Field(default=0, ge=0)
    medium_count: int = Field(default=0, ge=0)
    hard_count: int = Field(default=0, ge=0)
    question_count: int | None = Field(default=None, ge=0)


class SectionCreate(BaseModel):
    question_set_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    section_type: SectionType | None = None
    difficulty: Difficulty | None = None
    display_order: int = Field(ge=1)
    skills: list[SectionSkillAllocationCreate] = Field(min_length=1)


class SectionUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    section_type: SectionType
    display_order: int = Field(ge=1)
    skills: list[SectionSkillAllocationCreate] = Field(min_length=1)


class SectionSkillResponse(BaseModel):
    id: int
    skill_id: int
    easy_count: int
    medium_count: int
    hard_count: int
    question_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SectionResponse(BaseModel):
    id: int
    question_set_id: int
    name: str
    section_type: SectionType
    difficulty: Difficulty
    display_order: int
    is_locked: bool
    skills: list[SectionSkillResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
