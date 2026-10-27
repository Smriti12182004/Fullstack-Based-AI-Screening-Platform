import json

from app.services import llm_service


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _skill():
    return [
        {
            "skill_id": 4,
            "skill_name": "Python",
            "category": "Programming Language",
        }
    ]


def _intent():
    return {
        "intent_summary": "Use practical scenarios and a mixed scenario/comparison batch.",
        "sentiment": {
            "label": "dissatisfied",
            "confidence": 0.91,
            "evidence": "The manager asks to stop repeating prior scenario patterns.",
        },
        "requested_patterns": ["scenario", "comparison"],
        "candidate_mix": [
            {"pattern": "scenario", "count": 1, "share": None},
            {"pattern": "comparison", "count": 1, "share": None},
        ],
        "requested_difficulty": "medium",
        "must_include": ["efficiency"],
        "preferred_examples": [
            {"text": "fruits", "role": "primary"},
            {"text": "vegetables", "role": "secondary"},
        ],
        "avoid": ["repeated scenario", "definition-only questions"],
        "diversity_level": "high",
        "distinct_problem_statements": True,
        "vary_scenario_contexts": True,
        "requested_length": "short",
        "requested_response_depth": "reasoning",
        "priority_notes": ["Keep the storyline easy to understand."],
        "normalized_manager_instruction": "use scenarios with fruits and vegetables and improve efficiency",
    }


def test_structured_manager_intent_is_used_without_forcing_one_focus(monkeypatch):
    captured = []
    questions = [
        {
            "question_text": (
                "A grocery service uses Python to validate incoming produce records. "
                "When a malformed fruit record arrives, which action should the developer take first?"
            ),
            "skill_name": "python",
            "difficulty": "medium",
            "section_type": "conceptual",
            "question_type": "MCQ",
            "options": [
                "Validate the record before persisting it",
                "Disable validation for the request",
                "Ignore the malformed record and continue silently",
                "Restart the database for every malformed record",
            ],
            "correct_answer": "A",
            "explanation": "Validation should reject malformed input before persistence.",
        },
        {
            "question_text": (
                "A team can validate Python input either at the API boundary or inside the business layer. "
                "Which approach better isolates invalid external data and why?"
            ),
            "skill_name": "python",
            "difficulty": "medium",
            "section_type": "conceptual",
            "question_type": "MCQ",
            "options": [
                "Validate at the API boundary so invalid external data is rejected early",
                "Trust incoming payloads and bypass all request validation checks",
                "Persist incoming data first and validate the saved record afterward",
                "Defer input validation until the request has fully finished processing",
            ],
            "correct_answer": "A",
            "explanation": "Boundary validation prevents invalid external data from entering the business flow.",
        },
    ]

    def fake_call(prompt, **kwargs):
        captured.append(prompt)
        return json.dumps({"questions": questions})

    monkeypatch.setattr(llm_service, "_call_llm_chat", fake_call)
    result = llm_service.generate_questions_from_skills(
        skills=_skill(),
        number_of_questions=2,
        difficulty="medium",
        section_type="conceptual",
        question_type="MCQ",
        manager_prompt="these feel repetitive, use fruits and vegetables and make them more practical",
        generation_focus="auto",
        manager_interpretation=_intent(),
    )

    assert len(result) == 2
    assert result[0].question_type == "MCQ"
    assert result[1].question_type == "MCQ"
    assert captured
    assert "STRUCTURED MANAGER INTENT" in captured[0]
    assert "fruits [primary]" in captured[0]
    assert "vegetables [secondary]" in captured[0]
    assert "dissatisfied" in captured[0]
    assert "scenario x1" in captured[0]
    assert "comparison x1" in captured[0]
