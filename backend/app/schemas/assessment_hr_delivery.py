from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


HRDeliveryAssignmentStatus = Literal[
    "assigned",
    "in_progress",
    "completed",
    "expired",
    "cancelled",
]
HRCandidateAccountStatus = Literal["verified", "pending_activation"]


class HRCandidateOption(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    email: EmailStr
    is_email_verified: bool
    account_status: HRCandidateAccountStatus
    can_revoke_invitation: bool = False


class HRCandidateListResponse(BaseModel):
    items: list[HRCandidateOption]
    limit: int = 100


class HRCandidateCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Enter the candidate's full name.")
        return normalized


class HRCandidateCreateResponse(BaseModel):
    candidate: HRCandidateOption
    message: str


class HRCandidateInvitationRevokeResponse(BaseModel):
    candidate_id: int
    message: str
    account_status: Literal["invitation_revoked"]


class HRDeliveryActivationRequest(BaseModel):
    """Activate one handed-off assessment for selected candidates."""

    candidate_ids: list[int] = Field(min_length=1, max_length=500)
    opens_at: datetime
    closes_at: datetime

    @field_validator("candidate_ids")
    @classmethod
    def validate_candidate_ids(cls, value: list[int]) -> list[int]:
        if any(candidate_id <= 0 for candidate_id in value):
            raise ValueError("Candidate IDs must be positive integers.")
        if len(set(value)) != len(value):
            raise ValueError("Duplicate candidate IDs are not allowed.")
        return value


class HRDeliveryAddCandidatesRequest(BaseModel):
    """Add candidates to an assessment whose delivery is already active."""

    candidate_ids: list[int] = Field(min_length=1, max_length=500)

    @field_validator("candidate_ids")
    @classmethod
    def validate_candidate_ids(cls, value: list[int]) -> list[int]:
        if any(candidate_id <= 0 for candidate_id in value):
            raise ValueError("Candidate IDs must be positive integers.")
        if len(set(value)) != len(value):
            raise ValueError("Duplicate candidate IDs are not allowed.")
        return value


class HRDeliveryAssignmentResponse(BaseModel):
    id: int
    assessment_id: int
    candidate_id: int
    assigned_by: int
    status: HRDeliveryAssignmentStatus
    opens_at: datetime
    closes_at: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HRDeliveryActivationResponse(BaseModel):
    assessment_id: int
    assessment_set_id: int
    assessment_status: str
    review_status: str
    opens_at: datetime
    closes_at: datetime
    assignment_count: int
    assignments: list[HRDeliveryAssignmentResponse]
    message: str
    invitation_emails_sent_count: int = 0
    invitation_emails_failed_count: int = 0
    failed_recipients: list[str] = Field(default_factory=list)


class HRAssessmentInvitationResponse(BaseModel):
    assessment_id: int
    invitation_emails_sent_count: int
    invitation_emails_failed_count: int
    failed_recipients: list[str] = Field(default_factory=list)
    message: str


class CandidateInvitationValidationRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class CandidateInvitationValidationResponse(BaseModel):
    assessment_id: int
    assessment_title: str
    job_title: str
    question_count: int
    duration_minutes: int | None = None
    opens_at: datetime
    closes_at: datetime
    window_status: Literal["not_open", "open", "closed"]
    message: str
