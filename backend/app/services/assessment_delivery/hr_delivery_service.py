from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets

from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    Assessment,
    AssessmentAssignment,
    AssessmentQuestion,
    Job,
    QuestionSetConfiguration,
    QuestionSet,
    User,
)
from app.models.assessment_set import AssessmentSet
from app.models.assessment_invitation import AssessmentInvitation
from app.core.config import settings
from app.core.security import hash_password
from app.db.timestamps import utc_now
from app.services.email_service import (
    EmailServiceError,
    send_candidate_activation_email,
    send_assessment_invitation_email,
)


class HRDeliveryServiceError(Exception):
    """A business-rule failure in HR assessment delivery operations."""

    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.status_code = status_code


def _normalize_window(
    opens_at: datetime,
    closes_at: datetime,
) -> tuple[datetime, datetime]:
    """Require timezone-aware timestamps and normalize the window to UTC."""

    for value, name in (
        (opens_at, "opens_at"),
        (closes_at, "closes_at"),
    ):
        if value.tzinfo is None or value.utcoffset() is None:
            raise HRDeliveryServiceError(
                f"{name} must include a timezone offset."
            )

    normalized_opens_at = opens_at.astimezone(timezone.utc)
    normalized_closes_at = closes_at.astimezone(timezone.utc)

    if normalized_closes_at <= normalized_opens_at:
        raise HRDeliveryServiceError(
            "The closing time must be after the opening time."
        )

    if normalized_closes_at <= utc_now().astimezone(timezone.utc):
        raise HRDeliveryServiceError(
            "The closing time must be in the future."
        )

    return normalized_opens_at, normalized_closes_at


def _has_active_candidate_invitation(candidate: User, now: datetime | None = None) -> bool:
    """Return true only for an unverified candidate with a live setup token."""
    if (
        candidate.is_email_verified
        or not candidate.invitation_token_hash
        or candidate.invitation_token_sent_at is None
    ):
        return False
    expires_at = candidate.invitation_token_expires_at
    if expires_at is None:
        return False
    current = now or utc_now()
    if expires_at.tzinfo is None or expires_at.utcoffset() is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at.astimezone(timezone.utc) > current.astimezone(timezone.utc)


def _candidate_option(
    candidate: User,
    recruiter_id: int | None = None,
) -> dict:
    verified = bool(candidate.is_email_verified)
    can_revoke_invitation = (
        recruiter_id is not None
        and not verified
        and candidate.invitation_created_by == recruiter_id
        and _has_active_candidate_invitation(candidate)
    )
    return {
        "id": candidate.id,
        "username": candidate.username,
        "full_name": candidate.full_name,
        "email": candidate.email,
        "is_email_verified": verified,
        "account_status": "verified" if verified else "pending_activation",
        "can_revoke_invitation": can_revoke_invitation,
    }


def get_hr_candidates(
    db: Session,
    recruiter_id: int,
    search: str | None = None,
    limit: int = 100,
    exclude_assessment_id: int | None = None,
) -> list[dict]:
    """List eligible candidates, optionally excluding an assessment's assignees."""
    if recruiter_id <= 0:
        raise HRDeliveryServiceError("Invalid recruiter identity.", 401)

    safe_limit = max(1, min(int(limit), 100))
    now = utc_now()
    query = db.query(User).filter(
        User.role == "candidate",
        or_(
            User.is_email_verified.is_(True),
            and_(
                User.is_email_verified.is_(False),
                User.invitation_token_hash.is_not(None),
                User.invitation_token_expires_at.is_not(None),
                User.invitation_token_sent_at.is_not(None),
                User.invitation_token_expires_at > now,
            ),
        ),
    )

    if exclude_assessment_id is not None:
        assessment, _assessment_set, _job = _load_hr_owned_handed_off_assessment(
            db=db,
            assessment_id=exclude_assessment_id,
            recruiter_id=recruiter_id,
        )
        if str(assessment.status or "").strip().lower() != "published":
            raise HRDeliveryServiceError(
                "Existing assignments can be excluded only for an active assessment.",
                409,
            )
        assigned_candidate_ids = (
            db.query(AssessmentAssignment.candidate_id)
            .filter(AssessmentAssignment.assessment_id == assessment.id)
        )
        query = query.filter(~User.id.in_(assigned_candidate_ids))

    normalized_search = (search or "").strip()
    if normalized_search:
        pattern = f"%{normalized_search}%"
        query = query.filter(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.full_name.ilike(pattern),
            )
        )

    candidates = (
        query.order_by(User.full_name.asc().nullslast(), User.username.asc(), User.id.asc())
        .limit(safe_limit)
        .all()
    )
    return [
        _candidate_option(candidate, recruiter_id=recruiter_id)
        for candidate in candidates
    ]


def _prepare_candidate_invitation(candidate: User) -> tuple[str, datetime]:
    """Store only a token hash and return the one-time token URL for email delivery."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = utc_now() + timedelta(days=7)

    candidate.invitation_token_hash = token_hash
    candidate.invitation_token_expires_at = expires_at
    # A token is not assignment-eligible until SMTP accepts the message and this
    # marker is committed in a second, explicit step.
    candidate.invitation_token_sent_at = None

    # A fragment is not sent to the HTTP server in the request target, avoiding
    # exposure of the raw one-time token in ordinary server access logs.
    activation_url = (
        f"{settings.backend_base_url.rstrip('/')}/auth/activate-candidate-invitation-page"
        f"#token={raw_token}"
    )
    return activation_url, expires_at


def _send_candidate_invitation_after_persist(
    db: Session,
    candidate: User,
    full_name: str,
    activation_url: str,
    expires_at: datetime,
) -> None:
    """Send after persistence, then mark delivery; revoke selection eligibility on failure."""
    try:
        send_candidate_activation_email(
            to_email=candidate.email,
            candidate_name=full_name,
            activation_url=activation_url,
            expires_at=expires_at,
        )
    except EmailServiceError as exc:
        candidate.invitation_token_hash = None
        candidate.invitation_token_expires_at = None
        candidate.invitation_token_sent_at = None
        try:
            db.commit()
        except SQLAlchemyError:
            # If cleanup cannot be persisted, sent_at remains NULL in the
            # previously committed state, so listing/assignment still rejects it.
            db.rollback()
        raise HRDeliveryServiceError(
            "The candidate record was saved, but the activation email could not be sent. "
            "Submit the same candidate name and email again to retry. The candidate cannot "
            "be selected for delivery until the email has been sent successfully.",
            503,
        ) from exc

    candidate.invitation_token_sent_at = utc_now()
    try:
        db.commit()
        db.refresh(candidate)
    except SQLAlchemyError as exc:
        db.rollback()
        # The candidate and hashed invitation token were committed before SMTP.
        # A missing sent_at marker keeps this candidate unselectable; submitting
        # the same email again rotates the token and safely retries delivery.
        raise HRDeliveryServiceError(
            "The activation email was sent, but its delivery state could not be finalized. "
            "Retry adding this candidate with the same email address before assigning them.",
            503,
        ) from exc


def create_hr_candidate(
    db: Session,
    recruiter_id: int,
    full_name: str,
    email: str,
) -> dict:
    """Create or safely re-invite an HR-created pending candidate."""
    if recruiter_id <= 0:
        raise HRDeliveryServiceError("Invalid recruiter identity.", 401)

    clean_name = " ".join((full_name or "").split())
    normalized_email = (email or "").strip().lower()
    if len(clean_name) < 2 or len(clean_name) > 100:
        raise HRDeliveryServiceError("Enter the candidate's full name (2–100 characters).")
    if not normalized_email:
        raise HRDeliveryServiceError("Enter a candidate email address.")

    existing = (
        db.query(User)
        .filter(func.lower(User.email) == normalized_email)
        .first()
    )
    is_retry = False
    if existing is not None:
        is_hr_pending_account = (
            existing.role == "candidate"
            and not existing.is_email_verified
            and bool(existing.full_name)
            and existing.verification_otp_hash is None
            and existing.verification_otp_expires_at is None
            and existing.verification_otp_sent_at is None
            and existing.invitation_created_by in (None, recruiter_id)
        )
        if not is_hr_pending_account:
            raise HRDeliveryServiceError(
                "An account already uses this email address. Search for that candidate or ask them to complete their existing account setup.",
                409,
            )
        if _has_active_candidate_invitation(existing):
            raise HRDeliveryServiceError(
                "This candidate already has an active setup email. Select them from the candidate list instead of adding them again.",
                409,
            )
        candidate = existing
        clean_name = existing.full_name or clean_name
        if candidate.invitation_created_by is None:
            # Adopt a stale, inactive HR-created invitation created before
            # creator tracking was introduced, so retries remain possible.
            candidate.invitation_created_by = recruiter_id
        is_retry = True
    else:
        base_username = re.sub(r"[^A-Za-z0-9_]+", "_", clean_name).strip("_").lower()
        base_username = re.sub(r"_+", "_", base_username)[:40].strip("_") or "candidate"
        username = None
        for _ in range(10):
            proposed = f"{base_username}_{secrets.token_hex(3)}"[:50]
            exists = db.query(User.id).filter(User.username == proposed).first()
            if exists is None:
                username = proposed
                break
        if username is None:
            raise HRDeliveryServiceError(
                "Unable to generate a unique candidate username. Please retry.",
                409,
            )

        candidate = User(
            username=username,
            full_name=clean_name,
            email=normalized_email,
            password_hash=hash_password(secrets.token_urlsafe(48)),
            role="candidate",
            is_email_verified=False,
            verification_otp_hash=None,
            verification_otp_expires_at=None,
            verification_otp_sent_at=None,
            verification_otp_attempts=0,
            invitation_created_by=recruiter_id,
        )

    activation_url, expires_at = _prepare_candidate_invitation(candidate)

    try:
        db.add(candidate)
        # Commit the candidate and hashed invitation state before sending SMTP.
        db.commit()
        db.refresh(candidate)
    except IntegrityError as exc:
        db.rollback()
        raise HRDeliveryServiceError(
            "A candidate account with this email or generated username already exists.",
            409,
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HRDeliveryServiceError(
            "Unable to save the candidate account. No candidate was added.",
            500,
        ) from exc

    _send_candidate_invitation_after_persist(
        db=db,
        candidate=candidate,
        full_name=clean_name,
        activation_url=activation_url,
        expires_at=expires_at,
    )

    return {
        "candidate": _candidate_option(
            candidate,
            recruiter_id=recruiter_id,
        ),
        "message": (
            "Candidate invitation re-sent. A single-use password-setup link has been emailed."
            if is_retry
            else "Candidate added. A single-use password-setup link has been emailed."
        ),
    }



def revoke_hr_candidate_invitation(
    db: Session,
    recruiter_id: int,
    candidate_id: int,
) -> dict:
    """Revoke a pending candidate's setup link without deleting their account.

    Only the recruiter who created the invitation may revoke it. Any existing
    assessment assignments are intentionally retained.
    """
    if recruiter_id <= 0:
        raise HRDeliveryServiceError("Invalid recruiter identity.", 401)

    if candidate_id <= 0:
        raise HRDeliveryServiceError("Candidate ID must be a positive integer.")

    candidate = (
        db.query(User)
        .filter(User.id == candidate_id)
        .with_for_update()
        .one_or_none()
    )

    if candidate is None:
        raise HRDeliveryServiceError("Candidate not found.", 404)

    if candidate.role != "candidate":
        raise HRDeliveryServiceError(
            "Only candidate accounts can have candidate invitations revoked.",
            409,
        )

    if candidate.is_email_verified:
        raise HRDeliveryServiceError(
            "This candidate has already activated their account. Their account cannot be revoked from this modal.",
            409,
        )

    if candidate.invitation_created_by != recruiter_id:
        raise HRDeliveryServiceError(
            "Only the recruiter who created this invitation can revoke it.",
            403,
        )

    if (
        not candidate.invitation_token_hash
        or candidate.invitation_token_sent_at is None
    ):
        raise HRDeliveryServiceError(
            "This candidate does not have a sent invitation that can be revoked.",
            409,
        )

    candidate.invitation_token_hash = None
    candidate.invitation_token_expires_at = None
    candidate.invitation_token_sent_at = None

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HRDeliveryServiceError(
            "Unable to revoke the candidate invitation. No changes were saved.",
            500,
        ) from exc

    return {
        "candidate_id": candidate.id,
        "account_status": "invitation_revoked",
        "message": (
            "Invitation revoked. The candidate was removed from the eligible list. "
            "Their account record and any existing assessment assignments were retained."
        ),
    }


def _load_hr_owned_handed_off_assessment(
    db: Session,
    assessment_id: int,
    recruiter_id: int,
) -> tuple[Assessment, AssessmentSet, Job]:
    """Load and authorize an assessment in the reviewer's completed handoff stage."""

    assessment = (
        db.query(Assessment)
        .filter(Assessment.id == assessment_id)
        .with_for_update()
        .one_or_none()
    )

    if assessment is None:
        raise HRDeliveryServiceError(
            "Assessment not found.",
            404,
        )

    if (
        assessment.question_set_id is None
        or assessment.variant_number is None
    ):
        raise HRDeliveryServiceError(
            "This assessment is not linked to an approved Assessment Set.",
            409,
        )

    assessment_set = (
        db.query(AssessmentSet)
        .filter(
            AssessmentSet.question_set_id == assessment.question_set_id,
            AssessmentSet.variant_number == assessment.variant_number,
        )
        .with_for_update()
        .one_or_none()
    )

    if assessment_set is None:
        raise HRDeliveryServiceError(
            "The approved Assessment Set for this assessment was not found.",
            409,
        )

    question_set = db.get(
        QuestionSet,
        assessment.question_set_id,
    )
    job = db.get(
        Job,
        assessment.job_id,
    )

    if question_set is None or job is None:
        raise HRDeliveryServiceError(
            "The assessment's job or question set could not be found.",
            404,
        )

    if question_set.job_id != job.id:
        raise HRDeliveryServiceError(
            "The assessment and question set do not belong to the same job.",
            409,
        )

    if int(job.created_by) != int(recruiter_id):
        raise HRDeliveryServiceError(
            "You are not authorized to configure delivery for this job.",
            403,
        )

    if str(assessment_set.status or "").strip().lower() != "approved":
        raise HRDeliveryServiceError(
            "Only reviewer-approved assessment sets can be activated for delivery.",
            409,
        )

    if assessment_set.sent_to_hr_at is None or assessment_set.sent_to_hr_by is None:
        raise HRDeliveryServiceError(
            "The Assessment Reviewer must hand off this set to HR before delivery can be activated.",
            409,
        )

    if str(assessment.review_status or "").strip().lower() != "approved":
        raise HRDeliveryServiceError(
            "The candidate-facing assessment is not reviewer-approved.",
            409,
        )

    if str(assessment.status or "").strip().lower() not in {
        "ready",
        "published",
    }:
        raise HRDeliveryServiceError(
            "Only ready or previously activated assessments can be configured for HR delivery.",
            409,
        )

    question_count = (
        db.query(AssessmentQuestion.id)
        .filter(AssessmentQuestion.assessment_id == assessment.id)
        .count()
    )

    if question_count <= 0:
        raise HRDeliveryServiceError(
            "An assessment must contain at least one question before delivery can be activated.",
            409,
        )

    return assessment, assessment_set, job


def _load_verified_candidates(
    db: Session,
    candidate_ids: list[int],
) -> list[User]:
    candidate_ids = list(candidate_ids)

    if not candidate_ids:
        raise HRDeliveryServiceError(
            "Select at least one candidate before activating delivery."
        )

    if any(candidate_id <= 0 for candidate_id in candidate_ids):
        raise HRDeliveryServiceError(
            "Candidate IDs must be positive integers."
        )

    if len(set(candidate_ids)) != len(candidate_ids):
        raise HRDeliveryServiceError(
            "Duplicate candidate IDs are not allowed."
        )

    candidates = (
        db.query(User)
        .filter(User.id.in_(candidate_ids))
        .all()
    )

    candidates_by_id = {
        candidate.id: candidate
        for candidate in candidates
    }

    invalid_ids = [
        candidate_id
        for candidate_id in candidate_ids
        if (
            candidate_id not in candidates_by_id
            or candidates_by_id[candidate_id].role != "candidate"
            or (
                not candidates_by_id[candidate_id].is_email_verified
                and not _has_active_candidate_invitation(candidates_by_id[candidate_id])
            )
        )
    ]

    if invalid_ids:
        raise HRDeliveryServiceError(
            "Every selected candidate must be email-verified or have an active HR invitation "
            "whose email delivery was confirmed. "
            f"Invalid candidate IDs: {invalid_ids}."
        )

    return [candidates_by_id[candidate_id] for candidate_id in candidate_ids]


def _existing_assignments_for_assessment(
    db: Session,
    assessment_id: int,
) -> list[AssessmentAssignment]:
    return (
        db.query(AssessmentAssignment)
        .filter(AssessmentAssignment.assessment_id == assessment_id)
        .order_by(AssessmentAssignment.id.asc())
        .all()
    )


def _same_window(
    assignment: AssessmentAssignment,
    opens_at: datetime,
    closes_at: datetime,
) -> bool:
    existing_opens = assignment.opens_at
    existing_closes = assignment.closes_at

    if existing_opens.tzinfo is None:
        existing_opens = existing_opens.replace(tzinfo=timezone.utc)
    if existing_closes.tzinfo is None:
        existing_closes = existing_closes.replace(tzinfo=timezone.utc)

    return (
        existing_opens.astimezone(timezone.utc) == opens_at
        and existing_closes.astimezone(timezone.utc) == closes_at
    )



def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _assessment_email_details(db: Session, assessment: Assessment) -> tuple[int, int | None]:
    question_count = (
        db.query(AssessmentQuestion.id)
        .filter(AssessmentQuestion.assessment_id == assessment.id)
        .count()
    )
    configuration = (
        db.query(QuestionSetConfiguration)
        .filter(QuestionSetConfiguration.question_set_id == assessment.question_set_id)
        .first()
    )
    duration_minutes = (
        int(configuration.duration_minutes)
        if configuration is not None and configuration.duration_minutes is not None
        else None
    )
    return question_count, duration_minutes


def _stage_assessment_invitation(
    db: Session,
    assignment: AssessmentAssignment,
) -> dict:
    """Persist a hashed candidate-specific token before email is sent."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = _as_utc(assignment.closes_at) + timedelta(days=7)

    invitation = (
        db.query(AssessmentInvitation)
        .filter(AssessmentInvitation.assignment_id == assignment.id)
        .with_for_update()
        .one_or_none()
    )

    if invitation is None:
        invitation = AssessmentInvitation(
            assignment_id=assignment.id,
            token_hash=token_hash,
            expires_at=expires_at,
            sent_at=None,
        )
        db.add(invitation)
    else:
        # Resending rotates the token and invalidates the previously emailed link.
        invitation.token_hash = token_hash
        invitation.expires_at = expires_at
        invitation.sent_at = None

    return {
        "assignment": assignment,
        "invitation": invitation,
        "raw_token": raw_token,
    }


def _send_staged_assessment_invitations(
    db: Session,
    staged: list[dict],
    *,
    assessment: Assessment,
    job: Job,
    candidates_by_id: dict[int, User],
    question_count: int,
    duration_minutes: int | None,
) -> dict:
    sent_count = 0
    failed_recipients: list[str] = []

    for item in staged:
        assignment = item["assignment"]
        invitation = item["invitation"]
        candidate = candidates_by_id.get(assignment.candidate_id)

        if candidate is None or not candidate.email:
            failed_recipients.append(f"candidate_id:{assignment.candidate_id}")
            continue

        if _as_utc(assignment.closes_at) <= utc_now().astimezone(timezone.utc):
            failed_recipients.append(candidate.email)
            continue

        invitation_url = (
            f"{settings.backend_base_url.rstrip('/')}/assessment-delivery/"
            f"candidate-invitation-page#token={item['raw_token']}"
        )

        try:
            send_assessment_invitation_email(
                to_email=candidate.email,
                candidate_name=candidate.full_name or candidate.username,
                assessment_title=assessment.title or job.title,
                job_title=job.title,
                opens_at=assignment.opens_at,
                closes_at=assignment.closes_at,
                duration_minutes=duration_minutes,
                question_count=question_count,
                invitation_url=invitation_url,
            )
        except EmailServiceError:
            # Assignment and publishing are already committed; leave sent_at NULL
            # so the public invitation validator rejects an unsent link.
            failed_recipients.append(candidate.email)
            continue

        invitation.sent_at = utc_now()
        try:
            # Persist successful delivery independently to support partial SMTP failures.
            db.commit()
            sent_count += 1
        except SQLAlchemyError:
            db.rollback()
            # The recipient received an email, but sent_at is not committed. Its link
            # remains unusable until HR retries and a delivery state can be persisted.
            failed_recipients.append(candidate.email)

    failed_recipients = list(dict.fromkeys(failed_recipients))
    failed_count = len(failed_recipients)

    if failed_count == 0:
        message = f"Invitation emails sent successfully: {sent_count}."
    else:
        message = (
            f"Invitation emails sent successfully: {sent_count}; "
            f"{failed_count} could not be confirmed. Use Send / resend invitation emails to retry."
        )

    return {
        "invitation_emails_sent_count": sent_count,
        "invitation_emails_failed_count": failed_count,
        "failed_recipients": failed_recipients,
        "message": message,
    }


def send_hr_assessment_invitations(
    db: Session,
    assessment_id: int,
    recruiter_id: int,
) -> dict:
    """Send or resend unique invitation links for existing assignments."""
    assessment, _assessment_set, job = _load_hr_owned_handed_off_assessment(
        db=db,
        assessment_id=assessment_id,
        recruiter_id=recruiter_id,
    )

    assignments = (
        db.query(AssessmentAssignment)
        .filter(
            AssessmentAssignment.assessment_id == assessment.id,
            AssessmentAssignment.status == "assigned",
        )
        .order_by(AssessmentAssignment.id.asc())
        .all()
    )
    assignments = [
        assignment for assignment in assignments
        if _as_utc(assignment.closes_at) > utc_now().astimezone(timezone.utc)
    ]

    if not assignments:
        raise HRDeliveryServiceError(
            "There are no assigned candidates with an open availability window to email.",
            409,
        )

    candidate_ids = {assignment.candidate_id for assignment in assignments}
    candidates = (
        db.query(User)
        .filter(User.id.in_(candidate_ids), User.role == "candidate")
        .all()
    )
    candidates_by_id = {candidate.id: candidate for candidate in candidates}

    question_count, duration_minutes = _assessment_email_details(db, assessment)
    staged = [
        _stage_assessment_invitation(db, assignment)
        for assignment in assignments
    ]

    try:
        # Rotate/persist all hashes before sending any new email.
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HRDeliveryServiceError(
            "Unable to prepare assessment invitation links. No emails were sent.",
            500,
        ) from exc

    delivery = _send_staged_assessment_invitations(
        db,
        staged,
        assessment=assessment,
        job=job,
        candidates_by_id=candidates_by_id,
        question_count=question_count,
        duration_minutes=duration_minutes,
    )

    return {
        "assessment_id": assessment.id,
        **delivery,
    }


def validate_candidate_assessment_invitation(
    db: Session,
    token: str,
) -> dict:
    """Validate a candidate-specific invitation without starting an Attempt."""
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    invitation = (
        db.query(AssessmentInvitation)
        .filter(AssessmentInvitation.token_hash == token_hash)
        .one_or_none()
    )

    if invitation is None or invitation.sent_at is None:
        raise HRDeliveryServiceError(
            "This assessment invitation is invalid, revoked, or was not successfully emailed.",
            404,
        )

    now = utc_now().astimezone(timezone.utc)
    if _as_utc(invitation.expires_at) <= now:
        raise HRDeliveryServiceError(
            "This assessment invitation has expired.",
            410,
        )

    assignment = db.get(AssessmentAssignment, invitation.assignment_id)
    if assignment is None or assignment.status not in {"assigned", "in_progress"}:
        raise HRDeliveryServiceError(
            "This assessment assignment is no longer available.",
            410,
        )

    assessment = db.get(Assessment, assignment.assessment_id)
    if assessment is None or str(assessment.status or "").lower() != "published":
        raise HRDeliveryServiceError(
            "This assessment is no longer published.",
            410,
        )

    job = db.get(Job, assessment.job_id)
    question_count, duration_minutes = _assessment_email_details(db, assessment)
    opens_at = _as_utc(assignment.opens_at)
    closes_at = _as_utc(assignment.closes_at)

    if now < opens_at:
        window_status = "not_open"
        message = "Your assessment is not open yet. You can sign in now, then return when the window opens."
    elif now >= closes_at:
        window_status = "closed"
        message = "The availability window for this assessment has closed. Contact your recruiter if you need help."
    else:
        window_status = "open"
        message = "Your assessment is available. Sign in to Evalyn and open My Assessments when you are ready."

    return {
        "assessment_id": assessment.id,
        "assessment_title": assessment.title or "Assessment",
        "job_title": job.title if job else "Role assessment",
        "question_count": question_count,
        "duration_minutes": duration_minutes,
        "opens_at": opens_at,
        "closes_at": closes_at,
        "window_status": window_status,
        "message": message,
    }

def activate_hr_assessment_delivery(
    db: Session,
    assessment_id: int,
    recruiter_id: int,
    candidate_ids: list[int],
    opens_at: datetime,
    closes_at: datetime,
) -> dict:
    """Publish an HR-handed-off assessment and batch-create candidate assignments.

    The assessment status transition and all assignment inserts are committed in
    one transaction. It never creates candidate Attempts; an Attempt should be
    created only when a candidate explicitly starts the assessment.
    """

    normalized_opens_at, normalized_closes_at = _normalize_window(
        opens_at,
        closes_at,
    )

    if len(set(candidate_ids)) != len(candidate_ids):
        raise HRDeliveryServiceError(
            "Duplicate candidate IDs are not allowed."
        )

    assessment, assessment_set, _job = _load_hr_owned_handed_off_assessment(
        db=db,
        assessment_id=assessment_id,
        recruiter_id=recruiter_id,
    )

    candidates = _load_verified_candidates(
        db=db,
        candidate_ids=candidate_ids,
    )

    existing_assignments = _existing_assignments_for_assessment(
        db=db,
        assessment_id=assessment.id,
    )

    if existing_assignments:
        if not all(
            _same_window(
                assignment,
                normalized_opens_at,
                normalized_closes_at,
            )
            for assignment in existing_assignments
        ):
            raise HRDeliveryServiceError(
                "This assessment already has assignments with a different availability window. "
                "Use the original opening and closing times when adding candidates.",
                409,
            )

        existing_candidate_ids = {
            assignment.candidate_id
            for assignment in existing_assignments
        }
        duplicate_ids = sorted(
            existing_candidate_ids.intersection(candidate_ids)
        )

        if duplicate_ids:
            raise HRDeliveryServiceError(
                f"These candidates are already assigned to this assessment: {duplicate_ids}.",
                409,
            )

    assignments = [
        AssessmentAssignment(
            assessment_id=assessment.id,
            candidate_id=candidate.id,
            assigned_by=recruiter_id,
            status="assigned",
            opens_at=normalized_opens_at,
            closes_at=normalized_closes_at,
        )
        for candidate in candidates
    ]

    # HR is the actor activating delivery after reviewer handoff. Assignments,
    # hashed invitation tokens and publishing are committed together; no Attempt
    # is created. Actual SMTP delivery happens only after this database commit.
    assessment.status = "published"
    db.add_all(assignments)

    try:
        db.flush()
        staged = [
            _stage_assessment_invitation(db, assignment)
            for assignment in assignments
        ]
        db.commit()
        db.refresh(assessment)
        for assignment in assignments:
            db.refresh(assignment)
    except IntegrityError as exc:
        db.rollback()
        raise HRDeliveryServiceError(
            "One or more candidates already have an assignment for this assessment.",
            409,
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HRDeliveryServiceError(
            "Unable to activate assessment delivery. No assignments were saved.",
            500,
        ) from exc

    candidates_by_id = {candidate.id: candidate for candidate in candidates}
    question_count, duration_minutes = _assessment_email_details(db, assessment)
    delivery = _send_staged_assessment_invitations(
        db,
        staged,
        assessment=assessment,
        job=_job,
        candidates_by_id=candidates_by_id,
        question_count=question_count,
        duration_minutes=duration_minutes,
    )
    delivery["message"] = (
        f"Assessment delivery activated and {len(assignments)} candidate assignment(s) created. "
        f"Invitation emails sent: {delivery['invitation_emails_sent_count']}; "
        f"failed: {delivery['invitation_emails_failed_count']}. "
        "Candidate attempts have not been started."
    )

    return {
        "assessment_id": assessment.id,
        "assessment_set_id": assessment_set.id,
        "assessment_status": assessment.status,
        "review_status": assessment.review_status,
        "opens_at": normalized_opens_at,
        "closes_at": normalized_closes_at,
        "assignment_count": len(assignments),
        "assignments": assignments,
        **delivery,
    }



def add_candidates_to_active_hr_assessment(
    db: Session,
    assessment_id: int,
    recruiter_id: int,
    candidate_ids: list[int],
) -> dict:
    """Add only new candidates to a published assessment using its saved window.

    The existing assignment window is reused and the existing assignment rows,
    attempts, scores, and invitation tokens are not modified. The underlying
    activation service creates assignments and invitation tokens only for the
    candidate IDs supplied to this call.
    """
    if not candidate_ids:
        raise HRDeliveryServiceError("Select at least one candidate to add.")

    if len(set(candidate_ids)) != len(candidate_ids):
        raise HRDeliveryServiceError("Duplicate candidate IDs are not allowed.")

    assessment, _assessment_set, _job = _load_hr_owned_handed_off_assessment(
        db=db,
        assessment_id=assessment_id,
        recruiter_id=recruiter_id,
    )

    if str(assessment.status or "").strip().lower() != "published":
        raise HRDeliveryServiceError(
            "Candidates can be added here only after delivery has been activated.",
            409,
        )

    existing_assignments = _existing_assignments_for_assessment(
        db=db,
        assessment_id=assessment.id,
    )
    if not existing_assignments:
        raise HRDeliveryServiceError(
            "This assessment has no existing assignments. Configure delivery first.",
            409,
        )

    opens_at = _as_utc(existing_assignments[0].opens_at)
    closes_at = _as_utc(existing_assignments[0].closes_at)

    if not all(
        _same_window(assignment, opens_at, closes_at)
        for assignment in existing_assignments
    ):
        raise HRDeliveryServiceError(
            "Existing candidate assignments do not share one availability window. "
            "Please review the assessment schedule before adding candidates.",
            409,
        )

    if closes_at <= _as_utc(utc_now()):
        raise HRDeliveryServiceError(
            "The assessment availability window has closed. Candidates cannot be added.",
            409,
        )

    result = activate_hr_assessment_delivery(
        db=db,
        assessment_id=assessment_id,
        recruiter_id=recruiter_id,
        candidate_ids=candidate_ids,
        opens_at=opens_at,
        closes_at=closes_at,
    )

    added_count = int(result.get("assignment_count", 0))
    sent_count = int(result.get("invitation_emails_sent_count", 0))
    failed_count = int(result.get("invitation_emails_failed_count", 0))
    result["message"] = (
        f"Added {added_count} additional candidate assignment(s) to assessment "
        f"#{assessment_id}. Invitation emails sent: {sent_count}; failed: {failed_count}. "
        "Existing assignments and candidate invitation links were not changed."
    )
    return result
