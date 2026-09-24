from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SectionCreate(BaseModel):
    question_set_id: int = Field(gt=0)
    skill_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    display_order: int = Field(ge=1)
    easy_count: int = Field(default=0, ge=0)
    medium_count: int = Field(default=0, ge=0)
    hard_count: int = Field(default=0, ge=0)


class SectionResponse(BaseModel):
    id: int
    question_set_id: int
    skill_id: int
    name: str
    display_order: int
    easy_count: int
    medium_count: int
    hard_count: int
    is_locked: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)