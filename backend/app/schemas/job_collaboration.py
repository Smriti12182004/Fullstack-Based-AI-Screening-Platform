from pydantic import BaseModel, ConfigDict, Field


class CollaboratorUserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str

    model_config = ConfigDict(from_attributes=True)


class JobCollaborationUpdateRequest(BaseModel):
    assessment_manager_id: int = Field(gt=0)
    assessment_reviewer_id: int = Field(gt=0)


class JobCollaborationResponse(BaseModel):
    job_id: int
    assessment_manager: CollaboratorUserResponse | None = None
    assessment_reviewer: CollaboratorUserResponse | None = None