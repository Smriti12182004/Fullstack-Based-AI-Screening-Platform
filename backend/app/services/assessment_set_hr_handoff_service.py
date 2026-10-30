"""Reviewer-to-HR AssessmentSet handoff service.

This service owns the transition from a reviewer-approved AssessmentSet
into the HR delivery workspace.

The AssessmentSet review lifecycle itself remains:

    draft
    submitted_for_review
    approved
    rejected

HR handoff is represented by explicit metadata on the AssessmentSet:

    sent_to_hr_by
    sent_to_hr_at

The AssessmentSet status is intentionally NOT changed to another review
status during handoff.
"""

from __future__ import annotations

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.timestamps import utc_now
from app.models import (
    Assessment,
    AssessmentSet,
    JobAssessmentAccess,
    Job,
    Notification,
    QuestionSet,
    User,
)
from app.services.assessment_service import (
    AssessmentServiceError,
    materialize_assessment_set,
)


class AssessmentSetHRHandoffServiceError(Exception):
    """Raised when an AssessmentSet cannot be handed off to HR."""


def _get_assessment_set_context(
    db: Session,
    assessment_set_id: int,
) -> tuple[AssessmentSet, QuestionSet, Job]:
    """Load the AssessmentSet, parent QuestionSet, and Job."""

    assessment_set = db.get(
        AssessmentSet,
        assessment_set_id,
    )

    if assessment_set is None:
        raise AssessmentSetHRHandoffServiceError(
            "Assessment set not found."
        )

    question_set = db.get(
        QuestionSet,
        assessment_set.question_set_id,
    )

    if question_set is None:
        raise AssessmentSetHRHandoffServiceError(
            "Parent QuestionSet not found."
        )

    job = db.get(
        Job,
        question_set.job_id,
    )

    if job is None:
        raise AssessmentSetHRHandoffServiceError(
            "Assessment job not found."
        )

    return (
        assessment_set,
        question_set,
        job,
    )


def _get_assigned_reviewer_id(
    db: Session,
    job_id: int,
) -> int:
    """Resolve the single Assessment Reviewer assigned to the job."""

    rows = (
        db.query(User.id)
        .join(
            JobAssessmentAccess,
            JobAssessmentAccess.user_id == User.id,
        )
        .filter(
            JobAssessmentAccess.job_id == job_id,
            User.role == "assessment_reviewer",
        )
        .order_by(
            JobAssessmentAccess.created_at.asc(),
            User.id.asc(),
        )
        .all()
    )

    if not rows:
        raise AssessmentSetHRHandoffServiceError(
            "No Assessment Reviewer is assigned to this job."
        )

    if len(rows) > 1:
        raise AssessmentSetHRHandoffServiceError(
            "Multiple Assessment Reviewers are assigned to this job. "
            "Assign exactly one reviewer before handing the assessment "
            "off to HR."
        )

    return int(rows[0][0])


def _ensure_reviewer_access(
    db: Session,
    job_id: int,
    reviewer_id: int,
) -> None:
    """Ensure the authenticated reviewer owns the review scope."""

    assigned_reviewer_id = _get_assigned_reviewer_id(
        db=db,
        job_id=job_id,
    )

    if int(assigned_reviewer_id) != int(reviewer_id):
        raise AssessmentSetHRHandoffServiceError(
            "You are not the assigned reviewer for this assessment set."
        )


def _get_hr_user(
    db: Session,
    job: Job,
    hr_user_id: int | None = None,
) -> User:
    """Resolve and validate the selected HR/recruiter."""

    selected_user_id = job.created_by if hr_user_id is None else int(hr_user_id)

    hr_user = (
        db.query(User)
        .filter(
            User.id == selected_user_id,
            User.role == "recruiter",
        )
        .first()
    )

    if hr_user is None:
        if hr_user_id is None:
            message = "The HR owner for this job could not be found."
        else:
            message = (
                "The selected HR recipient could not be found "
                "or is not a recruiter."
            )
        raise AssessmentSetHRHandoffServiceError(message)

    return hr_user


def list_hr_recipients(db: Session) -> list[dict]:
    """List available recruiter accounts for reviewer handoff selection."""

    users = (
        db.query(User)
        .filter(User.role == "recruiter")
        .order_by(User.full_name.asc(), User.username.asc())
        .all()
    )

    return [
        {
            "id": user.id,
            "name": user.full_name or user.username,
            "email": user.email,
        }
        for user in users
    ]


def _get_existing_assessment(
    db: Session,
    assessment_set: AssessmentSet,
) -> Assessment | None:
    """Load an Assessment already materialized for this set variant."""

    return (
        db.query(Assessment)
        .filter(
            Assessment.question_set_id
            == assessment_set.question_set_id,
            Assessment.variant_number
            == assessment_set.variant_number,
        )
        .first()
    )


def _get_or_materialize_assessment(
    db: Session,
    assessment_set: AssessmentSet,
) -> Assessment:
    """
    Return the candidate-facing Assessment for the approved set.

    A previously materialized ready/approved Assessment is reused.

    Otherwise the existing materialization service is invoked. The
    materializer is responsible for copying the approved AssessmentSet
    questions into immutable AssessmentQuestion snapshots.
    """

    assessment = _get_existing_assessment(
        db=db,
        assessment_set=assessment_set,
    )

    if assessment is None:
        try:
            assessment = materialize_assessment_set(
                db=db,
                assessment_set_id=assessment_set.id,
            )

        except AssessmentServiceError as exc:
            raise AssessmentSetHRHandoffServiceError(
                str(exc)
            ) from exc

    if assessment.status != "ready":
        raise AssessmentSetHRHandoffServiceError(
            "The candidate-facing assessment is not in a ready state "
            "for HR handoff."
        )

    if assessment.review_status != "approved":
        raise AssessmentSetHRHandoffServiceError(
            "The candidate-facing assessment is not reviewer-approved."
        )

    if assessment.job_id != assessment_set.question_set.job_id:
        raise AssessmentSetHRHandoffServiceError(
            "The candidate-facing assessment does not belong to the "
            "AssessmentSet job."
        )

    return assessment


def _build_hr_notification(
    hr_user: User,
    job: Job,
    assessment_set: AssessmentSet,
    assessment: Assessment,
) -> Notification:
    """Build the notification that appears in the HR workspace."""

    set_label = assessment_set.label or (
        f"Set {assessment_set.variant_number}"
    )

    return Notification(
        user_id=hr_user.id,
        notification_type="ASSESSMENT_SENT_TO_HR",
        title="Assessment ready for HR",
        message=(
            f"{job.title} — {set_label} has been approved by the "
            f"Assessment Reviewer and is now ready for HR configuration."
        ),
        entity_type="assessment",
        entity_id=assessment.id,
        is_read=False,
    )


def _build_response(
    assessment_set: AssessmentSet,
    assessment: Assessment,
    hr_user: User,
) -> dict:
    """Return a stable API response for the frontend handoff flow."""

    return {
        "assessment_set_id": assessment_set.id,
        "assessment_id": assessment.id,
        "job_id": assessment.job_id,
        "question_set_id": assessment.question_set_id,
        "variant_number": assessment.variant_number,
        "title": assessment.title,
        "status": assessment.status,
        "review_status": assessment.review_status,
        "sent_to_hr": True,
        "sent_to_hr_by": assessment_set.sent_to_hr_by,
        "sent_to_hr_at": assessment_set.sent_to_hr_at,
        "hr_user_id": hr_user.id,
        "hr_contact": {
            "id": hr_user.id,
            "name": hr_user.full_name or hr_user.username,
            "email": hr_user.email,
        },
        "message": "Assessment sent to HR successfully.",
    }


def send_assessment_set_to_hr(
    db: Session,
    assessment_set_id: int,
    reviewer_id: int,
    hr_user_id: int | None = None,
) -> dict:
    """
    Hand one approved AssessmentSet from the reviewer to HR.

    Rules:

    - the AssessmentSet must exist
    - the AssessmentSet must be approved
    - the reviewer must be the single reviewer assigned to the Job
    - the Job must have a recruiter/HR owner
    - a candidate-facing Assessment must exist or be materialized
    - that Assessment must be ready and reviewer-approved
    - handoff metadata is persisted on the AssessmentSet
    - one HR notification is created
    - repeated calls return the existing handoff without duplication
    """

    (
        assessment_set,
        question_set,
        job,
    ) = _get_assessment_set_context(
        db=db,
        assessment_set_id=assessment_set_id,
    )

    _ensure_reviewer_access(
        db=db,
        job_id=question_set.job_id,
        reviewer_id=reviewer_id,
    )

    if str(assessment_set.status or "").strip().lower() != "approved":
        raise AssessmentSetHRHandoffServiceError(
            "Only approved assessment sets can be sent to HR."
        )

    # ------------------------------------------------------------------
    # IDEMPOTENT REPEAT HANDOFF
    # ------------------------------------------------------------------

    if (
        assessment_set.sent_to_hr_by is not None
        or assessment_set.sent_to_hr_at is not None
    ):
        if (
            assessment_set.sent_to_hr_by is None
            or assessment_set.sent_to_hr_at is None
        ):
            raise AssessmentSetHRHandoffServiceError(
                "The AssessmentSet has incomplete HR handoff metadata."
            )

        if int(assessment_set.sent_to_hr_by) != int(reviewer_id):
            raise AssessmentSetHRHandoffServiceError(
                "This AssessmentSet has already been handed off to HR."
            )

        existing_hr_user = _get_hr_user(
            db=db,
            job=job,
            hr_user_id=(
                assessment_set.sent_to_hr_user_id or job.created_by
            ),
        )

        assessment = _get_existing_assessment(
            db=db,
            assessment_set=assessment_set,
        )

        if assessment is None:
            raise AssessmentSetHRHandoffServiceError(
                "The AssessmentSet is marked as sent to HR, but its "
                "candidate-facing assessment could not be found."
            )

        return _build_response(
            assessment_set=assessment_set,
            assessment=assessment,
            hr_user=existing_hr_user,
        )

    hr_user = _get_hr_user(
        db=db,
        job=job,
        hr_user_id=hr_user_id,
    )

    # ------------------------------------------------------------------
    # MATERIALIZE / REUSE CANDIDATE-FACING ASSESSMENT
    # ------------------------------------------------------------------

    assessment = _get_or_materialize_assessment(
        db=db,
        assessment_set=assessment_set,
    )

    # ------------------------------------------------------------------
    # PERSIST HANDOFF + HR NOTIFICATION
    # ------------------------------------------------------------------

    assessment_set.sent_to_hr_user_id = hr_user.id
    assessment_set.sent_to_hr_by = reviewer_id
    assessment_set.sent_to_hr_at = utc_now()

    notification = _build_hr_notification(
        hr_user=hr_user,
        job=job,
        assessment_set=assessment_set,
        assessment=assessment,
    )

    db.add(notification)

    try:
        db.commit()
        db.refresh(assessment_set)
        db.refresh(assessment)
        db.refresh(notification)

    except SQLAlchemyError as exc:
        db.rollback()

        raise AssessmentSetHRHandoffServiceError(
            "Unable to complete the AssessmentSet HR handoff."
        ) from exc

    return _build_response(
        assessment_set=assessment_set,
        assessment=assessment,
        hr_user=hr_user,
    )