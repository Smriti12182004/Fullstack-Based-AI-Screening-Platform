from types import SimpleNamespace

from app.services.llm_service import (
    GeneratedQuestion,
    _matches_non_technical_generation_focus,
    _non_technical_question_quality_errors,
    find_non_technical_domain_leakage,
)
from app.services import question_generation_planner as planner
from app.services.question_generation_planner import (
    _build_planner_prompt,
    _deterministic_easy_concept_plans,
)
from app.services.assessment_authoring_service import _validate_candidate_against_slot


def test_sales_problem_solving_easy_concepts_are_sales_specific():
    plans = _deterministic_easy_concept_plans(
        skill_name="problem-solving", count=3, skill_category="non_technical",
        job_title="Sales Executive",
        job_description="Qualify leads, understand customer needs, and handle objections.",
    )
    assert plans is not None and len(plans) == 3
    combined = " ".join(f"{p.problem_target} {p.knowledge_target} {p.storyline}" for p in plans).casefold()
    assert any(term in combined for term in ("customer", "sales", "lead", "objection"))
    assert not find_non_technical_domain_leakage(combined, job_title="Sales Executive")


def test_plan_question_batch_uses_sales_specific_local_concepts(monkeypatch):
    def unexpected_remote_call(*args, **kwargs):
        raise AssertionError("Sales easy-concept questions should use the role-specific local plan")

    monkeypatch.setattr(planner, "_call_planner", unexpected_remote_call)
    plans = planner.plan_question_batch(
        skill_name="problem-solving",
        section_type="conceptual",
        difficulty="easy",
        question_type="MCQ",
        count=3,
        manager_prompt=None,
        generation_focus="auto",
        experience_required="Fresher (0 years)",
        skill_category="non_technical",
        job_title="Sales Executive",
        job_description="Qualify leads, understand customer needs, handle objections, and follow up professionally.",
    )
    assert len(plans) == 3
    assert all(plan.pattern == "concept" for plan in plans)
    assert all(
        not find_non_technical_domain_leakage(
            f"{plan.problem_target} {plan.knowledge_target}",
            job_title="Sales Executive",
        )
        for plan in plans
    )


def test_non_sales_role_does_not_receive_sales_deterministic_templates():
    assert _deterministic_easy_concept_plans(
        skill_name="problem-solving", count=3, skill_category="non_technical",
        job_title="Office Administrator", job_description="Manage office coordination and records.",
    ) is None


def test_nontechnical_planner_prompt_excludes_computer_science_trivia():
    prompt = _build_planner_prompt(
        skill_name="problem-solving", section_type="conceptual", difficulty="easy",
        question_type="MCQ", count=3, manager_prompt=None, manager_interpretation=None,
        generation_focus="concept", experience_required="Fresher (0 years)",
        reference_question_text="What is the greedy choice property?",
        pattern_reference_question_texts=["What is an algorithm?"], excluded_question_texts=[],
        skill_category="non_technical", job_title="Sales Executive",
        job_description="Qualify leads, understand customer needs, handle objections, and follow up professionally.",
    )
    assert "Sales Executive" in prompt
    assert "customer needs" in prompt
    assert "Do not use programming" in prompt
    assert "ignore their subject matter" in prompt.lower()
    assert "The TECHNICAL TASK comes first" not in prompt


def test_nontechnical_concept_focus_accepts_direct_sales_concept():
    question = GeneratedQuestion(
        question_text="What should a sales executive do first when a prospect objects to the price?",
        skill_name="problem-solving",
        difficulty="easy",
        section_type="conceptual",
        question_type="MCQ",
        options=["Ask about the customer's concern", "Offer the largest discount", "End the discussion", "Promise an unverified benefit"],
        correct_answer="Ask about the customer's concern",
        explanation="Clarifying the objection helps identify the buyer's real concern.",
    )
    assert _matches_non_technical_generation_focus(question, "concept")


def test_nontechnical_leakage_detects_greedy_algorithm_question():
    found = find_non_technical_domain_leakage(
        "In problem-solving and algorithmic design, what is the primary purpose of defining a greedy choice property?",
        job_title="Sales Executive", job_description="Qualify leads and advise customers.",
    )
    assert "greedy algorithm" in found or "algorithmic design" in found


def test_nontechnical_leakage_accepts_sales_question():
    assert not find_non_technical_domain_leakage(
        "A prospect says the price is higher than expected. What should the sales executive ask first to understand the customer's concern?",
        job_title="Sales Executive", job_description="Understand customer needs and handle sales objections.",
    )


def test_authoring_validator_rejects_off_domain_question():
    bad = SimpleNamespace(
        skill_name="problem-solving", difficulty="easy", section_type="conceptual", question_type="MCQ",
        question_text="What is the primary purpose of the greedy choice property in algorithmic design?",
        options=["A", "B", "C", "D"], correct_answer="A",
        explanation="A greedy algorithm selects a locally optimal choice.",
    )
    valid, errors = _validate_candidate_against_slot(
        bad, SimpleNamespace(difficulty="easy", section_type="conceptual"),
        SimpleNamespace(name="problem-solving"), [], skill_category="non_technical",
        job_title="Sales Executive", job_description="Qualify leads, understand customer needs, and handle objections.",
    )
    assert not valid
    assert any("role domain" in error.lower() for error in errors)


def test_authoring_validator_accepts_sales_question():
    good = SimpleNamespace(
        skill_name="problem-solving", difficulty="easy", section_type="conceptual", question_type="MCQ",
        question_text="What should a sales executive do first when a prospect objects to the price?",
        options=["Ask a question to understand the customer's concern", "Immediately offer the largest discount", "End the conversation without asking why", "Promise an unverified product benefit"],
        correct_answer="Ask a question to understand the customer's concern",
        explanation="Clarifying the objection helps identify the customer's underlying need.",
    )
    valid, errors = _validate_candidate_against_slot(
        good, SimpleNamespace(difficulty="easy", section_type="conceptual"),
        SimpleNamespace(name="problem-solving"), [], skill_category="non_technical",
        job_title="Sales Executive", job_description="Understand customer needs and handle sales objections.",
    )
    assert valid, errors


def test_planner_normalizes_zero_based_candidate_indexes(monkeypatch):
    # Some model responses number three candidates 0, 1, 2. Evalyn expects
    # 1, 2, 3; the whole batch must be shifted before Pydantic validation.
    payload = {
        "plans": [
            {
                "candidate_index": 0,
                "pattern": "scenario",
                "problem_target": "reuse Docker build layers during repeated image builds",
                "knowledge_target": "Docker layer cache reuse",
                "scenario_context": "A service image is rebuilt for every small code change.",
                "example_context": "repeated deployments",
                "efficiency_focus": "avoid unnecessary rebuild work",
                "cognitive_operation": "choose the most effective build improvement",
                "storyline": "An engineering team rebuilds the same image many times per day.",
                "uniqueness_anchor": "reuse unchanged Docker layers across builds",
            },
            {
                "candidate_index": 1,
                "pattern": "scenario",
                "problem_target": "diagnose a container that exits when a required setting is absent",
                "knowledge_target": "Docker environment variable configuration",
                "scenario_context": "A deployed service exits immediately after configuration changes.",
                "example_context": "runtime configuration",
                "efficiency_focus": "locate the cause without rebuilding the image",
                "cognitive_operation": "select the most direct diagnostic step",
                "storyline": "A service stops starting after an environment setting is removed.",
                "uniqueness_anchor": "missing runtime environment configuration",
            },
            {
                "candidate_index": 2,
                "pattern": "scenario",
                "problem_target": "reduce the transfer time of an oversized production image",
                "knowledge_target": "Docker multi-stage builds and image layers",
                "scenario_context": "A deployment is delayed because its container image is too large.",
                "example_context": "image distribution",
                "efficiency_focus": "reduce the final image size",
                "cognitive_operation": "choose the best image construction approach",
                "storyline": "A team finds that its production image contains build-only dependencies.",
                "uniqueness_anchor": "exclude build-only dependencies from final image",
            },
        ]
    }

    monkeypatch.setattr(planner, "_call_planner", lambda prompt: payload)

    plans = planner.plan_question_batch(
        skill_name="Docker",
        section_type="implementation",
        difficulty="medium",
        question_type="MCQ",
        count=3,
        generation_focus="scenario",
        experience_required="2-4 years",
        skill_category="technical",
        job_title="Backend Developer",
        job_description="Build, deploy, and maintain containerized backend services.",
    )

    assert [plan.candidate_index for plan in plans] == [1, 2, 3]



def test_sales_mcq_rejects_extreme_and_off_topic_distractors():
    question = GeneratedQuestion(
        question_text=(
            "In a sales conversation, what is the main purpose of active listening "
            "and paraphrasing a client's statements?"
        ),
        skill_name="communication",
        difficulty="easy",
        section_type="conceptual",
        question_type="MCQ",
        options=[
            "Interrupt the client and steer the conversation toward closing the deal.",
            "Ensure mutual understanding of the client's needs and build trust.",
            "Memorize the technical specifications required for a custom product build.",
            "Dominate the dialogue and prevent the client from raising objections.",
        ],
        correct_answer="Ensure mutual understanding of the client's needs and build trust.",
        explanation="Active listening helps clarify needs and establish trust.",
    )

    errors = _non_technical_question_quality_errors(
        question, job_title="Sales Executive"
    )
    assert any("extreme or unprofessional distractor" in error for error in errors)
    assert any("off-topic technical distractor" in error for error in errors)


def test_free_text_question_rejects_evaluator_rubric_leakage():
    question = GeneratedQuestion(
        question_text=(
            "A prospect has not replied to your follow-up. Explain your next step. "
            "Provide rubric guidance on what a strong candidate response should include."
        ),
        skill_name="communication",
        difficulty="medium",
        section_type="free_text",
        question_type="FREE_TEXT",
        options=[],
        correct_answer=None,
        explanation="A strong answer is polite, concise, and value-focused.",
    )
    errors = _non_technical_question_quality_errors(
        question, job_title="Sales Executive"
    )
    assert any("evaluator-only rubric" in error for error in errors)


def test_sales_question_rejects_repeated_primary_purpose_stem():
    question = GeneratedQuestion(
        question_text=(
            "In professional sales communication, what is the primary purpose of "
            "scheduling a structured follow-up after a proposal?"
        ),
        skill_name="communication",
        difficulty="easy",
        section_type="conceptual",
        question_type="MCQ",
        options=[
            "Maintain engagement and address the prospect's emerging questions.",
            "Pressure the prospect to make an impulsive decision.",
            "Wait indefinitely without contacting the prospect again.",
            "Send unrelated product information regardless of the prospect's needs.",
        ],
        correct_answer="Maintain engagement and address the prospect's emerging questions.",
        explanation="A relevant follow-up supports the buyer's decision process.",
    )
    errors = _non_technical_question_quality_errors(
        question,
        job_title="Sales Executive",
        excluded_question_texts=[
            "In a sales conversation, what is the primary purpose of open-ended questions?"
        ],
    )
    assert any("repeats the generic 'primary-purpose' stem pattern" in error for error in errors)


def test_sales_question_accepts_plausible_non_repetitive_mcq():
    question = GeneratedQuestion(
        question_text=(
            "A customer says a competitor offered a lower price. What should you ask "
            "before deciding whether to adjust your proposal?"
        ),
        skill_name="problem-solving",
        difficulty="medium",
        section_type="conceptual",
        question_type="MCQ",
        options=[
            "Which part of the offer feels least aligned with your priorities?",
            "Would a different delivery schedule better fit your budget?",
            "Which features matter most to your team in this decision?",
            "When do you need to make a final decision about the purchase?",
        ],
        correct_answer="Which part of the offer feels least aligned with your priorities?",
        explanation="Clarifying the customer's concern helps identify the real objection.",
    )
    errors = _non_technical_question_quality_errors(
        question,
        job_title="Sales Executive",
        excluded_question_texts=[
            "A prospect has delayed a purchase. Which next step best uncovers the obstacle?"
        ],
    )
    assert errors == []
