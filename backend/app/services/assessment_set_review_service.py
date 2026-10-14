"""Service-layer operations for AssessmentSet review decisions."""

from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    AssessmentSet,
    JobAssessmentAccess,
    QuestionSet,
    QuestionSlot,
    User,
)
from app.services.notification_service import create_notification


ASSESSMENT_SET_REVIEW_CHECKLIST_KEYS = (
    "question_quality",
    "answer_keys_verified",
    "skill_mapping_verified",
    "difficulty_verified",
    "blueprint_compliance",
    "duplicate_check",
    "candidate_instructions_verified",
)


class AssessmentSetReviewServiceError(Exception):
    """Raised when an AssessmentSet review operation cannot be completed."""


def _get_assessment_set_with_question_set(
    db: Session,
    assessment_set_id: int,
) -> tuple[AssessmentSet, QuestionSet]:
    """Load an AssessmentSet and its parent QuestionSet."""
    assessment_set = db.get(AssessmentSet, assessment_set_id)

    if assessment_set is None:
        raise AssessmentSetReviewServiceError("Assessment set not found.")

    question_set = db.get(QuestionSet, assessment_set.question_set_id)

    if question_set is None:
        raise AssessmentSetReviewServiceError("Parent QuestionSet not found.")

    return assessment_set, question_set


def _get_assigned_reviewer_id(db: Session, job_id: int) -> int:
    """Resolve the single Assessment Reviewer assigned to a job."""
    rows = (
        db.query(User.id)
        .join(JobAssessmentAccess, JobAssessmentAccess.user_id == User.id)
        .filter(
            JobAssessmentAccess.job_id == job_id,
            User.role == "assessment_reviewer",
        )
        .order_by(JobAssessmentAccess.created_at.asc(), User.id.asc())
        .all()
    )

    if not rows:
        raise AssessmentSetReviewServiceError(
            "No Assessment Reviewer is assigned to this job."
        )

    if len(rows) > 1:
        raise AssessmentSetReviewServiceError(
            "Multiple Assessment Reviewers are assigned to this job. "
            "Assign exactly one reviewer before reviewing the set."
        )

    return int(rows[0][0])


def _get_assigned_manager_ids(db: Session, job_id: int) -> list[int]:
    """Return all Assessment Managers assigned to the job."""
    rows = (
        db.query(User.id)
        .join(JobAssessmentAccess, JobAssessmentAccess.user_id == User.id)
        .filter(
            JobAssessmentAccess.job_id == job_id,
            User.role == "assessment_manager",
        )
        .order_by(JobAssessmentAccess.created_at.asc(), User.id.asc())
        .all()
    )
    return [int(row[0]) for row in rows]


def _normalize_checklist(checklist: dict | None) -> dict:
    """Return the canonical AssessmentSet review checklist."""
    source = checklist or {}
    return {
        key: bool(source.get(key, False))
        for key in ASSESSMENT_SET_REVIEW_CHECKLIST_KEYS
    }


def _ensure_reviewer_access(
    db: Session,
    question_set: QuestionSet,
    reviewer_id: int,
) -> None:
    """Ensure the current reviewer is assigned to the set's job."""
    assigned_reviewer_id = _get_assigned_reviewer_id(db, question_set.job_id)

    if int(assigned_reviewer_id) != int(reviewer_id):
        raise AssessmentSetReviewServiceError(
            "You are not the assigned reviewer for this assessment set."
        )


def _load_submitted_set(
    db: Session,
    assessment_set_id: int,
    reviewer_id: int,
) -> tuple[AssessmentSet, QuestionSet]:
    """Load a submitted AssessmentSet and enforce reviewer access."""
    assessment_set, question_set = _get_assessment_set_with_question_set(
        db,
        assessment_set_id,
    )

    _ensure_reviewer_access(db, question_set, reviewer_id)

    if assessment_set.status != "submitted_for_review":
        raise AssessmentSetReviewServiceError(
            "Only assessment sets submitted for review can be approved or rejected."
        )

    return assessment_set, question_set


def _load_slots(db: Session, assessment_set_id: int) -> list[QuestionSlot]:
    """Load all slots for an AssessmentSet in stable order."""
    return (
        db.query(QuestionSlot)
        .filter(QuestionSlot.assessment_set_id == assessment_set_id)
        .order_by(
            QuestionSlot.section_id.asc(),
            QuestionSlot.skill_id.asc(),
            QuestionSlot.difficulty.asc(),
            QuestionSlot.slot_number.asc(),
        )
        .all()
    )


def _validate_set_for_approval(db: Session, assessment_set_id: int) -> None:
    """Ensure every required slot is filled with an approved question."""
    slots = _load_slots(db, assessment_set_id)

    if not slots:
        raise AssessmentSetReviewServiceError(
            "Assessment set has no questions to review."
        )

    unfilled_slots = [
        slot.slot_number
        for slot in slots
        if slot.current_question_id is None or slot.current_question is None
    ]

    if unfilled_slots:
        numbers = ", ".join(str(number) for number in unfilled_slots)
        raise AssessmentSetReviewServiceError(
            f"Assessment set has unfilled question slots: {numbers}."
        )

    not_approved_slots = [
        slot.slot_number
        for slot in slots
        if str(slot.current_question.status or "").strip().lower() != "approved"
    ]

    if not_approved_slots:
        numbers = ", ".join(str(number) for number in not_approved_slots)
        raise AssessmentSetReviewServiceError(
            "All questions must be approved before the assessment set can be "
            f"approved. Affected slots: {numbers}."
        )


def _queue_manager_notifications(
    db: Session,
    question_set: QuestionSet,
    assessment_set: AssessmentSet,
    notification_type: str,
    title: str,
    message: str,
) -> None:
    """Queue notifications for all managers assigned to the job."""
    manager_ids = _get_assigned_manager_ids(db, question_set.job_id)

    for manager_id in manager_ids:
        create_notification(
            db=db,
            user_id=manager_id,
            notification_type=notification_type,
            title=title,
            message=message,
            entity_type="assessment_set",
            entity_id=assessment_set.id,
        )


def approve_assessment_set(
    db: Session,
    assessment_set_id: int,
    reviewer_id: int,
    comment: str | None = None,
    checklist: dict | None = None,
) -> AssessmentSet:
    """Approve a submitted AssessmentSet after validating every question."""
    assessment_set, question_set = _load_submitted_set(
        db,
        assessment_set_id,
        reviewer_id,
    )

    _validate_set_for_approval(db, assessment_set.id)

    normalized_comment = comment.strip() if comment is not None else None

    if normalized_comment == "":
        normalized_comment = None

    assessment_set.status = "approved"
    assessment_set.reviewer_id = reviewer_id
    assessment_set.reviewed_at = datetime.now(timezone.utc)
    assessment_set.review_comment = normalized_comment
    assessment_set.review_checklist = _normalize_checklist(checklist)

    _queue_manager_notifications(
        db=db,
        question_set=question_set,
        assessment_set=assessment_set,
        notification_type="ASSESSMENT_SET_APPROVED",
        title="Assessment Set Approved",
        message=(
            f'Assessment Set {assessment_set.label} for job "{question_set.name}" '
            "has been approved by the Assessment Reviewer."
        ),
    )

    try:
        db.commit()
        db.refresh(assessment_set)
    except SQLAlchemyError as exc:
        db.rollback()
        raise AssessmentSetReviewServiceError(
            "Unable to approve assessment set."
        ) from exc

    return assessment_set


def reject_assessment_set(
    db: Session,
    assessment_set_id: int,
    reviewer_id: int,
    comment: str | None = None,
    checklist: dict | None = None,
) -> AssessmentSet:
    """Reject a submitted AssessmentSet with a required review reason."""
    normalized_comment = comment.strip() if comment is not None else ""

    if not normalized_comment:
        raise AssessmentSetReviewServiceError("A rejection reason is required.")

    assessment_set, question_set = _load_submitted_set(
        db,
        assessment_set_id,
        reviewer_id,
    )

    assessment_set.status = "rejected"
    assessment_set.reviewer_id = reviewer_id
    assessment_set.reviewed_at = datetime.now(timezone.utc)
    assessment_set.review_comment = normalized_comment
    assessment_set.review_checklist = _normalize_checklist(checklist)

    _queue_manager_notifications(
        db=db,
        question_set=question_set,
        assessment_set=assessment_set,
        notification_type="ASSESSMENT_SET_REJECTED",
        title="Assessment Set Rejected",
        message=(
            f'Assessment Set {assessment_set.label} for job "{question_set.name}" '
            f"was rejected by the Assessment Reviewer. Reason: {normalized_comment}"
        ),
    )

    try:
        db.commit()
        db.refresh(assessment_set)
    except SQLAlchemyError as exc:
        db.rollback()
        raise AssessmentSetReviewServiceError(
            "Unable to reject assessment set."
        ) from exc

    return assessment_set