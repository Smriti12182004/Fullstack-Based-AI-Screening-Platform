from types import SimpleNamespace

from app.api.routes import assessments


QUEUE_FAILURE_FEEDBACK = (
    "Automatic grading could not be queued. HR review is required."
)


class FakeQuery:
    def __init__(self, db):
        self.db = db

    def filter(self, *_conditions):
        return self

    def order_by(self, *_ordering):
        return self

    def first(self):
        return self.db.result


class FakeSession:
    def __init__(self, result):
        self.result = result
        self.commits = 0
        self.rollbacks = 0

    def query(self, _model):
        return FakeQuery(self)

    def add(self, result):
        self.result = result

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def expire_all(self):
        pass


def _result(*, status="needs_review", feedback=QUEUE_FAILURE_FEEDBACK):
    return SimpleNamespace(
        id=95,
        attempt_id=358,
        score=None,
        status=status,
        feedback=feedback,
        graded_at=None,
        grading_job_id=None,
    )


def test_only_queue_failure_review_results_are_retryable():
    queued_failure = _result()
    evaluator_failure = _result(
        feedback=(
            "Automatic scoring could not be completed. "
            "HR review is required."
        )
    )

    assert assessments._is_retryable_queue_failure(queued_failure) is True
    assert assessments._is_retryable_queue_failure(evaluator_failure) is False
    assert assessments._is_retryable_queue_failure(None) is False


def test_queue_failure_result_can_be_requeued(monkeypatch):
    db = FakeSession(_result())
    calls = []

    def fake_enqueue(*, attempt_id):
        calls.append(attempt_id)
        return SimpleNamespace(id="rq-job-attempt-358")

    monkeypatch.setattr(
        assessments,
        "enqueue_assessment_scoring",
        fake_enqueue,
    )

    outcome = assessments._queue_assessment_scoring(db, attempt_id=358)

    assert outcome == "grading"
    assert calls == [358]
    assert db.result.status == "grading"
    assert db.result.feedback is None
    assert db.result.grading_job_id == "rq-job-attempt-358"
    assert db.commits == 2


def test_non_queue_review_result_is_not_automatically_retried(monkeypatch):
    db = FakeSession(
        _result(
            feedback=(
                "Automatic scoring could not be completed. "
                "No final score was issued; HR review is required."
            )
        )
    )
    called = []

    monkeypatch.setattr(
        assessments,
        "enqueue_assessment_scoring",
        lambda **kwargs: called.append(kwargs),
    )

    outcome = assessments._queue_assessment_scoring(db, attempt_id=358)

    assert outcome == "needs_review"
    assert called == []
    assert db.commits == 0


def test_enqueue_exception_is_persisted_as_retryable_and_logged(
    monkeypatch, caplog
):
    db = FakeSession(_result(status="needs_review", feedback=QUEUE_FAILURE_FEEDBACK))

    def fail_enqueue(*, attempt_id):
        raise ConnectionError("test Redis queue unavailable")

    monkeypatch.setattr(
        assessments,
        "enqueue_assessment_scoring",
        fail_enqueue,
    )

    outcome = assessments._queue_assessment_scoring(db, attempt_id=358)

    assert outcome == "needs_review"
    assert db.result.status == "needs_review"
    assert db.result.feedback == QUEUE_FAILURE_FEEDBACK
    assert db.commits == 2
    assert "Could not enqueue assessment grading for attempt_id=358" in caplog.text
    assert "test Redis queue unavailable" in caplog.text
