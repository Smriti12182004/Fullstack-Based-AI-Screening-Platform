from types import SimpleNamespace

from app.api.routes.assessments import _serialize_assessment_result


def make_result(status):
    return SimpleNamespace(
        status=status,
        score=82.5,
        earned_points=33.0,
        max_points=40.0,
        skill_scores=[{"skill_name": "Python", "score": None}],
        section_scores=[{"section_name": "Backend", "status": "needs_review"}],
        question_scores=[{"question_id": 12, "status": "needs_review"}],
        feedback="Manual review is required.",
        graded_at=None,
    )


def test_needs_review_withholds_aggregate_scores_and_preserves_review_details():
    payload = _serialize_assessment_result(make_result("needs_review"))

    assert payload["score"] is None
    assert payload["earned_points"] is None
    assert payload["max_points"] is None
    assert payload["status"] == "needs_review"
    assert payload["question_scores"] == [
        {"question_id": 12, "status": "needs_review"}
    ]
    assert payload["feedback"] == "Manual review is required."


def test_grading_status_withholds_aggregate_scores():
    payload = _serialize_assessment_result(make_result("grading"))

    assert payload["score"] is None
    assert payload["earned_points"] is None
    assert payload["max_points"] is None


def test_completed_status_keeps_final_aggregate_scores():
    payload = _serialize_assessment_result(make_result("completed"))

    assert payload["score"] == 82.5
    assert payload["earned_points"] == 33.0
    assert payload["max_points"] == 40.0


def test_missing_result_returns_none():
    assert _serialize_assessment_result(None) is None
