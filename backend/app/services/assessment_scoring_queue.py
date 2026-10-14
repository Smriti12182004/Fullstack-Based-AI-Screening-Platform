
"""Queue assessment grading jobs on Evalyn's existing RQ worker queue."""

from __future__ import annotations

import os
from typing import Any

from redis import Redis
from rq import Queue


SCORING_QUEUE_NAME = "assessment-generation"
SCORING_JOB_TIMEOUT_SECONDS = 3600
SCORING_RESULT_TTL_SECONDS = 3600
SCORING_FAILURE_TTL_SECONDS = 86400


def _redis_url() -> str:
    return (
        os.getenv("EVALYN_REDIS_URL")
        or os.getenv("REDIS_URL")
        or "redis://127.0.0.1:6379/2"
    ).strip()


def enqueue_assessment_scoring(*, attempt_id: int) -> Any:
    connection = Redis.from_url(
        _redis_url(),
        health_check_interval=30,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
        decode_responses=False,
    )

    queue = Queue(
        SCORING_QUEUE_NAME,
        connection=connection,
        default_timeout=SCORING_JOB_TIMEOUT_SECONDS,
        default_result_ttl=SCORING_RESULT_TTL_SECONDS,
        default_failure_ttl=SCORING_FAILURE_TTL_SECONDS,
    )

    return queue.enqueue(
        "app.workers.assessment_scoring_worker.run_assessment_scoring_job",
        attempt_id=attempt_id,
        job_timeout=SCORING_JOB_TIMEOUT_SECONDS,
        result_ttl=SCORING_RESULT_TTL_SECONDS,
        failure_ttl=SCORING_FAILURE_TTL_SECONDS,
    )
