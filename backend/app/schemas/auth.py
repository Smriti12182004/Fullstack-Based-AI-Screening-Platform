
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_]+$",
    )
    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=128,
    )
    role: str = Field(
        min_length=1,
        max_length=50,
    )


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp: str = Field(
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
    )


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class CandidateInvitationActivationRequest(BaseModel):
    token: str = Field(
        min_length=20,
        max_length=200,
    )
    password: str = Field(
        min_length=8,
        max_length=128,
    )


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=100,
    )
    username: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
        pattern=r"^[a-zA-Z0-9_]+$",
    )
    phone_number: str | None = Field(
        default=None,
        max_length=30,
    )
    job_title: str | None = Field(
        default=None,
        max_length=100,
    )
    department: str | None = Field(
        default=None,
        max_length=100,
    )
    location: str | None = Field(
        default=None,
        max_length=120,
    )
    bio: str | None = Field(
        default=None,
        max_length=500,
    )
