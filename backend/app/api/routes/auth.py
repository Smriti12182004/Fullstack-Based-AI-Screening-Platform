from datetime import timedelta

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.db.timestamps import utc_now
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    ResendVerificationRequest,
    VerifyEmailRequest,
)
from app.services.email_service import (
    EmailServiceError,
    send_verification_email,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
)
def register(
    credentials: RegisterRequest,
    db: Session = Depends(get_db),
):
    existing_username = (
        db.query(User)
        .filter(User.username == credentials.username)
        .first()
    )

    if existing_username is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken.",
        )

    existing_email = (
        db.query(User)
        .filter(User.email == credentials.email)
        .first()
    )

    if existing_email is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered.",
        )

    verification_otp = str(
        secrets.randbelow(900000) + 100000
    )

    verification_otp_hash = hash_password(
        verification_otp
    )

    now = utc_now()

    verification_otp_expires_at = (
        now + timedelta(minutes=1)
    )

    new_user = User(
        username=credentials.username,
        email=credentials.email,
        password_hash=hash_password(credentials.password),

        # Public registration creates Candidate accounts only.
        # Internal roles are assigned through controlled
        # organization user-management workflows.
        role="candidate",

        is_email_verified=False,
        verification_otp_hash=verification_otp_hash,
        verification_otp_expires_at=verification_otp_expires_at,
        verification_otp_sent_at=now,
        verification_otp_attempts=0,
    )

    try:
        send_verification_email(
            to_email=new_user.email,
            candidate_name=new_user.username,
            otp=verification_otp,
        )

    except EmailServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send verification email.",
        ) from exc

    db.add(new_user)

    try:
        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email is already registered.",
        )

    return {
        "message": (
            "Registration successful. "
            "A verification OTP has been sent to your email."
        ),
        "user_id": new_user.id,
        "username": new_user.username,
        "email": new_user.email,
        "role": new_user.role,
    }


@router.post("/verify-email")
def verify_email(
    credentials: VerifyEmailRequest,
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == credentials.email)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified.",
        )

    if (
        user.verification_otp_hash is None
        or user.verification_otp_expires_at is None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active verification OTP found.",
        )

    if utc_now() > user.verification_otp_expires_at:
        user.verification_otp_hash = None
        user.verification_otp_expires_at = None
        user.verification_otp_sent_at = None
        user.verification_otp_attempts = 0

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification OTP has expired.",
        )

    if not verify_password(
        credentials.otp,
        user.verification_otp_hash,
    ):
        user.verification_otp_attempts += 1

        if user.verification_otp_attempts >= 5:
            user.verification_otp_hash = None
            user.verification_otp_expires_at = None
            user.verification_otp_sent_at = None
            user.verification_otp_attempts = 0

            db.commit()

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Too many invalid OTP attempts. "
                    "Please request a new verification OTP."
                ),
            )

        db.commit()

        remaining_attempts = (
            5 - user.verification_otp_attempts
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid verification OTP. "
                f"{remaining_attempts} attempts remaining."
            ),
        )

    user.is_email_verified = True
    user.verification_otp_hash = None
    user.verification_otp_expires_at = None
    user.verification_otp_sent_at = None
    user.verification_otp_attempts = 0

    db.commit()
    db.refresh(user)

    return {
        "message": "Email verified successfully.",
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
    }


@router.post("/resend-verification-otp")
def resend_verification_otp(
    credentials: ResendVerificationRequest,
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == credentials.email)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified.",
        )

    now = utc_now()

    if user.verification_otp_sent_at is not None:
        cooldown_ends_at = (
            user.verification_otp_sent_at
            + timedelta(seconds=30)
        )

        if now < cooldown_ends_at:
            remaining_seconds = int(
                (cooldown_ends_at - now).total_seconds()
            ) + 1

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Please wait "
                    f"{remaining_seconds} seconds "
                    "before requesting another OTP."
                ),
            )

    verification_otp = str(
        secrets.randbelow(900000) + 100000
    )

    verification_otp_hash = hash_password(
        verification_otp
    )

    verification_otp_expires_at = (
        now + timedelta(minutes=1)
    )

    try:
        send_verification_email(
            to_email=user.email,
            candidate_name=user.username,
            otp=verification_otp,
        )

    except EmailServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send verification email.",
        ) from exc

    user.verification_otp_hash = verification_otp_hash
    user.verification_otp_expires_at = verification_otp_expires_at
    user.verification_otp_sent_at = now
    user.verification_otp_attempts = 0

    try:
        db.commit()
        db.refresh(user)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update verification code.",
        )

    return {
        "message": (
            "A new verification OTP has been sent to your email."
        )
    }


@router.post("/login")
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == credentials.email)
        .first()
    )

    if user is None or not verify_password(
        credentials.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in.",
        )

    access_token = create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
    }


@router.post("/logout")
def logout():
    return {
        "message": "Logout successful. Please discard the access token."
    }