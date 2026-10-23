"""Safely refresh the frozen free-text rubrics and retry attempt #357.

Run only after installing the rubric/scoring-service patch and passing
the scoring tests.

This script is scoped to assessment 2281 / attempt 357. It refuses to
overwrite custom rubrics or run while another attempt in the same
assessment is submitted or in progress.
"""

from __future__ import annotations

import requests

from app.core.config import settings
from app.db.session import SessionLocal
from app.db.timestamps import utc_now
from app.models import AssessmentQuestion, Attempt, Result
from app.services.assessment_rubric import rubric_for_question
from app.services.assessment_scoring_queue import (
    enqueue_assessment_scoring,
)


ASSESSMENT_ID = 2281
ATTEMPT_ID = 357

LEGACY_DEFAULT_KEYS = {
    "technical_accuracy",
    "key_concepts",
    "reasoning_application",
    "clarity_completeness",
}

NEW_DEFAULT_KEYS = {
    "answer_accuracy",
    "key_concepts",
    "reasoning_application",
    "clarity_completeness",
}

FREE_TEXT_TYPES = {
    "FREE_TEXT",
    "FREETEXT",
    "FREE_RESPONSE",
    "TEXT",
}


def _stop(message: str) -> None:
    print(f"STOP: {message}")
    raise SystemExit(1)


def _check_ollama() -> None:
    """Verify Ollama and the configured model are available."""
    base_url = settings.ollama_base_url.rstrip("/")
    response = requests.get(
        f"{base_url}/api/tags",
        timeout=5,
    )
    response.raise_for_status()

    payload = response.json()
    models = payload.get("models", [])
    configured = str(settings.ollama_model or "").strip()

    available = {
        str(item.get("name") or item.get("model") or "").strip()
        for item in models
        if isinstance(item, dict)
    }

    if not configured or configured not in available:
        _stop(
            f"Ollama is reachable, but configured model "
            f"{configured!r} was not found. "
            f"Available models: {sorted(available)}"
        )

    print(f"Ollama ready: {configured}")


def _normalized_question_type(value: str | None) -> str:
    return (
        str(value or "")
        .strip()
        .upper()
        .replace("-", "_")
        .replace(" ", "_")
    )


def main() -> int:
    _check_ollama()

    db = SessionLocal()

    try:
        # Verify the intended attempt.
        attempt = db.get(Attempt, ATTEMPT_ID)

        if attempt is None:
            _stop(f"Attempt #{ATTEMPT_ID} was not found.")

        if int(attempt.assessment_id) != ASSESSMENT_ID:
            _stop(
                f"Attempt #{ATTEMPT_ID} belongs to assessment "
                f"{attempt.assessment_id}, not {ASSESSMENT_ID}."
            )

        if attempt.status != "submitted":
            _stop(
                f"Attempt status is {attempt.status!r}; "
                "only a submitted attempt can be regraded."
            )

        # Load the current result.
        result = (
            db.query(Result)
            .filter(Result.attempt_id == ATTEMPT_ID)
            .order_by(Result.id.desc())
            .first()
        )

        if result is None:
            _stop(
                f"No result record exists for attempt #{ATTEMPT_ID}."
            )

        if result.status != "needs_review":
            _stop(
                f"Result status is {result.status!r}, "
                "not 'needs_review'. Refusing to enqueue "
                "a duplicate or unnecessary job."
            )

        # Avoid updating shared snapshots while another candidate
        # has a live attempt for this same assessment.
        other_live_attempts = (
            db.query(Attempt)
            .filter(
                Attempt.assessment_id == ASSESSMENT_ID,
                Attempt.id != ATTEMPT_ID,
                Attempt.status.in_(["submitted", "in_progress"]),
            )
            .all()
        )

        if other_live_attempts:
            ids = [item.id for item in other_live_attempts]
            _stop(
                "Other submitted or in-progress attempts exist for "
                f"assessment {ASSESSMENT_ID}: {ids}. "
                "Review those attempts before updating shared "
                "assessment rubric snapshots."
            )

        # Load the frozen assessment-question snapshots.
        snapshots = (
            db.query(AssessmentQuestion)
            .filter(
                AssessmentQuestion.assessment_id == ASSESSMENT_ID
            )
            .order_by(AssessmentQuestion.display_order.asc())
            .all()
        )

        if not snapshots:
            _stop(
                f"Assessment #{ASSESSMENT_ID} has no question snapshots."
            )

        rubric_updates = []
        already_updated = []
        unexpected = []

        for snapshot in snapshots:
            question_type = _normalized_question_type(
                snapshot.question_type
            )

            if question_type not in FREE_TEXT_TYPES:
                continue

            current_rubric = snapshot.rubric or []

            current_keys = {
                str(item.get("key"))
                for item in current_rubric
                if isinstance(item, dict)
            }

            if current_keys == NEW_DEFAULT_KEYS:
                already_updated.append(snapshot.question_id)
                continue

            # Only migrate the known default rubric.
            # Never overwrite a custom or unfamiliar rubric.
            if current_keys and current_keys != LEGACY_DEFAULT_KEYS:
                unexpected.append(
                    (snapshot.question_id, sorted(current_keys))
                )
                continue

            rebuilt = rubric_for_question(
                snapshot.question_type,
                correct_answer=snapshot.correct_answer,
                explanation=snapshot.explanation,
            )

            if not rebuilt:
                unexpected.append(
                    (snapshot.question_id, sorted(current_keys))
                )
                continue

            rubric_updates.append((snapshot, rebuilt))

        if unexpected:
            _stop(
                "Custom or unrecognized rubrics were found and will "
                f"not be overwritten: {unexpected}"
            )

        if not rubric_updates and already_updated:
            print(
                "Rubric snapshots already use the updated "
                "criterion names."
            )
        elif not rubric_updates:
            _stop(
                "No eligible free-text rubric snapshots "
                "were found to update."
            )

        print("Attempt:", attempt.id, attempt.status)
        print("Previous result:", result.status)
        print(
            "Free-text rubric snapshots to update:",
            [row.question_id for row, _ in rubric_updates],
        )
        print(
            "Free-text snapshots already updated:",
            already_updated,
        )
        print(
            "Previous points:",
            result.earned_points,
            "/",
            result.max_points,
        )

        # Update only eligible rubric snapshots.
        for snapshot, rebuilt_rubric in rubric_updates:
            snapshot.rubric = rebuilt_rubric

        # Prepare the existing result for another grading attempt.
        result.status = "grading"
        result.score = None
        result.feedback = (
            "Regrading saved answers using the corrected "
            "free-text rubric."
        )
        result.graded_at = None
        result.grading_job_id = None

        db.commit()

        # Queue scoring for the existing submission.
        try:
            job = enqueue_assessment_scoring(
                attempt_id=ATTEMPT_ID
            )

        except Exception as exc:
            db.rollback()

            current_result = (
                db.query(Result)
                .filter(Result.attempt_id == ATTEMPT_ID)
                .order_by(Result.id.desc())
                .first()
            )

            if current_result is not None:
                current_result.status = "needs_review"
                current_result.score = None
                current_result.feedback = (
                    "Rubric snapshots were updated, but the grading "
                    "retry could not be queued. Check Redis and the "
                    "RQ worker."
                )
                current_result.graded_at = utc_now()
                db.commit()

            print("QUEUE FAILED:", repr(exc))
            return 1

        # The worker may finish before the job ID is saved.
        db.expire_all()

        current_result = (
            db.query(Result)
            .filter(Result.attempt_id == ATTEMPT_ID)
            .order_by(Result.id.desc())
            .first()
        )

        if current_result is not None:
            current_result.grading_job_id = str(job.id)
            db.commit()

        print(
            "Updated rubric snapshots and queued grading."
        )
        print("Job ID:", job.id)
        print(
            "Keep the RQ worker running and check its outcome "
            "for attempt #357."
        )

        return 0

    finally:
        db.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except requests.RequestException as exc:
        print(f"STOP: Could not contact Ollama: {exc}")
        raise SystemExit(1) from exc