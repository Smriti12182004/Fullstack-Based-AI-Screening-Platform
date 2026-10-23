import json
from unittest.mock import Mock

import pytest

from app.services.assessment_rubric import rubric_for_question
from app.services.assessment_scoring_service import (
    FREE_TEXT_RUBRIC,
    QUESTION_MAX_POINTS,
    QuestionGradingError,
    _canonical_option,
    _evaluate_free_text,
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
    assert sum(float(item["max_points"]) for item in FREE_TEXT_RUBRIC) == QUESTION_MAX_POINTS


def test_free_text_rubric_uses_neutral_accuracy_criterion():
    accuracy = FREE_TEXT_RUBRIC[0]

    assert accuracy["key"] == "answer_accuracy"
    assert accuracy["label"] == "Answer accuracy and relevance"
    assert accuracy["max_points"] == 4.0
    assert "Do not penalize" in accuracy["guidance"]
    assert "non-technical answer" in accuracy["guidance"]


def test_free_text_evaluation_requires_all_rubric_criteria():
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


def test_out_of_range_score_error_includes_value_and_maximum():
    payload = {
        "criteria": [
            {
                "key": item["key"],
                "score": (
                    item["max_points"] + 1
                    if item["key"] == "key_concepts"
                    else 0
                ),
                "feedback": "Test criterion.",
            }
            for item in FREE_TEXT_RUBRIC
        ],
        "overall_feedback": "Test response.",
    }

    with pytest.raises(QuestionGradingError) as exc_info:
        _parse_free_text_evaluation(json.dumps(payload))

    message = str(exc_info.value)
    assert "out-of-range score 4" in message
    assert "Coverage of key concepts" in message
    assert "allowed range: 0 to 3 points" in message


def test_free_text_evaluation_retry_includes_exact_validation_error(monkeypatch):
    invalid_payload = {
        "criteria": [
            {
                "key": item["key"],
                "score": (
                    item["max_points"] + 1
                    if item["key"] == "key_concepts"
                    else 0
                ),
                "feedback": "First pass.",
            }
            for item in FREE_TEXT_RUBRIC
        ],
        "overall_feedback": "First pass.",
    }
    valid_payload = {
        "criteria": [
            {
                "key": item["key"],
                "score": 1,
                "feedback": "Within range.",
            }
            for item in FREE_TEXT_RUBRIC
        ],
        "overall_feedback": "Valid retry.",
    }
    prompts = []
    responses = [invalid_payload, valid_payload]

    def fake_post(_url, *, json, timeout):
        prompts.append(json["prompt"])
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "response": json_module_dumps(responses[len(prompts) - 1])
        }
        return response

    def json_module_dumps(payload):
        return __import__("json").dumps(payload)

    monkeypatch.setattr(
        "app.services.assessment_scoring_service.requests.post",
        fake_post,
    )

    result = _evaluate_free_text(
        question_text="How would you respond to a customer's concern?",
        answer_text="I would ask a question to understand the concern and respond honestly.",
        correct_answer=None,
        explanation=None,
        skill_name="communication",
        difficulty="hard",
        rubric=FREE_TEXT_RUBRIC,
    )

    assert len(prompts) == 2
    assert result["max_points"] == 10.0
    assert result["earned_points"] == 4.0
    assert "technical correctness only when the question genuinely requires" in prompts[0]
    assert "out-of-range score 4" in prompts[1]
    assert "allowed range: 0 to 3 points" in prompts[1]


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
    rubric = rubric_for_question(
        "FREE_TEXT",
        correct_answer="ROLLBACK releases the failed transaction state.",
        explanation="A PostgreSQL transaction remains aborted until rollback.",
    )

    key_concepts = next(item for item in rubric if item["key"] == "key_concepts")

    assert "ROLLBACK releases the failed transaction state" in key_concepts["guidance"]
    assert "transaction remains aborted" in key_concepts["guidance"]


def test_rubric_for_nontechnical_sales_question_is_domain_neutral():
    rubric = rubric_for_question(
        "FREE_TEXT",
        correct_answer="Ask about the customer's concern before proposing an option.",
    )

    accuracy = next(item for item in rubric if item["key"] == "answer_accuracy")
    assert "technical knowledge" in accuracy["guidance"]
    assert any(
        phrase in accuracy["guidance"]
        for phrase in ("Do not penalize", "non-technical answer")
    )
    assert any(
        "customer's concern" in item["guidance"]
        for item in rubric
        if item["key"] == "key_concepts"
    )


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
