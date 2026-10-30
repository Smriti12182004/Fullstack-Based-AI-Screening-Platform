import hashlib
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import MetaData, Table, inspect as sqlalchemy_inspect, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import require_role
from app.core.security import hash_password
from app.core.roles import VALID_ROLES
from app.db.session import get_db
from app.db.timestamps import utc_now
from app.models.user import User
from app.services.email_service import (
    EmailServiceError,
    send_role_activation_email,
)


router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
)


@router.get("/users")
def get_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("organization_admin")),
):
    users = db.query(User).order_by(User.id).all()

    return [
        {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }
        for user in users
    ]



@router.delete("/users/{user_id}")
def delete_user_account(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("organization_admin")),
):
    """Delete an unreferenced account without destroying linked history."""
    if current_user.get("user_id") == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
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
                detail="The last organization administrator cannot be deleted.",
            )

    try:
        # Inspect real database foreign keys. Block any deletion that would
        # leave dependent history broken or silently cascade-delete records.
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

                # These relationships explicitly permit the reference to be
                # cleared by the database instead of deleting its history.
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
                    "Deletion is blocked to preserve assessment, access, "
                    "and audit history. Remove or archive those records "
                    "through an approved workflow first."
                ),
            )

        deleted_email = user.email
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
                "The account has linked records and cannot be deleted. "
                "No account deletion was committed."
            ),
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the account. No deletion was committed.",
        ) from exc

    return {
        "message": f"Deleted account {deleted_email}.",
        "id": user_id,
    }


class UserRoleUpdateRequest(BaseModel):
    role: str = Field(min_length=1, max_length=50)


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    request: UserRoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("organization_admin")),
):
    if request.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid application role",
        )

    if current_user["user_id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.role = request.role
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "updated_at": user.updated_at,
    }


class InviteUserRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    role: str = Field(min_length=1, max_length=50)


@router.post("/users/invite", status_code=status.HTTP_201_CREATED)
def invite_user(
    request: InviteUserRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("organization_admin")),
):
    """Create a role-assigned account and email its activation link."""
    if request.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid application role",
        )

    clean_name = " ".join(request.full_name.split())
    if len(clean_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid full name.",
        )

    normalized_email = str(request.email).strip().lower()

    existing = (
        db.query(User)
        .filter(User.email.ilike(normalized_email))
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "An account already uses this email address. "
                "Use the existing account or check its invitation status."
            ),
        )

    base_username = re.sub(
        r"[^A-Za-z0-9_]+",
        "_",
        clean_name,
    ).strip("_").lower()
    base_username = re.sub(r"_+", "_", base_username)[:35].strip("_")
    base_username = base_username or "evalyn_user"

    username = None
    for _ in range(10):
        proposed = f"{base_username}_{secrets.token_hex(4)}"[:50]
        if db.query(User.id).filter(User.username == proposed).first() is None:
            username = proposed
            break

    if username is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to generate a unique username. Please retry.",
        )

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = utc_now() + timedelta(days=7)

    invited_user = User(
        username=username,
        full_name=clean_name,
        email=normalized_email,
        password_hash=hash_password(secrets.token_urlsafe(48)),
        role=request.role,
        is_email_verified=False,
        verification_otp_hash=None,
        verification_otp_expires_at=None,
        verification_otp_sent_at=None,
        verification_otp_attempts=0,
        invitation_token_hash=token_hash,
        invitation_token_expires_at=expires_at,
        invitation_token_sent_at=None,
        invitation_created_by=current_user["user_id"],
    )

    try:
        db.add(invited_user)
        db.commit()
        db.refresh(invited_user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already uses this email or username.",
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save the invited account.",
        ) from exc

    activation_url = (
        f"{settings.backend_base_url.rstrip('/')}"
        "/auth/activate-candidate-invitation-page"
        f"#token={raw_token}"
    )

    try:
        send_role_activation_email(
            to_email=invited_user.email,
            full_name=clean_name,
            user_role=invited_user.role,
            activation_url=activation_url,
            expires_at=expires_at,
        )
    except EmailServiceError as exc:
        # Invalidate and remove the new record so the admin can retry.
        try:
            db.delete(invited_user)
            db.commit()
        except SQLAlchemyError:
            db.rollback()

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The activation email could not be sent. "
                "Check the user list before retrying."
            ),
        ) from exc

    invited_user.invitation_token_sent_at = utc_now()
    try:
        db.commit()
        db.refresh(invited_user)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "The invitation email was sent, but its delivery status "
                "could not be finalized. Verify the user record before "
                "sending another invitation."
            ),
        ) from exc

    return {
        "message": (
            f"Invitation sent to {invited_user.email}. "
            "The single-use activation link expires in seven days."
        ),
        "id": invited_user.id,
        "username": invited_user.username,
        "email": invited_user.email,
        "role": invited_user.role,
        "created_at": invited_user.created_at,
    }
