
"""RQ worker entry point for scoring a submitted assessment attempt."""

from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.db.timestamps import utc_now
from app.models import Result
from app.services.assessment_scoring_service import grade_submitted_attempt

logger = logging.getLogger(__name__)


def run_assessment_scoring_job(*, attempt_id: int) -> dict:
    """Score a submitted attempt and log unexpected failures for diagnosis."""
    db = SessionLocal()

    try:
        logger.info(
            "Starting assessment scoring for attempt_id=%s",
            attempt_id,
        )

        outcome = grade_submitted_attempt(db, attempt_id)

        logger.info(
            "Scoring finished for attempt_id=%s: status=%s, score=%s",
            attempt_id,
            outcome.get("status"),
            outcome.get("score"),
        )

        return outcome

    except Exception:
        # Keep the actual exception and traceback in the worker terminal.
        logger.exception(
            "Unhandled assessment scoring exception for attempt_id=%s",
            attempt_id,
        )

        try:
            db.rollback()

            result = (
                db.query(Result)
                .filter(Result.attempt_id == attempt_id)
                .order_by(Result.id.desc())
                .first()
            )

            if result is not None:
                result.status = "needs_review"
                result.score = None
                result.feedback = (
                    "Automatic scoring could not be completed. "
                    "No final score was issued; HR review is required. "
                    "Technical details are recorded in the backend worker log."
                )
                result.graded_at = utc_now()

                db.commit()

        except Exception:
            db.rollback()
            logger.exception(
                "Could not persist scoring failure for attempt_id=%s",
                attempt_id,
            )

        return {
            "attempt_id": attempt_id,
            "status": "needs_review",
            "score": None,
        }

    finally:
        db.close()
