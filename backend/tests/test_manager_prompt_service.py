import json

import pytest

from app.services import manager_prompt_service


class FakeResponse:
    status_code = 200

    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _base_payload():
    return {
        "intent_summary": "Improve question generation with scenarios and efficiency.",
        "sentiment": {"label": "dissatisfied", "confidence": 0.8, "evidence": "previous ones were boring"},
        "requested_patterns": ["concept", "concept"],
        "candidate_mix": [{"pattern": "concept", "count": 2, "share": 0.5}],
        "requested_difficulty": "easy",
        "must_include": ["short realistic scenario", "fruits and vegetables"],
        "preferred_examples": [{"text": "fruits and vegetables", "role": "context"}],
        "avoid": ["food truck questions"],
        "diversity_level": "high",
        "distinct_problem_statements": True,
        "vary_scenario_contexts": True,
        "requested_length": "short",
        "requested_response_depth": "reasoning",
        "priority_notes": ["avoid semantic repetition"],
        "normalized_manager_instruction": "source",
    }


def test_source_grounding_corrects_model_misinterpretation(monkeypatch):
    prompt = (
        "use short realistic senario ques. take eg of fruits and vagetables. "
        "dont keep giving same problem with diff options. make it interesting "
        "but easy to understand and focus on efficiency. previous ones were boring"
    )

    class FakeInteraction:
        output_text = json.dumps(_base_payload())

    def fake_post(prompt):
        return FakeInteraction()

    monkeypatch.setattr(manager_prompt_service, "_post_to_gemini", fake_post)

    result = manager_prompt_service.interpret_manager_prompt(
        prompt,
        slot_difficulty="easy",
        section_type="conceptual",
        question_type="MCQ",
        batch_count=3,
    )

    assert result.requested_patterns == ["scenario"]
    assert result.candidate_mix == []
    assert any(item.text == "fruits and vegetables" for item in result.preferred_examples)
    assert "efficiency" in result.must_include
    assert result.distinct_problem_statements is True
    assert result.diversity_level == "high"
    assert result.avoid == []


def test_empty_prompt_does_not_call_ollama(monkeypatch):
    called = False

    def fake_post(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("Gemini must not be called")

    monkeypatch.setattr(manager_prompt_service, "_post_to_gemini", fake_post)

    with pytest.raises(ValueError, match="cannot be empty"):
        manager_prompt_service.interpret_manager_prompt("   ")

    assert called is False
