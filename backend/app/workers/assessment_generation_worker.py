"""RQ worker entrypoint for long-running assessment generation."""

from __future__ import annotations

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
        )

        logger.info(
            "Completed assessment generation job: slot_id=%s generated=%s requested=%s",
            slot_id,
            result.get("generated_count") if isinstance(result, dict) else None,
            result.get("requested_count") if isinstance(result, dict) else None,
        )
        return result
    except Exception:
        logger.exception(
            "Assessment generation job failed: slot_id=%s user_id=%s",
            slot_id,
            user_id,
        )
        raise
    finally:
        db.close()
