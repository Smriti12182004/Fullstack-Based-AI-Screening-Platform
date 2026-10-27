
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role, require_role
from app.db.session import get_db
from app.db.timestamps import utc_now
from app.models import (
    Assessment,
    AssessmentAssignment,
    AssessmentQuestion,
    Attempt,
    AuditEvent,
    Job,
    JobAssessmentAccess,
    QuestionSet,
    QuestionSetConfiguration,
    Response,
    Result,
    User,
)
from app.schemas.assessment import (
    AssessmentAssignmentRequest,
    AssessmentAssemblyRequest,
    AssessmentResponse,
    AssessmentVariantsAssemblyRequest,
)
from app.services.assessment_service import (
    AssessmentServiceError,
    assemble_assessment,
    assemble_assessment_variants,
)
from app.services.assessment_scoring_queue import enqueue_assessment_scoring


router = APIRouter(
    prefix="/assessments",
    tags=["Assessments"],
)

logger = logging.getLogger(__name__)
QUEUE_FAILURE_FEEDBACK = (
    "Automatic grading could not be queued. HR review is required."
)


class AssessmentScoreOverrideRequest(BaseModel):
    """Validated HR input for manually reviewed assessment scores."""

    score: Decimal = Field(
        ge=Decimal("0"),
        le=Decimal("100"),
        max_digits=5,
        decimal_places=2,
    )
    reason: str = Field(min_length=5, max_length=1000)


def _serialize_assessment_result(result):
    """Serialize grading results without exposing unconfirmed aggregate scores."""
    if result is None:
        return None

    score_is_final = str(result.status or "").strip().lower() == "completed"

    return {
        "status": result.status,
        "score": (
            float(result.score)
            if score_is_final and result.score is not None
            else None
        ),
        "earned_points": (
            float(result.earned_points)
            if score_is_final and result.earned_points is not None
            else None
        ),
        "max_points": (
            float(result.max_points)
            if score_is_final and result.max_points is not None
            else None
        ),
        "skill_scores": result.skill_scores or [],
        "section_scores": result.section_scores or [],
        "question_scores": result.question_scores or [],
        "feedback": result.feedback,
        "graded_at": _as_utc(result.graded_at),
    }


def _is_retryable_queue_failure(result: Result | None) -> bool:
    """Return True only for review states caused by enqueue failure.

    Grading/evaluation failures still require human review and must not be
    automatically retried through the pending-grading endpoint.
    """
    return bool(
        result is not None
        and result.status == "needs_review"
        and (result.feedback or "").strip().startswith(
            "Automatic grading could not be queued."
        )
    )


def _queue_assessment_scoring(db: Session, attempt_id: int) -> str:
    """Queue grading without undoing submission; log and safely classify failures."""
    result = (
        db.query(Result)
        .filter(Result.attempt_id == attempt_id)
        .order_by(Result.id.desc())
        .first()
    )

    if result is not None:
        if result.status == "completed" and result.score is not None:
            return "completed"
        if result.status == "grading":
            return "grading"
        if (
            result.status == "needs_review"
            and not _is_retryable_queue_failure(result)
        ):
            return "needs_review"

    # Commit the grading state before enqueuing. If the request process exits
    # immediately after enqueueing, the worker can still find the result row.
    try:
        if result is None:
            result = Result(
                attempt_id=attempt_id,
                score=None,
                status="grading",
            )
            db.add(result)
        else:
            result.status = "grading"
            result.score = None
            result.feedback = None
            result.graded_at = None

        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Could not prepare result row before queueing grading for attempt_id=%s",
            attempt_id,
        )
        return _persist_queue_failure(db, attempt_id)

    # Keep enqueue failure handling separate from job-ID persistence. If RQ
    # accepted the job but the later DB commit fails, do not claim that the job
    # could not be queued: the worker may already be processing it.
    try:
        job = enqueue_assessment_scoring(attempt_id=attempt_id)
    except Exception:
        db.rollback()
        logger.exception(
            "Could not enqueue assessment grading for attempt_id=%s",
            attempt_id,
        )
        return _persist_queue_failure(db, attempt_id)

    try:
        # The worker can finish before this request stores the RQ job ID.
        db.expire_all()
        result = (
            db.query(Result)
            .filter(Result.attempt_id == attempt_id)
            .order_by(Result.id.desc())
            .first()
        )

        if result is not None:
            result.grading_job_id = str(job.id)
            db.commit()
            return result.status or "grading"

        return "grading"
    except Exception:
        db.rollback()
        logger.exception(
            "Grading job was queued for attempt_id=%s, but saving its job ID failed",
            attempt_id,
        )
        # The RQ job was successfully created. Leave the persisted result in
        # the already-committed grading state; do not mislabel it as unqueued.
        return "grading"


def _persist_queue_failure(db: Session, attempt_id: int) -> str:
    """Persist a retryable review state after grading could not be queued."""
    try:
        result = (
            db.query(Result)
            .filter(Result.attempt_id == attempt_id)
            .order_by(Result.id.desc())
            .first()
        )

        if result is None:
            result = Result(
                attempt_id=attempt_id,
                score=None,
                status="needs_review",
                feedback=QUEUE_FAILURE_FEEDBACK,
                graded_at=utc_now(),
            )
            db.add(result)
        else:
            result.status = "needs_review"
            result.score = None
            result.feedback = QUEUE_FAILURE_FEEDBACK
            result.graded_at = utc_now()

        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "Could not persist the grading-queue failure state for attempt_id=%s",
            attempt_id,
        )

    return "needs_review"


def _get_question_set_for_manager(
    db: Session,
    question_set_id: int,
    current_user: dict,
) -> QuestionSet:
    question_set = db.get(QuestionSet, question_set_id)

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found",
        )

    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == question_set.job_id,
            JobAssessmentAccess.user_id == current_user["user_id"],
        )
        .first()
    )

    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to manage assessments for this job.",
        )

    return question_set


def _get_assessment_for_assignment(
    db: Session,
    assessment_id: int,
    current_user: dict,
) -> Assessment:
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == assessment.job_id,
            JobAssessmentAccess.user_id == current_user["user_id"],
        )
        .first()
    )

    if access is None and current_user["role"] != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this assessment.",
        )

    return assessment


@router.post(
    "/assemble",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assemble_assessment_endpoint(
    request: AssessmentAssemblyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    _get_question_set_for_manager(
        db=db,
        question_set_id=request.question_set_id,
        current_user=current_user,
    )

    try:
        return assemble_assessment(
            db=db,
            question_set_id=request.question_set_id,
            title=request.title,
            variant_number=request.variant_number,
        )
    except AssessmentServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post(
    "/assemble-variants",
    response_model=list[AssessmentResponse],
    status_code=status.HTTP_201_CREATED,
)
def assemble_assessment_variants_endpoint(
    request: AssessmentVariantsAssemblyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    _get_question_set_for_manager(
        db=db,
        question_set_id=request.question_set_id,
        current_user=current_user,
    )

    try:
        return assemble_assessment_variants(
            db=db,
            question_set_id=request.question_set_id,
            title=request.title,
        )
    except AssessmentServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "/question-set/{question_set_id}/variants",
    response_model=list[AssessmentResponse],
)
def get_assessment_variants(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    _get_question_set_for_manager(
        db=db,
        question_set_id=question_set_id,
        current_user=current_user,
    )

    return (
        db.query(Assessment)
        .filter(Assessment.question_set_id == question_set_id)
        .order_by(
            Assessment.variant_number.asc(),
            Assessment.id.asc(),
        )
        .all()
    )


@router.post(
    "/{assessment_id}/assign",
    response_model=AssessmentResponse,
)
def assign_assessment_to_candidate(
    assessment_id: int,
    request: AssessmentAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role("recruiter", "assessment_manager")
    ),
):
    assessment = _get_assessment_for_assignment(
        db=db,
        assessment_id=assessment_id,
        current_user=current_user,
    )

    if assessment.status != "published":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Only published assessments can be assigned to candidates.",
        )

    if assessment.review_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Only reviewer-approved assessments can be assigned to candidates.",
        )

    candidate = db.get(User, request.candidate_id)

    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    if candidate.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Selected user is not a candidate.",
        )

    existing_attempt = (
        db.query(Attempt)
        .filter(
            Attempt.assessment_id == assessment.id,
            Attempt.candidate_id == candidate.id,
        )
        .first()
    )

    if existing_attempt is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This assessment is already assigned to this candidate.",
        )

    attempt = Attempt(
        assessment_id=assessment.id,
        candidate_id=candidate.id,
        status="assigned",
        started_at=None,
        expires_at=None,
    )

    db.add(attempt)
    db.commit()

    return assessment


class CandidateAnswerRequest(BaseModel):
    answer_text: str | None = Field(default=None, max_length=10000)


class CandidateProctorEventRequest(BaseModel):
    event_type: Literal[
        "tab_hidden",
        "fullscreen_exit",
        "fullscreen_unavailable",
        "window_blur",
        "copy_attempt",
        "cut_attempt",
        "paste_attempt",
        "context_menu",
    ]


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)


def _get_candidate_assignment(
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
        .with_for_update()
        .first()
    )


def _get_candidate_attempt(
    db: Session,
    assessment_id: int,
    candidate_id: int,
) -> Attempt | None:
    return (
        db.query(Attempt)
        .filter(
            Attempt.assessment_id == assessment_id,
            Attempt.candidate_id == candidate_id,
        )
        .order_by(Attempt.created_at.desc(), Attempt.id.desc())
        .with_for_update()
        .first()
    )


def _get_assessment_duration(
    db: Session,
    assessment: Assessment,
) -> tuple[int, str | None]:
    if assessment.question_set_id is None:
        return 0, None

    configuration = (
        db.query(QuestionSetConfiguration)
        .filter(
            QuestionSetConfiguration.question_set_id
            == assessment.question_set_id,
        )
        .first()
    )

    if configuration is None:
        return 0, None

    return (
        int(configuration.duration_minutes or 0),
        configuration.candidate_instructions,
    )


def _record_assessment_event(
    db: Session,
    *,
    user_id: int,
    attempt_id: int,
    action: str,
    assessment_id: int,
    details: dict | None = None,
) -> None:
    event_details = {
        "assessment_id": assessment_id,
        **(details or {}),
    }

    db.add(
        AuditEvent(
            user_id=user_id,
            attempt_id=attempt_id,
            action=action,
            entity_type="assessment_attempt",
            entity_id=attempt_id,
            details=json.dumps(event_details, ensure_ascii=True),
        )
    )


def _require_in_progress_attempt(
    db: Session,
    assessment_id: int,
    candidate_id: int,
) -> tuple[Assessment, Attempt, AssessmentAssignment | None]:
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    if assessment.status != "published":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This assessment is not available.",
        )

    assignment = _get_candidate_assignment(
        db,
        assessment_id,
        candidate_id,
    )
    attempt = _get_candidate_attempt(
        db,
        assessment_id,
        candidate_id,
    )

    if assignment is None and attempt is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment not assigned to this candidate",
        )

    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Start the assessment before saving answers or recording events.",
        )

    if attempt.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This assessment attempt is not in progress.",
        )

    now = _as_utc(utc_now())
    expires_at = _as_utc(attempt.expires_at)

    if expires_at is not None and now is not None and now >= expires_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The assessment time has expired.",
        )

    if assignment is not None:
        closes_at = _as_utc(assignment.closes_at)

        if closes_at is not None and now is not None and now >= closes_at:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The assessment availability window has closed.",
            )

    return assessment, attempt, assignment


@router.post("/{assessment_id}/start")
def start_candidate_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    if assessment.status != "published":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This assessment is not available yet.",
        )

    if assessment.review_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This assessment has not passed review.",
        )

    candidate_id = current_user["user_id"]
    assignment = _get_candidate_assignment(
        db,
        assessment_id,
        candidate_id,
    )
    attempt = _get_candidate_attempt(
        db,
        assessment_id,
        candidate_id,
    )

    if assignment is None and attempt is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment not assigned to this candidate",
        )

    now = _as_utc(utc_now())

    if assignment is not None:
        if assignment.status not in {"assigned", "in_progress"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This assessment assignment is no longer available.",
            )

        if attempt is None or attempt.status != "in_progress":
            opens_at = _as_utc(assignment.opens_at)
            closes_at = _as_utc(assignment.closes_at)

            if opens_at is not None and now is not None and now < opens_at:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This assessment is not open yet.",
                )

            if closes_at is not None and now is not None and now >= closes_at:
                assignment.status = "expired"
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="The assessment availability window has closed.",
                )

    if attempt is not None and attempt.status == "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This assessment has already been submitted.",
        )

    if attempt is not None and attempt.status == "expired":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This assessment attempt has expired.",
        )

    if attempt is not None and attempt.status == "in_progress":
        expires_at = _as_utc(attempt.expires_at)

        if expires_at is not None and now is not None and now >= expires_at:
            attempt.status = "submitted"
            attempt.submitted_at = now

            if assignment is not None:
                assignment.status = "submitted"

            _record_assessment_event(
                db,
                user_id=candidate_id,
                attempt_id=attempt.id,
                action="assessment_auto_submitted",
                assessment_id=assessment.id,
                details={"reason": "timer_expired"},
            )

            db.commit()
            db.refresh(attempt)

            grading_status = _queue_assessment_scoring(db, attempt.id)

            return {
                "assessment_id": assessment.id,
                "attempt_id": attempt.id,
                "status": attempt.status,
                "started_at": attempt.started_at,
                "expires_at": attempt.expires_at,
                "submitted_at": attempt.submitted_at,
                "grading_status": grading_status,
            }

        if assignment is not None and assignment.status != "in_progress":
            assignment.status = "in_progress"
            db.commit()

        return {
            "assessment_id": assessment.id,
            "attempt_id": attempt.id,
            "status": attempt.status,
            "started_at": attempt.started_at,
            "expires_at": attempt.expires_at,
        }

    duration_minutes, _instructions = _get_assessment_duration(
        db,
        assessment,
    )

    if duration_minutes <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Assessment duration is not configured.",
        )

    started_at = now or _as_utc(utc_now())
    expires_at = started_at + timedelta(minutes=duration_minutes)

    if attempt is None:
        attempt = Attempt(
            assessment_id=assessment.id,
            candidate_id=candidate_id,
            status="in_progress",
            started_at=started_at,
            expires_at=expires_at,
        )
        db.add(attempt)
        db.flush()
    else:
        attempt.status = "in_progress"
        attempt.started_at = started_at
        attempt.expires_at = expires_at

    if assignment is not None:
        assignment.status = "in_progress"

    _record_assessment_event(
        db,
        user_id=candidate_id,
        attempt_id=attempt.id,
        action="assessment_started",
        assessment_id=assessment.id,
        details={"duration_minutes": duration_minutes},
    )

    db.commit()
    db.refresh(attempt)

    return {
        "assessment_id": assessment.id,
        "attempt_id": attempt.id,
        "status": attempt.status,
        "started_at": attempt.started_at,
        "expires_at": attempt.expires_at,
    }


@router.get("")
def get_candidate_assessments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    candidate_id = current_user["user_id"]

    attempt_rows = (
        db.query(Attempt, Assessment)
        .join(Assessment, Attempt.assessment_id == Assessment.id)
        .filter(Attempt.candidate_id == candidate_id)
        .order_by(
            Assessment.created_at.desc(),
            Attempt.created_at.desc(),
            Attempt.id.desc(),
        )
        .all()
    )

    latest_by_assessment: dict[int, dict] = {}

    for attempt, assessment in attempt_rows:
        if assessment.id in latest_by_assessment:
            continue

        latest_by_assessment[assessment.id] = {
            "assessment_id": assessment.id,
            "job_id": assessment.job_id,
            "title": assessment.title,
            "assessment_status": assessment.status,
            "attempt_id": attempt.id,
            "attempt_status": attempt.status,
            "started_at": attempt.started_at,
            "expires_at": attempt.expires_at,
            "submitted_at": attempt.submitted_at,
            "assignment_status": None,
            "opens_at": None,
            "closes_at": None,
        }

    assignment_rows = (
        db.query(AssessmentAssignment, Assessment)
        .join(
            Assessment,
            AssessmentAssignment.assessment_id == Assessment.id,
        )
        .filter(AssessmentAssignment.candidate_id == candidate_id)
        .order_by(
            Assessment.created_at.desc(),
            AssessmentAssignment.created_at.desc(),
        )
        .all()
    )

    for assignment, assessment in assignment_rows:
        if assessment.id in latest_by_assessment:
            latest_by_assessment[assessment.id].update(
                assignment_status=assignment.status,
                opens_at=_as_utc(assignment.opens_at),
                closes_at=_as_utc(assignment.closes_at),
            )
            continue

        latest_by_assessment[assessment.id] = {
            "assessment_id": assessment.id,
            "job_id": assessment.job_id,
            "title": assessment.title,
            "assessment_status": assessment.status,
            "attempt_id": None,
            "attempt_status": assignment.status,
            "started_at": None,
            "expires_at": None,
            "submitted_at": None,
            "assignment_status": assignment.status,
            "opens_at": _as_utc(assignment.opens_at),
            "closes_at": _as_utc(assignment.closes_at),
        }

    return list(latest_by_assessment.values())


@router.get("/{assessment_id}")
def get_assessment_for_candidate(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    if assessment.status != "published":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This assessment is not available yet.",
        )

    candidate_id = current_user["user_id"]
    assignment = _get_candidate_assignment(
        db,
        assessment_id,
        candidate_id,
    )
    attempt = _get_candidate_attempt(
        db,
        assessment_id,
        candidate_id,
    )

    if assignment is None and attempt is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment not assigned to this candidate",
        )

    duration_minutes, candidate_instructions = _get_assessment_duration(
        db,
        assessment,
    )

    opens_at = (
        _as_utc(assignment.opens_at)
        if assignment is not None
        else None
    )
    closes_at = (
        _as_utc(assignment.closes_at)
        if assignment is not None
        else None
    )
    now = _as_utc(utc_now())

    if attempt is not None and attempt.status == "in_progress":
        expires_at = _as_utc(attempt.expires_at)
        window_status = (
            "closed"
            if expires_at is not None and now is not None and now >= expires_at
            else "open"
        )
    elif assignment is None:
        window_status = "open"
    elif opens_at is not None and now is not None and now < opens_at:
        window_status = "not_open"
    elif closes_at is not None and now is not None and now >= closes_at:
        window_status = "closed"
    else:
        window_status = "open"

    assessment_questions = (
        db.query(AssessmentQuestion)
        .filter(AssessmentQuestion.assessment_id == assessment.id)
        .order_by(AssessmentQuestion.display_order)
        .all()
    )

    questions = []
    answers = {}

    # Do not disclose question content before the candidate starts.
    if attempt is not None and attempt.status == "in_progress":
        questions = [
            {
                "id": item.id,
                "question_id": item.question_id,
                "display_order": item.display_order,
                "question_text": item.question_text,
                "question_type": item.question_type,
                "skill_id": item.skill_id,
                "difficulty": item.difficulty,
                "options": item.options,
            }
            for item in assessment_questions
        ]

        saved_responses = (
            db.query(Response)
            .filter(Response.attempt_id == attempt.id)
            .all()
        )

        answers = {
            str(response.question_id): response.answer_text
            for response in saved_responses
        }

    return {
        "assessment_id": assessment.id,
        "job_id": assessment.job_id,
        "title": assessment.title,
        "status": assessment.status,
        "attempt_id": attempt.id if attempt is not None else None,
        "attempt_status": (
            attempt.status if attempt is not None else assignment.status
        ),
        "assignment_status": (
            assignment.status if assignment is not None else None
        ),
        "started_at": (
            _as_utc(attempt.started_at) if attempt is not None else None
        ),
        "expires_at": (
            _as_utc(attempt.expires_at) if attempt is not None else None
        ),
        "submitted_at": (
            _as_utc(attempt.submitted_at) if attempt is not None else None
        ),
        "opens_at": opens_at,
        "closes_at": closes_at,
        "window_status": window_status,
        "duration_minutes": duration_minutes,
        "candidate_instructions": candidate_instructions,
        "question_count": len(assessment_questions),
        "questions": questions,
        "answers": answers,
    }


@router.put("/{assessment_id}/answers/{question_id}")
def save_candidate_answer(
    assessment_id: int,
    question_id: int,
    request: CandidateAnswerRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    assessment, attempt, _assignment = _require_in_progress_attempt(
        db,
        assessment_id,
        current_user["user_id"],
    )

    question = (
        db.query(AssessmentQuestion)
        .filter(
            AssessmentQuestion.assessment_id == assessment.id,
            AssessmentQuestion.question_id == question_id,
        )
        .first()
    )

    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question is not part of this assessment.",
        )

    response = (
        db.query(Response)
        .filter(
            Response.attempt_id == attempt.id,
            Response.question_id == question_id,
        )
        .first()
    )

    if response is None:
        response = Response(
            attempt_id=attempt.id,
            question_id=question_id,
            answer_text=request.answer_text,
        )
        db.add(response)
    else:
        response.answer_text = request.answer_text

    db.commit()
    db.refresh(response)

    return {
        "attempt_id": attempt.id,
        "question_id": question_id,
        "answer_text": response.answer_text,
        "saved": True,
    }


@router.post("/{assessment_id}/proctor-events")
def record_candidate_proctor_event(
    assessment_id: int,
    request: CandidateProctorEventRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    assessment, attempt, _assignment = _require_in_progress_attempt(
        db,
        assessment_id,
        current_user["user_id"],
    )

    _record_assessment_event(
        db,
        user_id=current_user["user_id"],
        attempt_id=attempt.id,
        action=f"proctor_{request.event_type}",
        assessment_id=assessment.id,
        details={"source": "candidate_browser"},
    )

    db.commit()

    return {
        "recorded": True,
        "event_type": request.event_type,
    }


@router.get("/{assessment_id}/proctor-events")
def get_candidate_proctor_events(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    """Return proctoring events for the candidate's active attempt."""
    _assessment, attempt, _assignment = _require_in_progress_attempt(
        db,
        assessment_id,
        current_user["user_id"],
    )

    countable_actions = [
        "proctor_tab_hidden",
        "proctor_fullscreen_exit",
        "proctor_window_blur",
        "proctor_copy_attempt",
        "proctor_cut_attempt",
        "proctor_paste_attempt",
        "proctor_context_menu",
    ]

    events = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.attempt_id == attempt.id,
            AuditEvent.action.in_(countable_actions),
        )
        .order_by(
            AuditEvent.created_at.asc(),
            AuditEvent.id.asc(),
        )
        .all()
    )

    return {
        "assessment_id": assessment_id,
        "attempt_id": attempt.id,
        "violation_count": len(events),
        "events": [
            {
                "event_type": event.action.removeprefix("proctor_"),
                "created_at": (
                    event.created_at.isoformat()
                    if event.created_at
                    else None
                ),
            }
            for event in events
        ],
    }


@router.post("/{assessment_id}/submit")
def submit_candidate_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    candidate_id = current_user["user_id"]
    assignment = _get_candidate_assignment(
        db,
        assessment_id,
        candidate_id,
    )
    attempt = _get_candidate_attempt(
        db,
        assessment_id,
        candidate_id,
    )

    if assignment is None and attempt is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment not assigned to this candidate",
        )

    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Start the assessment before submitting it.",
        )

    if attempt.status == "submitted":
        grading_status = _queue_assessment_scoring(db, attempt.id)

        return {
            "assessment_id": assessment.id,
            "attempt_id": attempt.id,
            "status": attempt.status,
            "submitted_at": _as_utc(attempt.submitted_at),
            "grading_status": grading_status,
            "already_submitted": True,
        }

    if attempt.status != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This assessment attempt cannot be submitted in its current state.",
        )

    now = _as_utc(utc_now())
    expires_at = _as_utc(attempt.expires_at)
    timed_out = (
        expires_at is not None
        and now is not None
        and now >= expires_at
    )

    attempt.status = "submitted"
    attempt.submitted_at = now

    if assignment is not None:
        assignment.status = "submitted"

    _record_assessment_event(
        db,
        user_id=candidate_id,
        attempt_id=attempt.id,
        action=(
            "assessment_auto_submitted"
            if timed_out
            else "assessment_submitted"
        ),
        assessment_id=assessment.id,
        details={"reason": "timer_expired"} if timed_out else {},
    )

    # Submission is committed before grading is queued.
    db.commit()
    db.refresh(attempt)

    grading_status = _queue_assessment_scoring(db, attempt.id)

    return {
        "assessment_id": assessment.id,
        "attempt_id": attempt.id,
        "status": attempt.status,
        "submitted_at": _as_utc(attempt.submitted_at),
        "timed_out": timed_out,
        "grading_status": grading_status,
        "already_submitted": False,
    }


@router.get("/{assessment_id}/results")
def get_assessment_results_for_hr(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role("recruiter", "assessment_manager")
    ),
):
    """Return every assigned candidate, their attempt state, and any scores."""
    assessment = _get_assessment_for_assignment(
        db=db,
        assessment_id=assessment_id,
        current_user=current_user,
    )

    assignments = (
        db.query(AssessmentAssignment)
        .filter(AssessmentAssignment.assessment_id == assessment.id)
        .order_by(
            AssessmentAssignment.created_at.desc(),
            AssessmentAssignment.id.desc(),
        )
        .all()
    )

    assignments_by_candidate = {
        int(assignment.candidate_id): assignment
        for assignment in assignments
    }

    # Include all attempts, not only submitted attempts, so HR can see
    # assigned and in-progress candidates alongside completed submissions.
    attempts = (
        db.query(Attempt)
        .filter(Attempt.assessment_id == assessment.id)
        .order_by(Attempt.id.desc())
        .all()
    )

    candidates_with_attempts = {
        int(attempt.candidate_id)
        for attempt in attempts
    }

    rows = []

    def candidate_identity(candidate_id: int) -> tuple[str, str | None]:
        candidate = db.get(User, candidate_id)

        first_name = str(
            getattr(candidate, "first_name", "") or ""
        ).strip()
        last_name = str(
            getattr(candidate, "last_name", "") or ""
        ).strip()

        name = (
            getattr(candidate, "full_name", None)
            or getattr(candidate, "name", None)
            or " ".join(part for part in (first_name, last_name) if part)
            or getattr(candidate, "username", None)
            or f"Candidate {candidate_id}"
        )

        email = getattr(candidate, "email", None)

        return str(name), email

    serialize_result = _serialize_assessment_result

    for attempt in attempts:
        candidate_name, candidate_email = candidate_identity(
            int(attempt.candidate_id)
        )
        assignment = assignments_by_candidate.get(
            int(attempt.candidate_id)
        )

        result = (
            db.query(Result)
            .filter(Result.attempt_id == attempt.id)
            .order_by(Result.id.desc())
            .first()
        )

        rows.append(
            {
                "assessment_id": assessment.id,
                "assessment_title": assessment.title,
                "assignment_id": assignment.id if assignment else None,
                "assignment_status": (
                    assignment.status if assignment else None
                ),
                "opens_at": (
                    _as_utc(assignment.opens_at) if assignment else None
                ),
                "closes_at": (
                    _as_utc(assignment.closes_at) if assignment else None
                ),
                "attempt_id": attempt.id,
                "candidate_id": attempt.candidate_id,
                "candidate_name": candidate_name,
                "candidate_email": candidate_email,
                "attempt_status": attempt.status,
                "started_at": _as_utc(attempt.started_at),
                "submitted_at": _as_utc(attempt.submitted_at),
                "result": serialize_result(result),
            }
        )

    # HR activation intentionally creates assignments before candidate
    # attempts exist. Add those candidates to the same list with no score yet.
    for assignment in assignments:
        candidate_id = int(assignment.candidate_id)

        if candidate_id in candidates_with_attempts:
            continue

        candidate_name, candidate_email = candidate_identity(candidate_id)

        rows.append(
            {
                "assessment_id": assessment.id,
                "assessment_title": assessment.title,
                "assignment_id": assignment.id,
                "assignment_status": assignment.status,
                "opens_at": _as_utc(assignment.opens_at),
                "closes_at": _as_utc(assignment.closes_at),
                "attempt_id": None,
                "candidate_id": candidate_id,
                "candidate_name": candidate_name,
                "candidate_email": candidate_email,
                "attempt_status": assignment.status or "assigned",
                "started_at": None,
                "submitted_at": None,
                "result": None,
            }
        )

    submission_count = sum(
        1
        for row in rows
        if row["attempt_status"] == "submitted"
        or row["submitted_at"] is not None
    )

    return {
        "assessment_id": assessment.id,
        "assessment_title": assessment.title,
        "candidate_count": len(rows),
        "submission_count": submission_count,
        "results": rows,
    }


@router.post("/{assessment_id}/results/{attempt_id}/override")
def override_assessment_result_for_hr(
    assessment_id: int,
    attempt_id: int,
    request: AssessmentScoreOverrideRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role("recruiter", "assessment_manager")
    ),
):
    """Apply an authorized and auditable HR score override."""
    assessment = _get_assessment_for_assignment(
        db=db,
        assessment_id=assessment_id,
        current_user=current_user,
    )

    user_id = int(current_user["user_id"])

    # Recruiters must own the job or have explicit access.
    if current_user["role"] == "recruiter":
        owns_job = (
            db.query(Job.id)
            .filter(
                Job.id == assessment.job_id,
                Job.created_by == user_id,
            )
            .first()
        )
        has_access = (
            db.query(JobAssessmentAccess.id)
            .filter(
                JobAssessmentAccess.job_id == assessment.job_id,
                JobAssessmentAccess.user_id == user_id,
            )
            .first()
        )
        if owns_job is None and has_access is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to override scores for this job.",
            )

    # Ensure the attempt belongs to this particular assessment.
    attempt = (
        db.query(Attempt)
        .filter(
            Attempt.id == attempt_id,
            Attempt.assessment_id == assessment.id,
        )
        .with_for_update()
        .first()
    )
    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment attempt not found.",
        )

    if attempt.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only submitted attempts can have their score overridden.",
        )

    result = (
        db.query(Result)
        .filter(Result.attempt_id == attempt.id)
        .order_by(Result.id.desc())
        .with_for_update()
        .first()
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No grading result exists for this attempt.",
        )

    if result.status == "grading":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Grading is in progress; the score cannot be overridden yet.",
        )

    if result.status not in {"completed", "needs_review"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only completed or review-required results can be overridden.",
        )

    reason = request.reason.strip()
    if len(reason) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A meaningful score-override reason is required.",
        )

    previous_score = (
        float(result.score) if result.score is not None else None
    )
    previous_status = result.status
    previous_earned_points = (
        float(result.earned_points)
        if result.earned_points is not None
        else None
    )

    new_score = request.score.quantize(Decimal("0.01"))
    result.score = new_score
    result.status = "completed"
    result.graded_at = utc_now()

    if result.max_points is not None:
        result.earned_points = (
            new_score * Decimal(str(result.max_points)) / Decimal("100")
        ).quantize(Decimal("0.01"))
    else:
        result.earned_points = None

    note = f"HR score override: {reason}"
    existing_feedback = (result.feedback or "").strip()
    result.feedback = (
        f"{existing_feedback}\n\n{note}"
        if existing_feedback
        else note
    )

    # The score update and audit event commit together.
    _record_assessment_event(
        db,
        user_id=user_id,
        attempt_id=attempt.id,
        action="assessment_score_overridden",
        assessment_id=assessment.id,
        details={
            "previous_score": previous_score,
            "new_score": float(new_score),
            "previous_status": previous_status,
            "new_status": "completed",
            "previous_earned_points": previous_earned_points,
            "new_earned_points": (
                float(result.earned_points)
                if result.earned_points is not None
                else None
            ),
            "max_points": (
                float(result.max_points)
                if result.max_points is not None
                else None
            ),
            "reason": reason,
        },
    )

    try:
        db.commit()
        db.refresh(result)
    except Exception as exc:
        db.rollback()
        logger.exception(
            "Failed to commit HR score override: assessment=%s attempt=%s",
            assessment.id,
            attempt.id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save the score override.",
        ) from exc

    return {
        "assessment_id": assessment.id,
        "attempt_id": attempt.id,
        "candidate_id": attempt.candidate_id,
        "result": _serialize_assessment_result(result),
    }


@router.post("/{assessment_id}/results/grade-pending")
def queue_pending_assessment_results_for_hr(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role("recruiter", "assessment_manager")
    ),
):
    """Queue grading for submitted attempts with no result or a pending result."""
    assessment = _get_assessment_for_assignment(
        db=db,
        assessment_id=assessment_id,
        current_user=current_user,
    )

    submitted_attempts = (
        db.query(Attempt)
        .filter(
            Attempt.assessment_id == assessment.id,
            Attempt.status == "submitted",
        )
        .order_by(Attempt.id.desc())
        .all()
    )

    queued_attempts = 0
    already_grading = 0
    already_graded = 0
    needs_review = 0

    for attempt in submitted_attempts:
        result = (
            db.query(Result)
            .filter(Result.attempt_id == attempt.id)
            .order_by(Result.id.desc())
            .first()
        )

        if (
            result is not None
            and result.status == "completed"
            and result.score is not None
        ):
            already_graded += 1
            continue

        if result is not None and result.status == "grading":
            already_grading += 1
            continue

        if (
            result is not None
            and result.status == "needs_review"
            and not _is_retryable_queue_failure(result)
        ):
            needs_review += 1
            continue

        grading_status = _queue_assessment_scoring(db, attempt.id)

        if grading_status == "grading":
            queued_attempts += 1
        elif grading_status == "completed":
            already_graded += 1
        elif grading_status == "needs_review":
            needs_review += 1
        else:
            already_grading += 1

    return {
        "assessment_id": assessment.id,
        "submitted_attempts": len(submitted_attempts),
        "queued_attempts": queued_attempts,
        "already_grading": already_grading,
        "already_graded": already_graded,
        "needs_review": needs_review,
    }
