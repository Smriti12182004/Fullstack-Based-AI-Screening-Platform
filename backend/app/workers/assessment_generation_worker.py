"""RQ worker entrypoint for long-running assessment generation."""

from __future__ import annotations

from rq import get_current_job

import logging

from app.db.session import SessionLocal
from app.services.assessment_authoring_service import (
    generate_slot_question_batch,
)


logger = logging.getLogger(__name__)


def run_assessment_generation_job(
    *,
    slot_id: int,
    user_id: int,
    count: int,
    manager_prompt: str | None,
    generation_strategy: str,
    generation_focus: str,
) -> dict:
    """Execute one queued assessment-generation request.

    The worker creates its own SQLAlchemy session because the API request
    process and the worker are separate processes. The existing authoring
    service remains responsible for validation, persistence, duplicate checks,
    and LLM interaction.
    """

    logger.info(
        "Starting assessment generation job: slot_id=%s user_id=%s count=%s",
        slot_id,
        user_id,
        count,
    )

    rq_job = get_current_job()

    def report_progress(progress):
        if rq_job is None:
            return
        try:
            rq_job.meta = {**(rq_job.meta or {}), "progress": progress}
            rq_job.save_meta()
        except Exception:
            logger.warning("Unable to save generation progress", exc_info=True)

    report_progress({
        "stage": "starting",
        "message": "Worker started; preparing generation",
        "generated_count": 0,
        "requested_count": count,
    })

    db = SessionLocal()
    try:
        result = generate_slot_question_batch(
            db=db,
            slot_id=slot_id,
            user_id=user_id,
            count=count,
            manager_prompt=manager_prompt,
            generation_strategy=generation_strategy,
            generation_focus=generation_focus,
            progress_callback=report_progress,
        )

        logger.info(
            "Completed assessment generation job: slot_id=%s generated=%s requested=%s",
            slot_id,
            result.get("generated_count") if isinstance(result, dict) else None,
            result.get("requested_count") if isinstance(result, dict) else None,
        )
        report_progress({
            "stage": "completed_with_warning" if result.get("warning") else "completed",
            "message": (
                result.get("warning")
                or f"Completed {result.get('generated_count', 0)} of "
                   f"{result.get('requested_count', count)} candidates"
            ),
            "generated_count": result.get("generated_count", 0),
            "requested_count": result.get("requested_count", count),
        })
        return result
    except Exception:
        previous = (rq_job.meta or {}).get("progress", {}) if rq_job else {}
        report_progress({
            "stage": "failed",
            "message": "Generation failed; inspect backend logs",
            "generated_count": previous.get("generated_count", 0),
            "requested_count": count,
        })
        logger.exception(
            "Assessment generation job failed: slot_id=%s user_id=%s",
            slot_id,
            user_id,
        )
        raise
    finally:
        db.close()
