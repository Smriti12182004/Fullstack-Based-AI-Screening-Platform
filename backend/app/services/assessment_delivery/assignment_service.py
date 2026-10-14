from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Assessment, AssessmentAssignment, User


class AssessmentAssignmentServiceError(Exception):
    """Base exception for assessment-assignment failures."""


def _ensure_timezone_aware(value: datetime, field_name: str) -> datetime:
    """
    Ensure an incoming datetime is timezone-aware.

    Assessment windows must be stored and compared consistently in UTC.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        raise AssessmentAssignmentServiceError(
            f"{field_name} must include timezone information."
        )

    return value


def _to_utc(value: datetime) -> datetime:
    """Normalize a timezone-aware datetime to UTC."""
    return value.astimezone(timezone.utc)


def _load_assessment(
    db: Session,
    assessment_id: int,
) -> Assessment:
    assessment = db.get(
        Assessment,
        assessment_id,
    )

    if assessment is None:
        raise AssessmentAssignmentServiceError(
            "Assessment not found."
        )

    if assessment.status != "published":
        raise AssessmentAssignmentServiceError(
            "Only published assessments can be assigned to candidates."
        )

    if assessment.review_status != "approved":
        raise AssessmentAssignmentServiceError(
            "Only approved assessments can be assigned to candidates."
        )

    return assessment


def _load_candidate(
    db: Session,
    candidate_id: int,
) -> User:
    candidate = db.get(
        User,
        candidate_id,
    )

    if candidate is None:
        raise AssessmentAssignmentServiceError(
            "Candidate not found."
        )

    if candidate.role != "candidate":
        raise AssessmentAssignmentServiceError(
            "The selected user is not a candidate."
        )

    return candidate


def _validate_window(
    opens_at: datetime,
    closes_at: datetime,
) -> tuple[datetime, datetime]:
    opens_at = _ensure_timezone_aware(
        opens_at,
        "opens_at",
    )

    closes_at = _ensure_timezone_aware(
        closes_at,
        "closes_at",
    )

    opens_at = _to_utc(opens_at)
    closes_at = _to_utc(closes_at)

    if closes_at <= opens_at:
        raise AssessmentAssignmentServiceError(
            "Assessment close time must be later than the open time."
        )

    return opens_at, closes_at


def _check_existing_assignment(
    db: Session,
    assessment_id: int,
    candidate_id: int,
) -> AssessmentAssignment | None:
    return (
        db.query(AssessmentAssignment)
        .filter(
            AssessmentAssignment.assessment_id == assessment_id,
            AssessmentAssignment.candidate_id == candidate_id,
        )
        .first()
    )


def create_assignment(
    db: Session,
    assessment_id: int,
    candidate_id: int,
    assigned_by: int,
    opens_at: datetime,
    closes_at: datetime,
) -> AssessmentAssignment:
    """
    Create a candidate assignment for a published assessment.

    Important boundary:
        Assignment != Attempt.

    This function only records that the candidate has been invited
    to take the assessment during the specified window. An Attempt
    will be created later when the candidate actually starts.
    """

    if assessment_id <= 0:
        raise AssessmentAssignmentServiceError(
            "Assessment ID must be greater than zero."
        )

    if candidate_id <= 0:
        raise AssessmentAssignmentServiceError(
            "Candidate ID must be greater than zero."
        )

    if assigned_by <= 0:
        raise AssessmentAssignmentServiceError(
            "Assigner ID must be greater than zero."
        )

    assessment = _load_assessment(
        db=db,
        assessment_id=assessment_id,
    )

    _load_candidate(
        db=db,
        candidate_id=candidate_id,
    )

    assigner = db.get(
        User,
        assigned_by,
    )

    if assigner is None:
        raise AssessmentAssignmentServiceError(
            "Assigning user not found."
        )

    normalized_opens_at, normalized_closes_at = _validate_window(
        opens_at=opens_at,
        closes_at=closes_at,
    )

    existing_assignment = _check_existing_assignment(
        db=db,
        assessment_id=assessment_id,
        candidate_id=candidate_id,
    )

    if existing_assignment is not None:
        raise AssessmentAssignmentServiceError(
            "This candidate is already assigned to the assessment."
        )

    assignment = AssessmentAssignment(
        assessment_id=assessment.id,
        candidate_id=candidate_id,
        assigned_by=assigned_by,
        status="assigned",
        opens_at=normalized_opens_at,
        closes_at=normalized_closes_at,
    )

    try:
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

    except SQLAlchemyError as exc:
        db.rollback()

        raise AssessmentAssignmentServiceError(
            "Unable to create assessment assignment."
        ) from exc

    return assignment


def get_assignment(
    db: Session,
    assignment_id: int,
) -> AssessmentAssignment:
    """Load a single assessment assignment."""

    if assignment_id <= 0:
        raise AssessmentAssignmentServiceError(
            "Assignment ID must be greater than zero."
        )

    assignment = db.get(
        AssessmentAssignment,
        assignment_id,
    )

    if assignment is None:
        raise AssessmentAssignmentServiceError(
            "Assessment assignment not found."
        )

    return assignment


def get_candidate_assignment(
    db: Session,
    assignment_id: int,
    candidate_id: int,
) -> AssessmentAssignment:
    """
    Load an assignment while enforcing candidate ownership.
    """

    assignment = get_assignment(
        db=db,
        assignment_id=assignment_id,
    )

    if assignment.candidate_id != candidate_id:
        raise AssessmentAssignmentServiceError(
            "This assessment assignment does not belong to the candidate."
        )

    return assignment


def get_assessment_assignments(
    db: Session,
    assessment_id: int,
) -> list[AssessmentAssignment]:
    """Return all candidate assignments for an assessment."""

    if assessment_id <= 0:
        raise AssessmentAssignmentServiceError(
            "Assessment ID must be greater than zero."
        )

    _load_assessment(
        db=db,
        assessment_id=assessment_id,
    )

    return (
        db.query(AssessmentAssignment)
        .filter(
            AssessmentAssignment.assessment_id == assessment_id,
        )
        .order_by(
            AssessmentAssignment.created_at.desc(),
            AssessmentAssignment.id.desc(),
        )
        .all()
    )


def get_candidate_assignments(
    db: Session,
    candidate_id: int,
) -> list[AssessmentAssignment]:
    """Return all assessment assignments belonging to a candidate."""

    if candidate_id <= 0:
        raise AssessmentAssignmentServiceError(
            "Candidate ID must be greater than zero."
        )

    _load_candidate(
        db=db,
        candidate_id=candidate_id,
    )

    return (
        db.query(AssessmentAssignment)
        .filter(
            AssessmentAssignment.candidate_id == candidate_id,
        )
        .order_by(
            AssessmentAssignment.created_at.desc(),
            AssessmentAssignment.id.desc(),
        )
        .all()
    )


def is_assignment_open(
    assignment: AssessmentAssignment,
    now: datetime | None = None,
) -> bool:
    """
    Return whether the candidate is currently inside the assignment window.
    """

    if assignment.status not in {
        "assigned",
        "in_progress",
    }:
        return False

    current_time = now or datetime.now(timezone.utc)

    if current_time.tzinfo is None or current_time.utcoffset() is None:
        raise AssessmentAssignmentServiceError(
            "Current time must include timezone information."
        )

    current_time = _to_utc(current_time)

    opens_at = _to_utc(assignment.opens_at)
    closes_at = _to_utc(assignment.closes_at)

    return opens_at <= current_time <= closes_at