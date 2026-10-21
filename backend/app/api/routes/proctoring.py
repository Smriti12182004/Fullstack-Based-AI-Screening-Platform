import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role
from app.db.session import get_db
from app.models import (
    Assessment,
    AssessmentAssignment,
    Attempt,
    AuditEvent,
    Job,
    JobAssessmentAccess,
    User,
)


router = APIRouter(
    prefix="/proctoring",
    tags=["Proctoring & Activity"],
)

ALLOWED_MONITORING_ROLES = (
    "recruiter",
    "assessment_manager",
)


def _iso(value: datetime | None) -> str | None:
    """Serialize a database timestamp for API responses."""
    return value.isoformat() if value is not None else None


def _timestamp_key(value: datetime | None) -> float:
    """Return a comparable timestamp for sorting database records."""
    if value is None:
        return 0.0

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.timestamp()


def _parse_event_details(value: str | None) -> dict:
    """Safely decode the JSON stored in AuditEvent.details."""
    if not value:
        return {}

    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return {}

    return parsed if isinstance(parsed, dict) else {}


def _summarize_proctoring_events(events: list[AuditEvent]) -> dict[str, int]:
    """Group browser monitoring events into readable, non-judgmental categories."""
    summary = {
        "focus_visibility": 0,
        "fullscreen": 0,
        "clipboard_context": 0,
        "other": 0,
    }

    focus_events = {"tab_hidden", "window_blur"}
    fullscreen_events = {
        "fullscreen_exit",
        "fullscreen_unavailable",
        "fullscreen_required",
    }
    clipboard_events = {
        "copy_attempt",
        "cut_attempt",
        "paste_attempt",
        "context_menu",
        "contextmenu",
    }

    for event in events:
        event_type = event.action.removeprefix("proctor_").lower()

        if event_type in focus_events:
            summary["focus_visibility"] += 1
        elif event_type in fullscreen_events:
            summary["fullscreen"] += 1
        elif event_type in clipboard_events:
            summary["clipboard_context"] += 1
        else:
            summary["other"] += 1

    return summary


def _load_visible_activity_records(
    db: Session,
    current_user: dict,
    assessment_id: int | None = None,
    candidate_id: int | None = None,
) -> list[dict]:
    """
    Load monitoring records within the authenticated user's scope.

    Recruiters can view assignments they created or assignments on
    jobs they own. Assessment Managers can view assignments belonging
    to jobs explicitly assigned to them through JobAssessmentAccess.
    """
    user_id = current_user["user_id"]
    role = current_user["role"]

    # New HR delivery workflow: AssessmentAssignment is the durable
    # assignment record, even before the candidate starts an attempt.
    assignments_query = (
        db.query(
            AssessmentAssignment,
            Assessment,
            Job,
            User,
        )
        .join(
            Assessment,
            Assessment.id == AssessmentAssignment.assessment_id,
        )
        .join(
            Job,
            Job.id == Assessment.job_id,
        )
        .join(
            User,
            User.id == AssessmentAssignment.candidate_id,
        )
    )

    if role == "recruiter":
        assignments_query = assignments_query.filter(
            or_(
                AssessmentAssignment.assigned_by == user_id,
                Job.created_by == user_id,
            )
        )

    elif role == "assessment_manager":
        assignments_query = assignments_query.join(
            JobAssessmentAccess,
            and_(
                JobAssessmentAccess.job_id == Job.id,
                JobAssessmentAccess.user_id == user_id,
            ),
        )

    if assessment_id is not None:
        assignments_query = assignments_query.filter(
            AssessmentAssignment.assessment_id == assessment_id,
        )

    if candidate_id is not None:
        assignments_query = assignments_query.filter(
            AssessmentAssignment.candidate_id == candidate_id,
        )

    assignment_rows = assignments_query.all()

    # Legacy workflow: an assessment assignment may exist only as an
    # Attempt. Include those records without duplicating HR assignments.
    attempts_query = (
        db.query(
            Attempt,
            Assessment,
            Job,
            User,
        )
        .join(
            Assessment,
            Assessment.id == Attempt.assessment_id,
        )
        .join(
            Job,
            Job.id == Assessment.job_id,
        )
        .join(
            User,
            User.id == Attempt.candidate_id,
        )
    )

    if role == "recruiter":
        attempts_query = attempts_query.filter(
            Job.created_by == user_id,
        )

    elif role == "assessment_manager":
        attempts_query = attempts_query.join(
            JobAssessmentAccess,
            and_(
                JobAssessmentAccess.job_id == Job.id,
                JobAssessmentAccess.user_id == user_id,
            ),
        )

    if assessment_id is not None:
        attempts_query = attempts_query.filter(
            Attempt.assessment_id == assessment_id,
        )

    if candidate_id is not None:
        attempts_query = attempts_query.filter(
            Attempt.candidate_id == candidate_id,
        )

    attempt_rows = (
        attempts_query
        .order_by(
            Attempt.created_at.asc(),
            Attempt.id.asc(),
        )
        .all()
    )

    records_by_pair: dict[tuple[int, int], dict] = {}

    for assignment, assessment, job, candidate in assignment_rows:
        key = (assessment.id, candidate.id)

        records_by_pair[key] = {
            "assignment": assignment,
            "assessment": assessment,
            "job": job,
            "candidate": candidate,
            "attempts": [],
        }

    for attempt, assessment, job, candidate in attempt_rows:
        key = (assessment.id, candidate.id)

        record = records_by_pair.get(key)

        if record is None:
            record = {
                "assignment": None,
                "assessment": assessment,
                "job": job,
                "candidate": candidate,
                "attempts": [],
            }
            records_by_pair[key] = record

        record["attempts"].append(attempt)

    records = list(records_by_pair.values())

    # Select the latest attempt for the assignment.
    for record in records:
        record["latest_attempt"] = max(
            record["attempts"],
            key=lambda attempt: (
                _timestamp_key(attempt.created_at),
                attempt.id,
            ),
            default=None,
        )

    # Retrieve proctoring events in one query instead of one query
    # per candidate. Only the latest attempt contributes to the
    # current dashboard's event count and activity preview.
    latest_attempt_ids = [
        record["latest_attempt"].id
        for record in records
        if record["latest_attempt"] is not None
    ]

    events_by_attempt: dict[int, list[AuditEvent]] = {
        attempt_id: []
        for attempt_id in latest_attempt_ids
    }

    if latest_attempt_ids:
        event_rows = (
            db.query(AuditEvent)
            .filter(
                AuditEvent.attempt_id.in_(latest_attempt_ids),
                AuditEvent.action.startswith("proctor_"),
            )
            .order_by(
                AuditEvent.created_at.desc(),
                AuditEvent.id.desc(),
            )
            .all()
        )

        for event in event_rows:
            events_by_attempt[event.attempt_id].append(event)

    for record in records:
        attempt = record["latest_attempt"]
        event_rows = (
            events_by_attempt.get(attempt.id, [])
            if attempt is not None
            else []
        )

        assignment = record["assignment"]

        record["events"] = event_rows
        record["event_count"] = len(event_rows)
        record["latest_event_at"] = (
            event_rows[0].created_at
            if event_rows
            else None
        )
        record["monitoring_status"] = (
            attempt.status
            if attempt is not None
            else (
                assignment.status
                if assignment is not None
                else "assigned"
            )
        )

    records.sort(
        key=lambda record: (
            _timestamp_key(record["latest_event_at"]),
            _timestamp_key(
                record["latest_attempt"].created_at
                if record["latest_attempt"] is not None
                else (
                    record["assignment"].created_at
                    if record["assignment"] is not None
                    else None
                )
            ),
        ),
        reverse=True,
    )

    return records


def _serialize_activity_record(record: dict) -> dict:
    """Build the public monitoring payload without exposing answer data."""
    assignment = record["assignment"]
    assessment = record["assessment"]
    job = record["job"]
    candidate = record["candidate"]
    attempt = record["latest_attempt"]

    latest_event = (
        record["events"][0]
        if record["events"]
        else None
    )

    return {
        "assessment_id": assessment.id,
        "assessment_title": assessment.title,
        "assessment_status": assessment.status,
        "job_id": job.id,
        "job_title": job.title,
        "candidate_id": candidate.id,
        "candidate_name": candidate.full_name or candidate.username,
        "candidate_username": candidate.username,
        "candidate_email": candidate.email,
        "assignment_id": assignment.id if assignment else None,
        "assignment_status": assignment.status if assignment else None,
        "opens_at": _iso(assignment.opens_at) if assignment else None,
        "closes_at": _iso(assignment.closes_at) if assignment else None,
        "attempt_id": attempt.id if attempt else None,
        "attempt_status": attempt.status if attempt else None,
        "started_at": _iso(attempt.started_at) if attempt else None,
        "expires_at": _iso(attempt.expires_at) if attempt else None,
        "submitted_at": _iso(attempt.submitted_at) if attempt else None,
        "monitoring_status": record["monitoring_status"],
        "event_count": record["event_count"],
        "latest_event_at": _iso(record["latest_event_at"]),
        "latest_event_type": (
            latest_event.action.removeprefix("proctor_")
            if latest_event
            else None
        ),
        "event_summary": _summarize_proctoring_events(record["events"]),
    }


def _serialize_event(event: AuditEvent) -> dict:
    """Return a timestamped proctoring event."""
    return {
        "id": event.id,
        "event_type": event.action.removeprefix("proctor_"),
        "action": event.action,
        "created_at": _iso(event.created_at),
        "details": _parse_event_details(event.details),
    }


@router.get("/activity")
def get_proctoring_activity(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(*ALLOWED_MONITORING_ROLES),
    ),
):
    """
    List candidate assessment activity visible to the current HR user
    or Assessment Manager.
    """
    records = _load_visible_activity_records(
        db=db,
        current_user=current_user,
    )

    total = len(records)

    active_attempts = sum(
        1
        for record in records
        if record["latest_attempt"] is not None
        and record["latest_attempt"].status == "in_progress"
    )

    candidates_with_events = sum(
        1
        for record in records
        if record["event_count"] > 0
    )

    paginated_records = records[offset:offset + limit]

    return {
        "items": [
            _serialize_activity_record(record)
            for record in paginated_records
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
        "active_attempts": active_attempts,
        "candidates_with_events": candidates_with_events,
    }


@router.get("/activity/{assessment_id}/{candidate_id}/events")
def get_candidate_proctoring_events(
    assessment_id: int,
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(*ALLOWED_MONITORING_ROLES),
    ),
):
    """
    Return proctoring history for a candidate's latest assessment attempt.

    Candidates without an attempt can still appear in the activity
    dashboard, but their event list will be empty until an attempt exists.
    """
    records = _load_visible_activity_records(
        db=db,
        current_user=current_user,
        assessment_id=assessment_id,
        candidate_id=candidate_id,
    )

    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate assessment activity not found",
        )

    record = records[0]
    attempt = record["latest_attempt"]

    events = record["events"]

    return {
        "assessment_id": record["assessment"].id,
        "assessment_title": record["assessment"].title,
        "candidate_id": record["candidate"].id,
        "candidate_name": (
            record["candidate"].full_name
            or record["candidate"].username
        ),
        "attempt_id": attempt.id if attempt else None,
        "attempt_status": attempt.status if attempt else None,
        "events": [
            _serialize_event(event)
            for event in events
        ],
        "total_events": len(events),
    }