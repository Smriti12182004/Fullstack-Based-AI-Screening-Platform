import json

from app.services import question_generation_planner as planner


class FakeResponse:
    status_code = 200

    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_planner_creates_distinct_candidate_plans(monkeypatch):
    payload = {
        "plans": [
            {
                "candidate_index": 1,
                "pattern": "scenario",
                "problem_target": "efficiently deploy a new service image during a traffic spike",
                "knowledge_target": "Docker image reuse and deployment workflow",
                "scenario_context": "fruit delivery API during the morning order rush",
                "example_context": "fruits",
                "efficiency_focus": "avoid unnecessary rebuild work",
                "cognitive_operation": "choose the best operational action",
                "storyline": "A delivery team needs a fast safe deployment before the morning rush.",
                "uniqueness_anchor": "traffic spike deployment without rebuilding unchanged image layers",
            },
            {
                "candidate_index": 2,
                "pattern": "debugging",
                "problem_target": "diagnose a container that exits because a required configuration value is missing",
                "knowledge_target": "Docker environment variables and runtime configuration",
                "scenario_context": "vegetable inventory service fails after container startup",
                "example_context": "vegetables",
                "efficiency_focus": "find the fault without rebuilding unrelated code",
                "cognitive_operation": "diagnose the root cause",
                "storyline": "An inventory service starts and exits immediately after a deployment change.",
                "uniqueness_anchor": "runtime configuration failure instead of deployment speed",
            },
            {
                "candidate_index": 3,
                "pattern": "scenario",
                "problem_target": "reduce the size of a slow-to-transfer container image",
                "knowledge_target": "multi-stage builds and image layers",
                "scenario_context": "farm warehouse dashboard image takes too long to move to a server",
                "example_context": None,
                "efficiency_focus": "reduce image size and transfer time",
                "cognitive_operation": "select the change with the biggest direct impact",
                "storyline": "A warehouse team finds deployments slow because its image is unnecessarily large.",
                "uniqueness_anchor": "image-size optimization rather than runtime configuration or deployment workflow",
            },
        ]
    }

    captured = []

    def fake_call(prompt, **kwargs):
        captured.append(prompt)
        return json.dumps(payload)

    monkeypatch.setattr(
        planner,
        "_call_gemini_chat",
        fake_call,
    )

    result = planner.plan_question_batch(
        skill_name="Docker",
        section_type="implementation",
        difficulty="medium",
        question_type="MCQ",
        count=3,
        manager_prompt=(
            "use short realistic scenarios with fruits and vegetables, "
            "make them efficient and not repetitive"
        ),
        generation_focus="auto",
        experience_required="2-4 years",
        manager_interpretation={
            "intent_summary": (
                "Use practical scenarios with varied contexts and efficiency focus."
            ),
            "sentiment": {
                "label": "dissatisfied",
                "confidence": 0.9,
                "evidence": "previous questions were repetitive",
            },
            "requested_patterns": [
                "scenario",
                "debugging",
            ],
            "candidate_mix": [],
            "requested_difficulty": "medium",
            "must_include": [
                "efficiency",
            ],
            "preferred_examples": [
                {
                    "text": "fruits",
                    "role": "primary",
                },
                {
                    "text": "vegetables",
                    "role": "secondary",
                },
            ],
            "avoid": [
                "same problem with different options",
            ],
            "diversity_level": "high",
            "distinct_problem_statements": True,
            "vary_scenario_contexts": True,
            "requested_length": "short",
            "requested_response_depth": "reasoning",
            "priority_notes": [
                "Keep storylines easy to understand.",
            ],
            "normalized_manager_instruction": (
                "use short realistic scenarios with fruits and vegetables, "
                "make them efficient and not repetitive"
            ),
        },
    )

    assert len(result) == 3
    assert [item.candidate_index for item in result] == [1, 2, 3]
    assert len({item.problem_target.casefold() for item in result}) == 3
    assert len({item.uniqueness_anchor.casefold() for item in result}) == 3

    assert captured
    assert "fruits" in captured[0]
    assert "vegetables" in captured[0]

    assert "2-4 years" in captured[0]

    assert (
        "different underlying technical problem/task/knowledge target"
        in captured[0].lower()
    )