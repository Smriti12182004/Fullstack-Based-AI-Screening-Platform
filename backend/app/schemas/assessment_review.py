from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AssessmentReviewChecklist(BaseModel):
    question_quality: bool = False
    answer_keys_verified: bool = False
    skill_mapping_verified: bool = False
    difficulty_verified: bool = False
    blueprint_compliance: bool = False
    duplicate_check: bool = False
    candidate_instructions_verified: bool = False


class AssessmentReviewDecisionRequest(BaseModel):
    comment: str | None = Field(
        default=None,
        max_length=5000,
    )

    checklist: AssessmentReviewChecklist = Field(
        default_factory=AssessmentReviewChecklist
    )


class AssessmentReviewQueueItem(BaseModel):
    id: int
    job_id: int
    question_set_id: int | None
    variant_number: int | None
    title: str
    status: str
    review_status: str
    created_at: datetime
    question_count: int

    model_config = ConfigDict(
        from_attributes=True,
    )


class AssessmentReviewQuestion(BaseModel):
    id: int
    question_id: int
    display_order: int
    question_text: str
    question_type: str
    skill_id: int
    difficulty: str
    options: list[str] | None
    correct_answer: str | None
    explanation: str | None

    model_config = ConfigDict(
        from_attributes=True,
    )


class AssessmentReviewConfiguration(BaseModel):
    total_questions: int
    duration_minutes: int
    candidate_instructions: str | None


class AssessmentReviewPackage(BaseModel):
    assessment_id: int
    job_id: int
    question_set_id: int | None
    variant_number: int | None
    title: str
    status: str
    review_status: str
    reviewer_id: int | None
    reviewed_at: datetime | None
    review_comment: str | None
    review_checklist: AssessmentReviewChecklist
    configuration: AssessmentReviewConfiguration | None
    questions: list[AssessmentReviewQuestion]


class AssessmentSetReviewVariant(BaseModel):
    id: int
    variant_number: int
    label: str
    status: str
    question_count: int
    pending_review_count: int
    approved_count: int
    is_openable: bool
    lock_reason: str | None


class AssessmentSetReviewQueueItem(BaseModel):
    id: int
    job_id: int
    job_title: str
    question_set_id: int
    variant_number: int
    title: str
    label: str
    status: str
    created_at: datetime
    question_count: int
    pending_review_count: int
    approved_count: int
    assessment_sets: list[AssessmentSetReviewVariant]

    model_config = ConfigDict(
        from_attributes=True,
    )


class AssessmentSetReviewQuestion(BaseModel):
    slot_id: int
    section_id: int
    section_name: str | None
    skill_id: int
    skill_name: str | None
    section_type: str
    difficulty: str
    slot_number: int
    preferred_question_type: str
    question_id: int | None
    question_text: str | None
    question_type: str | None
    options: list[str] | None
    correct_answer: str | None
    explanation: str | None
    status: str
    source: str | None
    version: int | None
    manager_rating: float | None
    reviewer_rating: float | None
    rejection_reason: str | None
    created_at: datetime | None
    updated_at: datetime | None


class AssessmentSetReviewJob(BaseModel):
    id: int
    title: str
    description: str


class AssessmentSetReviewQuestionSet(BaseModel):
    id: int
    name: str
    description: str | None
    hiring_year: int | None
    hiring_cycle: str | None
    variant_count: int
    status: str


class AssessmentSetReviewSummary(BaseModel):
    total_slots: int
    filled_slots: int
    remaining_slots: int
    pending_review: int
    approved: int
    rejected: int


class AssessmentSetReviewHRContact(BaseModel):
    id: int
    name: str
    email: str


class AssessmentSetHRHandoffRequest(BaseModel):
    hr_user_id: int = Field(gt=0)


class AssessmentSetReviewPackage(BaseModel):
    assessment_set_id: int
    job_id: int
    question_set_id: int
    variant_number: int
    label: str
    title: str
    status: str
    review_status: str
    reviewer_id: int | None
    reviewed_at: datetime | None
    hr_contact: AssessmentSetReviewHRContact | None = None

    # Keep HR handoff state in the completed-review API response.
    sent_to_hr: bool = False
    sent_to_hr_by: int | None = None
    sent_to_hr_at: datetime | None = None

    review_comment: str | None
    review_checklist: AssessmentReviewChecklist
    job: AssessmentSetReviewJob | None
    question_set: AssessmentSetReviewQuestionSet
    configuration: AssessmentReviewConfiguration | None
    summary: AssessmentSetReviewSummary
    questions: list[AssessmentSetReviewQuestion]
    slots: list[AssessmentSetReviewQuestion]