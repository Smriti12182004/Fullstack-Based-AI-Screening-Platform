from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionSectionCreate(BaseModel):
    question_id: int = Field(gt=0)
    section_id: int = Field(gt=0)


class QuestionSectionResponse(BaseModel):
    id: int
    question_id: int
    section_id: int
    display_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)