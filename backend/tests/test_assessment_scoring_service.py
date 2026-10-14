
from app.services.assessment_scoring_service import (
    FREE_TEXT_RUBRIC,
    QUESTION_MAX_POINTS,
    QuestionGradingError,
    _canonical_option,
    _make_section_scores,
    _make_skill_scores,
    _normalize_answer,
    _parse_free_text_evaluation,
    _score_mcq,
)


def test_mcq_scoring_accepts_option_letter_and_display_text():
    options = [
        "Create an index",
        "Restart PostgreSQL",
        "Delete the table",
    ]

    assert _score_mcq("A", "A", options)[0] is True
    assert _score_mcq("Create an index", "A", options)[0] is True
    assert _score_mcq("Option B", "A", options)[0] is False


def test_mcq_scoring_handles_missing_answer_without_error():
    is_correct, feedback = _score_mcq(
        "",
        "A",
        ["first", "second"],
    )

    assert is_correct is False
    assert "No answer" in feedback


def test_answer_normalization_collapses_case_and_whitespace():
    assert _normalize_answer("  SELECT   * FROM T  ") == "select * from t"
    assert _canonical_option("B", ["first", "second"]) == "second"


def test_free_text_rubric_totals_ten_points():
    assert (
        sum(float(item["max_points"]) for item in FREE_TEXT_RUBRIC)
        == QUESTION_MAX_POINTS
    )


def test_free_text_evaluation_requires_all_rubric_criteria():
    import json
    import pytest

    with pytest.raises(QuestionGradingError):
        _parse_free_text_evaluation(
            json.dumps(
                {
                    "criteria": [],
                    "overall_feedback": "",
                }
            )
        )


def test_free_text_evaluation_validates_scores_and_returns_breakdown():
    import json

    payload = {
        "criteria": [
            {
                "key": item["key"],
                "score": item["max_points"],
                "feedback": "Meets criterion.",
            }
            for item in FREE_TEXT_RUBRIC
        ],
        "overall_feedback": "Complete and correct.",
    }

    result = _parse_free_text_evaluation(json.dumps(payload))

    assert result["earned_points"] == 10.0
    assert result["max_points"] == 10.0
    assert len(result["criteria"]) == 4


def test_section_scores_include_points_percentage_and_question_count():
    sections = _make_section_scores(
        [
            {
                "section_id": 1,
                "section_name": "Python",
                "earned_points": 8,
                "max_points": 10,
            },
            {
                "section_id": 1,
                "section_name": "Python",
                "earned_points": 4,
                "max_points": 10,
            },
            {
                "section_id": 2,
                "section_name": "SQL",
                "earned_points": 10,
                "max_points": 10,
            },
        ]
    )

    assert sections[0]["section_name"] == "Python"
    assert sections[0]["question_count"] == 2
    assert sections[0]["earned_points"] == 12.0
    assert sections[0]["max_points"] == 20.0
    assert sections[0]["score"] == 60.0
    assert sections[1]["score"] == 100.0


def test_section_percentage_is_not_issued_when_question_needs_review():
    sections = _make_section_scores(
        [
            {
                "section_id": 1,
                "section_name": "Python",
                "earned_points": 8,
                "max_points": 10,
            },
            {
                "section_id": 1,
                "section_name": "Python",
                "earned_points": None,
                "max_points": 10,
            },
        ]
    )

    assert sections[0]["status"] == "needs_review"
    assert sections[0]["score"] is None


def test_free_text_rubric_contains_question_specific_reference_guidance():
    from app.services.assessment_rubric import rubric_for_question

    rubric = rubric_for_question(
        "FREE_TEXT",
        correct_answer="ROLLBACK releases the failed transaction state.",
        explanation=(
            "A PostgreSQL transaction remains aborted until rollback."
        ),
    )

    key_concepts = next(
        item for item in rubric if item["key"] == "key_concepts"
    )

    assert (
        "ROLLBACK releases the failed transaction state"
        in key_concepts["guidance"]
    )
    assert "transaction remains aborted" in key_concepts["guidance"]


def test_skill_scores_group_by_skill_and_calculate_percentage():
    skills = _make_skill_scores(
        [
            {
                "skill_id": 3,
                "skill_name": "Python",
                "earned_points": 8,
                "max_points": 10,
            },
            {
                "skill_id": 3,
                "skill_name": "Python",
                "earned_points": 4,
                "max_points": 10,
            },
            {
                "skill_id": 7,
                "skill_name": "SQL",
                "earned_points": 10,
                "max_points": 10,
            },
        ]
    )

    assert skills[0]["skill_name"] == "Python"
    assert skills[0]["question_count"] == 2
    assert skills[0]["earned_points"] == 12.0
    assert skills[0]["max_points"] == 20.0
    assert skills[0]["score"] == 60.0
    assert skills[1]["skill_name"] == "SQL"
    assert skills[1]["score"] == 100.0


def test_skill_score_is_withheld_when_a_question_needs_review():
    skills = _make_skill_scores(
        [
            {
                "skill_id": 3,
                "skill_name": "Python",
                "earned_points": 8,
                "max_points": 10,
            },
            {
                "skill_id": 3,
                "skill_name": "Python",
                "earned_points": None,
                "max_points": 10,
            },
        ]
    )

    assert skills[0]["status"] == "needs_review"
    assert skills[0]["score"] is None
