from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Literal

from rq.job import Job, NoSuchJobError
from app.queue.assessment_generation_queue import enqueue_assessment_generation, get_redis_connection

from app.core.dependencies import require_any_role, require_role
from app.db.session import get_db
from app.models import QuestionSet
from app.services.skill_review_service import get_job_skills
from app.services.question_set_configuration_service import (
    QuestionSetConfigurationServiceError,
    configure_question_set,
)
from app.schemas.assessment_authoring import (
    EditQuestionRequest,
    ManualQuestionRequest,
    QuestionRatingRequest,
)
from app.services.llm_service import (
    LLMConnectionError,
    LLMResponseError,
    LLMServiceError,
)
from app.services.assessment_authoring_service import (
    accept_generation_attempt,
    bootstrap_question_set,
    update_authoring_question,
    create_manual_question,
    generate_slot_question,
    generate_slot_question_batch,
    change_slot_skill,
    change_slot_question_type,
    get_question_bank_questions,
    use_existing_question,
    get_assessment_set,
    get_previous_questions,
    get_question_set_authoring_workspace,
    restore_generation_attempt,
    use_previous_question,
    submit_assessment_set_for_review,
)


class GenerationBatchRequest(BaseModel):
    """Optional manager guidance applied to one AI generation batch."""

    manager_prompt: str | None = Field(default=None, max_length=1200)
    generation_strategy: Literal["pattern", "balanced", "current"] = "balanced"
    generation_focus: Literal[
        "auto",
        "concept",
        "scenario",
        "comparison",
        "code",
        "output",
        "debugging",
        "sql",
        "design",
        "applied",
    ] = "auto"


class PartialConfigurationRequest(BaseModel):
    """Assessment metadata saved while sections are configured progressively."""

    total_questions: int = Field(gt=0)
    duration_minutes: int = Field(gt=0)
    candidate_instructions: str | None = None


router = APIRouter(
    prefix="/assessment-authoring",
    tags=["Assessment Authoring"],
)


def _handle(exc: Exception) -> HTTPException:
    message = str(exc)
    lowered = message.lower()
    if "not authorized" in lowered or "unauthorized" in lowered or "not allowed" in lowered:
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=message,
        )
    if "not found" in lowered:
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=message,
        )
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=message,
    )


@router.get("/question-sets/{question_set_id}")
def get_authoring_workspace(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return get_question_set_authoring_workspace(
            db=db,
            question_set_id=question_set_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.get("/question-sets/{question_set_id}/skills")
def get_confirmed_job_skills_for_question_set(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    question_set = db.get(QuestionSet, question_set_id)
    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found.",
        )

    access = db.execute(
        text(
            """
            SELECT 1
            FROM job_assessment_access
            WHERE job_id = :job_id AND user_id = :user_id
            LIMIT 1
            """
        ),
        {"job_id": question_set.job_id, "user_id": current_user["user_id"]},
    ).first()
    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to manage this assessment.",
        )

    skills = get_job_skills(db, question_set.job_id)
    return [
        {"id": skill.id, "name": skill.name}
        for skill in skills
    ]


@router.put("/question-sets/{question_set_id}/partial-configuration")
def save_partial_question_set_configuration(
    question_set_id: int,
    payload: PartialConfigurationRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    question_set = db.get(QuestionSet, question_set_id)
    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found.",
        )

    access = db.execute(
        text(
            """
            SELECT 1
            FROM job_assessment_access
            WHERE job_id = :job_id AND user_id = :user_id
            LIMIT 1
            """
        ),
        {"job_id": question_set.job_id, "user_id": current_user["user_id"]},
    ).first()
    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to manage this assessment.",
        )

    try:
        return configure_question_set(
            db=db,
            question_set_id=question_set_id,
            total_questions=payload.total_questions,
            duration_minutes=payload.duration_minutes,
            candidate_instructions=payload.candidate_instructions,
            allow_partial=True,
        )
    except QuestionSetConfigurationServiceError as exc:
        raise _handle(exc) from exc


@router.post("/question-sets/{question_set_id}/bootstrap")
def bootstrap_authoring_workspace(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return bootstrap_question_set(
            db=db,
            question_set_id=question_set_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.get("/sets/{assessment_set_id}")
def get_authoring_set(
    assessment_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return get_assessment_set(
            db=db,
            assessment_set_id=assessment_set_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.post("/sets/{assessment_set_id}/submit-review")
def submit_assessment_set_review(
    assessment_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return submit_assessment_set_for_review(
            db=db,
            assessment_set_id=assessment_set_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.get("/slots/{slot_id}/attempts")
def get_slot_attempts(
    slot_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        workspace = get_assessment_set(
            db=db,
            assessment_set_id=(
                db.execute(
                    text("SELECT assessment_set_id FROM question_slots WHERE id = :slot_id"),
                    {"slot_id": slot_id},
                ).scalar_one_or_none()
                or 0
            ),
            user_id=current_user["user_id"],
        )
        slot = next((item for item in workspace["slots"] if item["id"] == slot_id), None)
        if slot is None:
            raise ValueError("Question slot not found.")
        return slot["generation_attempts"]
    except ValueError as exc:
        raise _handle(exc) from exc


@router.put("/slots/{slot_id}/skill")
def change_question_slot_skill(
    slot_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        skill_id = int(payload.get("skill_id"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="skill_id must be a valid integer.",
        ) from exc

    try:
        return change_slot_skill(
            db=db,
            slot_id=slot_id,
            skill_id=skill_id,
            user_id=current_user["user_id"],
            replace_current_question=bool(payload.get("replace_current_question")),
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.put("/slots/{slot_id}/question-type")
def change_question_slot_type(
    slot_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        question_type = str(payload.get("question_type") or "").strip().upper()
        return change_slot_question_type(
            db=db,
            slot_id=slot_id,
            question_type=question_type,
            user_id=current_user["user_id"],
            replace_current_question=bool(payload.get("replace_current_question")),
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.post("/slots/{slot_id}/generate")
def generate_question_for_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return generate_slot_question(
            db=db,
            slot_id=slot_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc
    except LLMConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Question generation is temporarily unavailable: {exc}",
        ) from exc
    except LLMResponseError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Question generation response could not be validated: {exc}",
        ) from exc
    except LLMServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Question generation service failed: {exc}",
        ) from exc


@router.post("/slots/{slot_id}/generate-batch")
def generate_question_batch_for_slot(
    slot_id: int,
    count: int = Query(default=5, ge=1, le=50),
    payload: GenerationBatchRequest = Body(default=GenerationBatchRequest()),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    """Queue long-running AI generation and return immediately."""
    normalized_prompt = (
        " ".join(str(payload.manager_prompt or "").strip().split()) or None
    )
    try:
        job = enqueue_assessment_generation(
            slot_id=slot_id,
            user_id=current_user["user_id"],
            count=count,
            manager_prompt=normalized_prompt,
            generation_strategy=payload.generation_strategy,
            generation_focus=payload.generation_focus,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not queue AI generation. Check Redis and the RQ worker.",
        ) from exc

    return {
        "job_id": job.id,
        "status": "queued",
        "requested_count": count,
    }


@router.get("/generation-jobs/{job_id}")
def get_assessment_generation_job_status(
    job_id: str,
    current_user: dict = Depends(require_role("assessment_manager")),
):
    """Return job status only to the manager who requested the job."""
    connection = get_redis_connection()
    try:
        try:
            job = Job.fetch(job_id, connection=connection)
        except NoSuchJobError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Generation job not found or expired.",
            ) from exc

        if str((job.meta or {}).get("user_id")) != str(current_user["user_id"]):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to view this generation job.",
            )

        raw_status = job.get_status(refresh=True)
        job_status = str(getattr(raw_status, "value", raw_status)).lower()
        response = {
            "job_id": job.id,
            "status": job_status,
            "progress": (job.meta or {}).get("progress"),
        }

        if job_status == "finished":
            response["result"] = job.result
        elif job_status in {"failed", "stopped", "canceled"}:
            response["error"] = (
                "AI generation failed or was stopped. Check backend worker logs."
            )

        return response
    finally:
        connection.close()


@router.post("/slots/{slot_id}/attempts/{attempt_id}/accept")
def accept_question_candidate(
    slot_id: int,
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return accept_generation_attempt(
            db=db,
            slot_id=slot_id,
            attempt_id=attempt_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.post("/slots/{slot_id}/attempts/{attempt_id}/restore")
def restore_question_candidate(
    slot_id: int,
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return restore_generation_attempt(
            db=db,
            slot_id=slot_id,
            attempt_id=attempt_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.post("/slots/{slot_id}/manual")
def create_manual_question_for_slot(
    slot_id: int,
    payload: ManualQuestionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return create_manual_question(
            db=db,
            slot_id=slot_id,
            payload=payload.model_dump(),
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.get("/slots/{slot_id}/bank")
def get_bank_questions_for_slot(
    slot_id: int,
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return get_question_bank_questions(
            db=db,
            slot_id=slot_id,
            user_id=current_user["user_id"],
            limit=limit,
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.get("/slots/{slot_id}/historical")
def get_historical_questions_for_slot(
    slot_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return get_previous_questions(
            db=db,
            slot_id=slot_id,
            user_id=current_user["user_id"],
            limit=limit,
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.post("/slots/{slot_id}/existing/{question_id}")
def select_existing_question(
    slot_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return use_existing_question(
            db=db,
            slot_id=slot_id,
            question_id=question_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.post("/slots/{slot_id}/historical/{question_id}")
def select_historical_question(
    slot_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return use_previous_question(
            db=db,
            slot_id=slot_id,
            question_id=question_id,
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.put(
    "/questions/{question_id}",
)
def edit_authoring_question(
    question_id: int,
    payload: EditQuestionRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    try:
        return update_authoring_question(
            db=db,
            question_id=question_id,
            payload=payload.model_dump(),
            user_id=current_user["user_id"],
        )
    except ValueError as exc:
        raise _handle(exc) from exc


@router.put(
    "/questions/{question_id}/rating",
)
def rate_question(
    question_id: int,
    payload: QuestionRatingRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role("assessment_manager", "assessment_reviewer")
    ),
):
    question_exists = db.execute(
        text("SELECT id FROM questions WHERE id = :question_id"),
        {"question_id": question_id},
    ).scalar_one_or_none()
    if question_exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found.",
        )

    if current_user["role"] == "assessment_manager":
        accessible = db.execute(
            text(
                """
                SELECT 1
                FROM question_slots qs
                JOIN assessment_sets aset ON aset.id = qs.assessment_set_id
                JOIN job_assessment_access jaa ON jaa.job_id = (
                    SELECT job_id FROM question_sets WHERE id = aset.question_set_id
                )
                WHERE qs.current_question_id = :question_id
                  AND jaa.user_id = :user_id
                LIMIT 1
                """
            ),
            {
                "question_id": question_id,
                "user_id": current_user["user_id"],
            },
        ).first()
        if accessible is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to rate this assessment question.",
            )

    column = (
        "manager_rating"
        if current_user["role"] == "assessment_manager"
        else "reviewer_rating"
    )

    db.execute(
        text(
            f"UPDATE questions SET {column} = :rating, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = :question_id"
        ),
        {
            "rating": payload.rating,
            "question_id": question_id,
        },
    )
    db.commit()

    rows = db.execute(
        text(
            "SELECT manager_rating, reviewer_rating FROM questions WHERE id = :question_id"
        ),
        {"question_id": question_id},
    ).mappings().one()

    return {
        "question_id": question_id,
        "manager_rating": rows["manager_rating"],
        "reviewer_rating": rows["reviewer_rating"],
    }