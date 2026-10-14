import json as jsonlib

import pytest

from app.services import llm_service


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _mock_ollama(monkeypatch, questions, captured_prompt=None):
    def fake_call(prompt, **kwargs):
        if captured_prompt is not None:
            captured_prompt.append(prompt)

        return jsonlib.dumps(
            {
                "questions": questions,
            }
        )

    monkeypatch.setattr(
        llm_service,
        "_call_llm_chat",
        fake_call,
    )


def _skill():
    return [
        {
            "skill_id": 4,
            "skill_name": "Python",
            "category": "Programming Language",
        }
    ]


def _mcq(
    section_type="conceptual",
    difficulty="easy",
):
    return {
        "question_text": (
            "Which Python collection stores unique values?"
        ),
        "skill_name": "python",
        "difficulty": difficulty,
        "section_type": section_type,
        "question_type": "MCQ",
        "options": [
            "list",
            "tuple",
            "set",
            "dict",
        ],
        "correct_answer": "set",
        "explanation": (
            "A set stores unique values."
        ),
    }


def _free_text(difficulty="medium"):
    return {
        "question_text": (
            "Explain how you would handle a Python function "
            "that returns unexpected None values in production."
        ),
        "skill_name": "python",
        "difficulty": difficulty,
        "section_type": "free_text",
        "question_type": "FREE_TEXT",
        "options": [],
        "correct_answer": None,
        "explanation": (
            "Look for tracing the control flow, checking missing "
            "returns, inputs, error handling, logging, and a "
            "concrete fix."
        ),
    }


def test_conceptual_generation_preserves_section_type_and_difficulty(
    monkeypatch,
):
    captured_prompt = []

    _mock_ollama(
        monkeypatch,
        [
            _mcq(
                "conceptual",
                "easy",
            )
        ],
        captured_prompt,
    )

    result = llm_service.generate_questions_from_skills(
        skills=_skill(),
        number_of_questions=1,
        difficulty="easy",
        section_type="conceptual",
    )

    assert len(result) == 1
    assert result[0].section_type == "conceptual"
    assert result[0].question_type == "MCQ"
    assert result[0].difficulty == "easy"
    assert len(result[0].options) == 4

    assert "HARD CONSTRAINTS" in captured_prompt[0]
    assert "conceptual" in captured_prompt[0]


def test_implementation_generation_allows_practical_prompt(
    monkeypatch,
):
    captured_prompt = []

    _mock_ollama(
        monkeypatch,
        [
            _mcq(
                "implementation",
                "medium",
            )
        ],
        captured_prompt,
    )

    result = llm_service.generate_questions_from_skills(
        skills=_skill(),
        number_of_questions=1,
        difficulty="medium",
        section_type="implementation",
    )

    assert len(result) == 1
    assert result[0].section_type == "implementation"
    assert result[0].question_type == "MCQ"
    assert result[0].difficulty == "medium"

    assert "Test practical execution or application." in captured_prompt[0]
    assert "SQL" in captured_prompt[0]
    assert "debugging" in captured_prompt[0]


def test_free_text_generation_returns_open_response_contract(
    monkeypatch,
):
    _mock_ollama(
        monkeypatch,
        [
            _free_text("hard")
        ],
    )

    result = llm_service.generate_questions_from_skills(
        skills=_skill(),
        number_of_questions=1,
        difficulty="hard",
        section_type="free_text",
    )

    assert len(result) == 1
    assert result[0].section_type == "free_text"
    assert result[0].question_type == "FREE_TEXT"
    assert result[0].difficulty == "hard"
    assert result[0].options == []
    assert result[0].correct_answer is None
    assert result[0].explanation


def test_model_section_type_is_normalized_to_requested_section(monkeypatch):
    _mock_ollama(
        monkeypatch,
        [
            _mcq(
                "conceptual",
                "easy",
            )
        ],
    )

    result = llm_service.generate_questions_from_skills(
        skills=_skill(),
        number_of_questions=1,
        difficulty="medium",
        section_type="implementation",
    )

    assert len(result) == 1
    assert result[0].section_type == "implementation"
    assert result[0].difficulty == "medium"
    assert result[0].question_type == "MCQ"


def test_free_text_question_with_options_is_rejected(
    monkeypatch,
):
    question = _free_text("medium")

    question["options"] = [
        "A",
        "B",
        "C",
        "D",
    ]

    question["correct_answer"] = "A"

    _mock_ollama(
        monkeypatch,
        [question],
    )

    with pytest.raises(
        llm_service.LLMResponseError,
        match="options for a free-text question",
    ):
        llm_service.generate_questions_from_skills(
            skills=_skill(),
            number_of_questions=1,
            difficulty="medium",
            section_type="free_text",
        )


def test_invalid_requested_section_type_is_rejected_before_ollama(
    monkeypatch,
):
    calls = []

    def fake_call(*args, **kwargs):
        calls.append(True)
        raise AssertionError(
            "LLM should not be called for invalid section type"
        )

    monkeypatch.setattr(
        llm_service,
        "_call_llm_chat",
        fake_call,
    )

    with pytest.raises(
        ValueError,
        match=(
            "Section type must be conceptual, implementation, "
            "or free_text"
        ),
    ):
        llm_service.generate_questions_from_skills(
            skills=_skill(),
            number_of_questions=1,
            difficulty="easy",
            section_type="coding",
        )

    assert calls == []
