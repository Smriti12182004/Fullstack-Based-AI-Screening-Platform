from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.question import QuestionResponse


QuestionPoolDifficulty = Literal["easy", "medium", "hard"]
QuestionPoolSectionType = Literal["conceptual", "implementation", "free_text"]


class QuestionSetPoolGenerationRequest(BaseModel):
    question_set_id: int = Field(gt=0)


class QuestionSetPoolRequirementResponse(BaseModel):
    section_type: QuestionPoolSectionType
    skill_id: int
    difficulty: QuestionPoolDifficulty
    questions_per_variant: int
    variant_count: int
    required_pool_questions: int
    current_year_approved: int
    historical_approved: int
    legacy_approved: int
    approved_available: int
    pending_review_current_year: int
    generated_count: int
    projected_pool_count: int
    remaining_gap: int
    assembly_ready: bool


class QuestionSetPoolGenerationResponse(BaseModel):
    question_set_id: int
    job_id: int
    hiring_year: int
    variant_count: int
    total_questions_per_variant: int
    total_required_pool_questions: int
    total_approved_available: int
    total_pending_review: int
    total_generated: int
    total_remaining_gap: int
    ready_for_assembly: bool
    requirements: list[QuestionSetPoolRequirementResponse]
    generated_questions: list[QuestionResponse]

    model_config = ConfigDict(from_attributes=True)
