"""Redis/RQ integration for Evalyn assessment-generation jobs.

This module deliberately contains no FastAPI route logic. The existing
assessment-authoring service continues to own question generation and
validation; this module only provides a durable queue boundary around that
work.
"""

from __future__ import annotations

import os
from typing import Any

from redis import Redis
from rq import Queue
from rq.command import send_stop_job_command
from rq.job import Job, NoSuchJobError


ASSESSMENT_GENERATION_QUEUE_NAME = "assessment-generation"

# A single high-count generation can legitimately take several minutes with
# a local Ollama model. The RQ worker gets a generous upper bound while the
# individual Ollama HTTP calls retain their own shorter timeout/validation.
ASSESSMENT_GENERATION_JOB_TIMEOUT_SECONDS = 3600
ASSESSMENT_GENERATION_RESULT_TTL_SECONDS = 3600
ASSESSMENT_GENERATION_FAILURE_TTL_SECONDS = 86400


def _redis_url() -> str:
    """Return the configured Redis URL without depending on app Settings."""

    return (
        os.getenv("EVALYN_REDIS_URL")
        or os.getenv("REDIS_URL")
        or "redis://127.0.0.1:6379/0"
    ).strip()


def get_redis_connection() -> Redis:
    """Create the Redis connection used by the Evalyn generation queue."""

    return Redis.from_url(
        _redis_url(),
        health_check_interval=30,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        decode_responses=False,
    )


def get_assessment_generation_queue() -> Queue:
    """Return the dedicated assessment-generation queue."""

    return Queue(
        ASSESSMENT_GENERATION_QUEUE_NAME,
        connection=get_redis_connection(),
        default_timeout=ASSESSMENT_GENERATION_JOB_TIMEOUT_SECONDS,
        default_result_ttl=ASSESSMENT_GENERATION_RESULT_TTL_SECONDS,
        default_failure_ttl=ASSESSMENT_GENERATION_FAILURE_TTL_SECONDS,
    )


def enqueue_assessment_generation(
    *,
    slot_id: int,
    user_id: int,
    count: int,
    manager_prompt: str | None,
    generation_strategy: str,
    generation_focus: str,
) -> Any:
    """Enqueue one assessment-generation job.

    The callable itself is supplied to RQ rather than a dotted string. RQ
    serializes the callable's real module/function identity, which avoids the
    ``Invalid attribute name`` failure seen with the previous string-based
    enqueue path on this Windows setup.
    """

    from app.workers.assessment_generation_worker import (
        run_assessment_generation_job,
    )

    queue = get_assessment_generation_queue()

    return queue.enqueue_call(
        func=run_assessment_generation_job,
        kwargs={
            "slot_id": slot_id,
            "user_id": user_id,
            "count": count,
            "manager_prompt": manager_prompt,
            "generation_strategy": generation_strategy,
            "generation_focus": generation_focus,
        },
        timeout=ASSESSMENT_GENERATION_JOB_TIMEOUT_SECONDS,
        result_ttl=ASSESSMENT_GENERATION_RESULT_TTL_SECONDS,
        failure_ttl=ASSESSMENT_GENERATION_FAILURE_TTL_SECONDS,
        meta={"slot_id": slot_id, "user_id": user_id},
    )


def cancel_assessment_generation_job(job_id: str) -> str:
    """Cancel a queued job or stop a currently executing worker job."""

    connection = get_redis_connection()
    try:
        try:
            job = Job.fetch(job_id, connection=connection)
        except NoSuchJobError:
            return "missing"

        job_status = job.get_status(refresh=True)

        if job_status in {
            "finished",
            "failed",
            "stopped",
            "canceled",
        }:
            return job_status

        if job_status in {"queued", "deferred", "scheduled", "created"}:
            job.cancel()
            return "canceled"

        if job_status == "started":
            try:
                send_stop_job_command(connection, job_id)
            except Exception:
                job.refresh()
                latest_status = job.get_status(refresh=True)
                if latest_status in {
                    "finished",
                    "failed",
                    "stopped",
                    "canceled",
                }:
                    return latest_status
                raise
            return "stopping"

        return job_status
    finally:
        connection.close()
