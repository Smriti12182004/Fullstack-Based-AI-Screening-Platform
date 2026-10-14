import json as jsonlib

from app.services import llm_service


class FakeResponse:
    status_code = 200

    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_generation_plan_controls_focus_and_prompt(monkeypatch):
    captured = []

    response_payload = {
        "questions": [
            {
                "question_text": (
                    "A fruit delivery service uses a Docker container for its API. "
                    "The image is already built, but traffic spikes during the morning rush "
                    "and the team needs to start the container quickly. "
                    "Which command should they use?"
                ),
                "options": [
                    "docker run image_name",
                    "docker build image_name",
                    "docker ps image_name",
                    "docker inspect image_name",
                ],
                "correct_answer": "A",
                "explanation": "docker run starts a new container from an image.",
            }
        ]
    }

    def fake_call(prompt, **kwargs):
        captured.append(prompt)
        return jsonlib.dumps(response_payload)

    monkeypatch.setattr(llm_service, "_call_llm_chat", fake_call)

    result = llm_service.generate_questions_from_skills(
        skills=[{"skill_id": 4, "skill_name": "Docker", "category": "DevOps"}],
        number_of_questions=1,
        difficulty="medium",
        section_type="implementation",
        question_type="MCQ",
        manager_prompt=(
            "use short realistic scenarios with fruit context and focus on efficiency"
        ),
        generation_focus="auto",
        experience_required="2-4 years",
        generation_plan={
            "candidate_index": 1,
            "pattern": "scenario",
            "problem_target": (
                "efficiently start an already-built container during a traffic spike"
            ),
            "knowledge_target": "Docker image versus container lifecycle",
            "scenario_context": "fruit delivery API during the morning rush",
            "example_context": "fruits",
            "efficiency_focus": "start quickly without rebuilding the image",
            "cognitive_operation": "choose the best command for the situation",
            "storyline": (
                "The delivery team has a built image and needs a quick startup "
                "during a rush."
            ),
            "uniqueness_anchor": "container startup from an existing image",
        },
    )

    assert len(result) == 1
    assert result[0].question_type == "MCQ"
    assert captured
    assert "QUESTION PLAN FOR THIS CANDIDATE" in captured[0]
    assert "efficiently start an already-built container" in captured[0]
    assert "Pattern: scenario" in captured[0]

    # The JD experience requirement must reach the actual writer prompt.
    assert "2-4 years" in captured[0]


def test_generation_plan_controls_hard_free_text_generation(monkeypatch):
    captured = []

    response_payload = {
        "questions": [
            {
                "question_text": (
                    "A FastAPI service is experiencing intermittent failures after a new "
                    "deployment. Explain how you would diagnose the issue, identify the "
                    "likely root cause, and design a robust fix while considering error "
                    "handling, observability, and recovery."
                ),
                "options": [],
                "correct_answer": None,
                "explanation": (
                    "A strong answer should identify a systematic diagnosis process, "
                    "trace the failing request path, inspect logs and relevant metrics, "
                    "consider FastAPI exception handling and deployment changes, explain "
                    "the likely root cause, and propose a concrete fix with appropriate "
                    "validation and recovery steps."
                ),
            }
        ]
    }

    def fake_call(prompt, **kwargs):
        captured.append(prompt)
        return jsonlib.dumps(response_payload)

    monkeypatch.setattr(llm_service, "_call_llm_chat", fake_call)

    result = llm_service.generate_questions_from_skills(
        skills=[
            {
                "skill_id": 4,
                "skill_name": "FastAPI",
                "category": "Framework",
            }
        ],
        number_of_questions=1,
        difficulty="hard",
        section_type="free_text",
        question_type="FREE_TEXT",
        manager_prompt=(
            "Focus on difficult FastAPI system-design and debugging questions. "
            "Require detailed reasoning and practical diagnosis."
        ),
        generation_focus="auto",
        manager_interpretation={
            "intent_summary": (
                "Use hard system-design and debugging free-text questions "
                "requiring detailed reasoning."
            ),
            "sentiment": {
                "label": "neutral",
                "confidence": 0.95,
                "evidence": None,
            },
            "requested_patterns": ["design"],
            "candidate_mix": [],
            "requested_difficulty": "hard",
            "must_include": ["system design", "diagnosis"],
            "preferred_examples": [],
            "avoid": ["simple definition questions"],
            "diversity_level": "high",
            "distinct_problem_statements": True,
            "vary_scenario_contexts": True,
            "requested_length": "long",
            "requested_response_depth": "reasoning",
            "priority_notes": [
                "Require practical diagnosis and design reasoning."
            ],
            "normalized_manager_instruction": (
                "Focus on difficult FastAPI system-design and debugging questions. "
                "Require detailed reasoning and practical diagnosis."
            ),
        },
        experience_required="4-6 years",
        generation_plan={
            "candidate_index": 1,
            "pattern": "design",
            "problem_target": (
                "diagnose intermittent FastAPI failures after a deployment "
                "and design a robust recovery approach"
            ),
            "knowledge_target": (
                "FastAPI exception handling observability and recovery design"
            ),
            "scenario_context": (
                "an API experiencing intermittent failures after deployment"
            ),
            "example_context": None,
            "efficiency_focus": None,
            "cognitive_operation": (
                "diagnose the failure and justify a robust design response"
            ),
            "storyline": (
                "A deployed FastAPI service begins failing intermittently "
                "and the team must diagnose and resolve the issue."
            ),
            "uniqueness_anchor": (
                "deployment-related failure diagnosis and recovery design"
            ),
        },
    )

    assert len(result) == 1
    assert result[0].section_type == "free_text"
    assert result[0].difficulty == "hard"
    assert result[0].question_type == "FREE_TEXT"
    assert result[0].options == []
    assert result[0].correct_answer is None
    assert result[0].explanation
    assert captured
    assert "QUESTION PLAN FOR THIS CANDIDATE" in captured[0]
    assert "Pattern: design" in captured[0]
    assert (
        "FastAPI exception handling observability and recovery design"
        in captured[0]
    )
    assert "free_text" in captured[0]
    assert "hard" in captured[0]

    # Verify experience calibration also reaches FREE_TEXT generation.
    assert "4-6 years" in captured[0]