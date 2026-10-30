
from datetime import timedelta, timezone

import hashlib

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from io import BytesIO
from pathlib import Path
from fastapi import File, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from html import escape
from sqlalchemy import MetaData, Table, inspect as sqlalchemy_inspect, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.roles import VALID_ROLES
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
    ProfileUpdateRequest,
    RegisterRequest,
    ResendVerificationRequest,
    VerifyEmailRequest,
    CandidateInvitationActivationRequest,
)
from app.services.email_service import (
    EmailServiceError,
    send_verification_email,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


# PROFILE_PHOTO_BEGIN
# Store resized images outside the source tree, keyed by authenticated user ID.
PROFILE_PHOTO_DIR = (
    Path(__file__).resolve().parents[3] / "uploads" / "profile_photos"
)
MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024


def _profile_photo_path(user_id: int) -> Path:
    return PROFILE_PHOTO_DIR / f"{user_id}.webp"
# PROFILE_PHOTO_END


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


@router.get(
    "/activate-candidate-invitation-page",
    response_class=HTMLResponse,
)
def candidate_invitation_activation_page():
    """Render password setup; a one-time token is passed in the URL fragment, not the request."""
    frontend_login = escape(
        f"{settings.frontend_base_url.rstrip('/')}/login",
        quote=True,
    )

    html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Activate your Evalyn account</title>
<style>body{{margin:0;padding:24px;background:#f7f8fc;font-family:Arial,Helvetica,sans-serif;color:#26284f}}main{{max-width:520px;margin:7vh auto;background:#fff;border:1px solid #e1e4eb;border-radius:22px;padding:32px;box-shadow:0 18px 50px rgba(38,40,79,.08)}}label{{display:block;font-weight:700;font-size:13px;margin:16px 0 7px}}input{{width:100%;box-sizing:border-box;border:1px solid #dce0e8;border-radius:10px;padding:12px;font-size:15px}}button{{width:100%;margin-top:22px;border:0;border-radius:10px;padding:13px;background:#5658e8;color:#fff;font-weight:700;font-size:15px;cursor:pointer}}button:disabled{{opacity:.6;cursor:not-allowed}}.muted{{color:#667085;font-size:14px;line-height:1.6}}#status{{margin-top:16px;font-size:14px;line-height:1.6}}a{{color:#5658e8;font-weight:700}}</style></head>
<body><main><div style="font-size:11px;letter-spacing:.14em;font-weight:700;color:#5658e8">EVALYN · ACCOUNT ACTIVATION</div><h1 style="margin-bottom:8px">Set your password</h1><p class="muted">Choose a password to activate your Evalyn account and verify this email address.</p>
<form id="activation-form"><label for="password">New password</label><input id="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><label for="confirm-password">Confirm password</label><input id="confirm-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><button id="submit-button" type="submit">Activate account</button></form><p id="status" role="status" class="muted"></p><p id="login-row" style="display:none"><a href="{frontend_login}">Continue to Evalyn login</a></p></main>
<script>const form=document.getElementById('activation-form');const statusNode=document.getElementById('status');const submitButton=document.getElementById('submit-button');const token=new URLSearchParams(window.location.hash.slice(1)).get('token')||'';if(token){{window.history.replaceState(null,'',window.location.pathname);}}else{{statusNode.textContent='This setup link is missing its token. Open the complete link from your invitation email.';submitButton.disabled=true;}}form.addEventListener('submit',async(event)=>{{event.preventDefault();statusNode.textContent='';const password=document.getElementById('password').value;const confirmPassword=document.getElementById('confirm-password').value;if(password!==confirmPassword){{statusNode.textContent='The passwords do not match.';return;}}if(!token){{statusNode.textContent='This setup link is invalid. Ask HR to send a new invitation.';return;}}submitButton.disabled=true;submitButton.textContent='Activating…';try{{const response=await fetch(new URL('activate-candidate-invitation',window.location.href).toString(),{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{token,password}})}});const data=await response.json();if(!response.ok)throw new Error(data.detail||'Unable to activate the account.');form.style.display='none';statusNode.textContent='Your account is active and your email is verified. You can now sign in to Evalyn.';document.getElementById('login-row').style.display='block';}}catch(error){{statusNode.textContent=error.message||'Unable to activate the account.';submitButton.disabled=false;submitButton.textContent='Activate account';}}}});</script></body></html>'''

    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/activate-candidate-invitation")
def activate_candidate_invitation(
    credentials: CandidateInvitationActivationRequest,
    db: Session = Depends(get_db),
):
    """Consume a single-use HR invitation, set the candidate password, verify email."""
    token_hash = hashlib.sha256(
        credentials.token.encode("utf-8")
    ).hexdigest()

    candidate = (
        db.query(User)
        .filter(User.invitation_token_hash == token_hash)
        .with_for_update()
        .one_or_none()
    )

    if (
        candidate is None
        or candidate.role not in VALID_ROLES
        or candidate.is_email_verified
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This account activation link is invalid "
                "or has already been used."
            ),
        )

    expires_at = candidate.invitation_token_expires_at
    now = utc_now()

    if (
        expires_at is not None
        and (
            expires_at.tzinfo is None
            or expires_at.utcoffset() is None
        )
    ):
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if (
        expires_at is None
        or expires_at.astimezone(timezone.utc)
        <= now.astimezone(timezone.utc)
    ):
        candidate.invitation_token_hash = None
        candidate.invitation_token_expires_at = None
        candidate.invitation_token_sent_at = None
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=(
                "This account activation link has expired. "
                "Ask HR to send a new invitation."
            ),
        )

    candidate.password_hash = hash_password(credentials.password)
    candidate.is_email_verified = True
    candidate.invitation_token_hash = None
    candidate.invitation_token_expires_at = None
    candidate.invitation_token_sent_at = None
    candidate.verification_otp_hash = None
    candidate.verification_otp_expires_at = None
    candidate.verification_otp_sent_at = None
    candidate.verification_otp_attempts = 0

    db.commit()
    db.refresh(candidate)

    return {
        "message": (
            "Account activated and email verified successfully."
        ),
        "user_id": candidate.id,
        "username": candidate.username,
        "full_name": candidate.full_name,
        "email": candidate.email,
        "role": candidate.role,
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
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
    }


def _profile_response(user: User) -> dict:
    return {
        "user_id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "phone_number": user.phone_number,
        "job_title": user.job_title,
        "department": user.department,
        "location": user.location,
        "bio": user.bio,
        "email": user.email,
        "role": user.role,
        "has_profile_photo": _profile_photo_path(user.id).is_file(),
    }


@router.get("/me")
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user = db.get(User, current_user["user_id"])
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return _profile_response(user)


@router.patch("/me")
def update_my_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user = db.get(User, current_user["user_id"])
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    changes = {
        key: value
        for key, value in payload.model_dump(exclude_unset=True).items()
        if value is not None
    }
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one profile field to update.",
        )

    if "full_name" in changes:
        clean_name = " ".join(changes["full_name"].split())
        if len(clean_name) < 2 or len(clean_name) > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Full name must contain 2 to 100 characters.",
            )
        user.full_name = clean_name

    if "username" in changes:
        clean_username = changes["username"].strip()
        existing_username = (
            db.query(User.id)
            .filter(
                User.username == clean_username,
                User.id != user.id,
            )
            .first()
        )
        if existing_username is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username is already taken.",
            )
        user.username = clean_username

    optional_text_limits = {
        "phone_number": 30,
        "job_title": 100,
        "department": 100,
        "location": 120,
        "bio": 500,
    }
    for field_name, max_length in optional_text_limits.items():
        if field_name not in changes:
            continue

        # Empty form values clear an optional field. Omitted fields are not
        # present in `changes`, so they retain their existing stored values.
        clean_value = changes[field_name].strip()
        if len(clean_value) > max_length:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"{field_name.replace('_', ' ').capitalize()} "
                    f"must be {max_length} characters or fewer."
                ),
            )
        setattr(user, field_name, clean_value or None)

    # Email and role are deliberately not writable through this endpoint.
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile changes conflict with an existing account.",
        ) from exc

    return _profile_response(user)



@router.delete("/me")
def delete_my_account(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Delete the authenticated user's account when safe to do so."""
    user_id = current_user["user_id"]
    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Your account could not be found.",
        )

    if user.role == "organization_admin":
        admin_count = (
            db.query(User)
            .filter(User.role == "organization_admin")
            .count()
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This is the last organization administrator. "
                    "Assign another organization administrator before "
                    "deleting this account."
                ),
            )

    try:
        # Inspect actual database foreign keys. Preserve historical records:
        # block deletion when a related record would be broken or cascaded.
        bind = db.get_bind()
        inspector = sqlalchemy_inspect(bind)
        metadata = MetaData()
        dependent_tables = set()

        for table_name in inspector.get_table_names():
            for foreign_key in inspector.get_foreign_keys(table_name):
                if foreign_key.get("referred_table") != User.__tablename__:
                    continue

                options = foreign_key.get("options") or {}
                ondelete = str(options.get("ondelete") or "").upper()

                # References explicitly configured to become NULL are safe.
                if ondelete == "SET NULL":
                    continue

                local_columns = foreign_key.get("constrained_columns") or []
                remote_columns = foreign_key.get("referred_columns") or []

                if "id" not in remote_columns:
                    continue

                table = metadata.tables.get(table_name)
                if table is None:
                    table = Table(table_name, metadata, autoload_with=bind)

                for local_column, remote_column in zip(
                    local_columns, remote_columns
                ):
                    if remote_column != "id":
                        continue

                    statement = (
                        select(table.c[local_column])
                        .where(table.c[local_column] == user_id)
                        .limit(1)
                    )
                    if db.execute(statement).first():
                        dependent_tables.add(table_name)
                        break

        if dependent_tables:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This account is linked to existing records. "
                    "Deletion was blocked to preserve assessment, access, "
                    "and audit history. Contact your organization "
                    "administrator to resolve the linked records."
                ),
            )

        photo_path = _profile_photo_path(user_id)
        db.delete(user)
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This account has linked records and cannot be deleted. "
                "No deletion was committed."
            ),
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete your account. No deletion was committed.",
        ) from exc

    try:
        photo_path.unlink(missing_ok=True)
    except OSError:
        # The account is already deleted; a leftover photo can be cleaned up
        # separately and must not turn a successful deletion into an error.
        pass

    return {
        "message": "Your account was deleted successfully.",
        "id": user_id,
    }


@router.get("/me/avatar")
def get_my_profile_avatar(
    current_user: dict = Depends(get_current_user),
):
    """Return only the signed-in user's profile photo."""
    photo_path = _profile_photo_path(current_user["user_id"])
    if not photo_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile photo has been uploaded.",
        )

    return FileResponse(
        photo_path,
        media_type="image/webp",
        headers={"Cache-Control": "private, no-store"},
    )


@router.post("/me/avatar")
async def upload_my_profile_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Validate, resize, and save the signed-in user's profile photo."""
    content = await file.read(MAX_PROFILE_PHOTO_BYTES + 1)
    await file.close()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose an image to upload.",
        )

    if len(content) > MAX_PROFILE_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Profile photos must be 5 MB or smaller.",
        )

    try:
        from io import BytesIO

        with Image.open(BytesIO(content)) as original:
            original.load()
            normalized = ImageOps.exif_transpose(original).convert("RGB")
            normalized.thumbnail((512, 512))

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The selected file is not a supported image.",
        ) from exc

    photo_path = _profile_photo_path(current_user["user_id"])
    temporary_path = photo_path.with_name(
        f"{photo_path.stem}.uploading.webp"
    )

    try:
        PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)
        normalized.save(
            temporary_path,
            format="WEBP",
            quality=88,
            method=6,
        )
        temporary_path.replace(photo_path)
    except OSError as exc:
        temporary_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save the profile photo.",
        ) from exc

    return {"has_profile_photo": True}


@router.delete("/me/avatar")
def delete_my_profile_avatar(
    current_user: dict = Depends(get_current_user),
):
    """Remove only the signed-in user's profile photo."""
    photo_path = _profile_photo_path(current_user["user_id"])
    photo_path.unlink(missing_ok=True)
    return {"has_profile_photo": False}


@router.post("/logout")
def logout():
    return {
        "message": "Logout successful. Please discard the access token."
    }
