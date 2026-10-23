"""Plan diverse assessment questions before asking the LLM to write them.

The planner converts manager guidance plus the hard slot context into a compact
plan for each candidate. The generator then writes one question against one
plan. This separation prevents a local model from satisfying "be diverse" by
only changing names, numbers, options, or superficial wording.
"""

from __future__ import annotations

import json
import re

from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.services.llm_client import (
    _call_gemini_chat,
    _call_groq_chat,
    LLMResponseError,
    GEMINI_QUESTION_TIMEOUT_SECONDS,
)
from app.services.manager_prompt_service import (
    ManagerPromptInterpretation,
    QuestionPattern,
)

QUESTION_PLAN_TIMEOUT_SECONDS = min(30, GEMINI_QUESTION_TIMEOUT_SECONDS)
QUESTION_PLAN_MAX_EXISTING_QUESTIONS = 12
QUESTION_PLAN_MAX_REFERENCE_QUESTIONS = 5

class QuestionGenerationPlannerError(Exception):
    """Base exception for question-generation planning failures."""

class QuestionGenerationPlan(BaseModel):
    """Compact semantic plan for one generated assessment candidate."""

    candidate_index: int = Field(ge=1, le=50)
    pattern: QuestionPattern
    problem_target: str = Field(min_length=1, max_length=180)
    knowledge_target: str = Field(min_length=1, max_length=180)
    scenario_context: str = Field(min_length=1, max_length=180)
    example_context: str | None = Field(default=None, max_length=120)
    efficiency_focus: str | None = Field(default=None, max_length=140)
    cognitive_operation: str = Field(min_length=1, max_length=100)
    storyline: str = Field(min_length=1, max_length=180)
    uniqueness_anchor: str = Field(min_length=1, max_length=160)

class QuestionGenerationPlanResponse(BaseModel):
    """Planner response containing one plan per requested candidate."""

    plans: list[QuestionGenerationPlan]

# Gemini structured-output schemas intentionally support only a conservative
# subset of JSON Schema here.
#
# Important:
# - nullable fields are represented as plain strings;
# - the model should return "" when the value is not needed;
# - application-side normalization converts "" back to None;
# - no minimum/maximum constraints are sent to the API;
# - no additionalProperties constraint is required;
# - the planner still validates the complete structure with Pydantic after
#   receiving the response.
#
# This keeps the API request compatible while preserving the same application
# validation contract.
QUESTION_GENERATION_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "plans": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "candidate_index": {
                        "type": "integer",
                    },
                    "pattern": {
                        "type": "string",
                        "enum": [
                            "concept",
                            "scenario",
                            "comparison",
                            "code",
                            "output",
                            "debugging",
                            "sql",
                            "design",
                            "applied",
                        ],
                    },
                    "problem_target": {
                        "type": "string",
                    },
                    "knowledge_target": {
                        "type": "string",
                    },
                    "scenario_context": {
                        "type": "string",
                    },
                    "example_context": {
                        "type": "string",
                        "description": (
                            "Supporting example, or empty string when not needed."
                        ),
                    },
                    "efficiency_focus": {
                        "type": "string",
                        "description": (
                            "Specific efficiency or performance focus, "
                            "or empty string when not requested."
                        ),
                    },
                    "cognitive_operation": {
                        "type": "string",
                    },
                    "storyline": {
                        "type": "string",
                    },
                    "uniqueness_anchor": {
                        "type": "string",
                    },
                },
                "required": [
                    "candidate_index",
                    "pattern",
                    "problem_target",
                    "knowledge_target",
                    "scenario_context",
                    "example_context",
                    "efficiency_focus",
                    "cognitive_operation",
                    "storyline",
                    "uniqueness_anchor",
                ],
            },
        },
    },
    "required": [
        "plans",
    ],
}

def _normalize_text(
    value: object,
    max_length: int,
) -> str:
    return " ".join(
        str(value or "").strip().split()
    )[:max_length]

def _extract_json_payload(
    raw_text: str,
) -> object:
    """Parse planner JSON, including fenced or lightly wrapped model output."""

    if not isinstance(
        raw_text,
        str,
    ) or not raw_text.strip():
        raise QuestionGenerationPlannerError(
            "LLM returned an empty question-planning response."
        )

    cleaned = raw_text.strip()

    # Preferred path: response_format should make this pure JSON.
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Gracefully handle accidental markdown fences.
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()

        if (
            lines
            and lines[0].strip().startswith("```")
        ):
            lines = lines[1:]

        if (
            lines
            and lines[-1].strip() == "```"
        ):
            lines = lines[:-1]

        fenced = "\n".join(lines).strip()

        try:
            return json.loads(fenced)
        except json.JSONDecodeError:
            cleaned = fenced

    # Tolerate harmless leading prose by locating the first JSON object/array.
    decoder = json.JSONDecoder()

    candidate_starts = [
        index
        for index in (
            cleaned.find("["),
            cleaned.find("{"),
        )
        if index >= 0
    ]

    if candidate_starts:
        start = min(candidate_starts)

        try:
            value, _ = decoder.raw_decode(
                cleaned[start:]
            )
            return value
        except json.JSONDecodeError:
            pass

    raise QuestionGenerationPlannerError(
        "LLM did not return valid JSON for question planning."
    )

def _serialize_intent(
    intent: ManagerPromptInterpretation | None,
) -> str:
    if intent is None:
        return (
            "No structured manager interpretation is available."
        )

    return json.dumps(
        intent.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
    )

def _requested_patterns(
    intent: ManagerPromptInterpretation | None,
) -> list[str]:
    """Return normalized manager-requested patterns, preserving order."""

    if intent is None:
        return []

    patterns: list[str] = []

    for pattern in intent.requested_patterns:
        normalized = str(
            pattern
        ).strip().casefold()

        if (
            normalized
            and normalized not in patterns
        ):
            patterns.append(normalized)

    return patterns

def _manager_requests_efficiency(
    intent: ManagerPromptInterpretation | None,
) -> bool:
    """Return whether manager guidance requests efficiency/performance focus."""

    if intent is None:
        return False

    fields = [
        *intent.must_include,
        *intent.priority_notes,
        intent.intent_summary,
        intent.normalized_manager_instruction,
    ]

    return any(
        "efficien" in str(value).casefold()
        or "perform" in str(value).casefold()
        for value in fields
    )

def _experience_level_guidance(
    experience_required: str | None,
    skill_category: str = "technical",
) -> str:
    """Calibrate sophistication without changing the confirmed skill or job domain."""
    raw = " ".join(str(experience_required or "").strip().casefold().split())
    if str(skill_category or "").strip().lower() == "non_technical":
        if not raw:
            level = "unspecified"
            guidance = (
                "- Do not invent seniority. Let the slot's difficulty determine complexity.\n"
                "- Use ordinary professional judgement and common workplace situations."
            )
        elif any(marker in raw for marker in ("fresher", "fresh graduate", "entry level", "entry-level", "0 year", "0 years", "graduate")):
            level = "foundational-entry"
            guidance = (
                "- Assume an early-career candidate with limited professional exposure.\n"
                "- Test basic professional concepts and straightforward role-related decisions.\n"
                "- Do not require specialist knowledge or computer-science problem-solving."
            )
        else:
            level = "as specified by the JD"
            guidance = (
                "- Match the depth of professional judgement to the experience specified.\n"
                "- Do not let experience alter the role domain, skill, section, difficulty, or response format."
            )
        return f"""
EXPERIENCE REQUIREMENT — JD
- Original requirement: {_normalize_text(experience_required, 100) or "not specified"}
- Derived experience band: {level}

EXPERIENCE CALIBRATION FOR A NON-TECHNICAL ROLE
{guidance}
""".strip()

    if not raw:
        return """
EXPERIENCE REQUIREMENT — JD
- Original requirement: not specified
- Derived experience band: unspecified

EXPERIENCE CALIBRATION
- Do not invent a seniority level.
- Let the slot's section and difficulty determine the baseline complexity.
- Use normal professional reasoning for the requested difficulty.
""".strip()

    if any(marker in raw for marker in ("fresher", "fresh graduate", "entry level", "entry-level", "graduate", "0 year", "0 years", "zero year", "zero years")):
        level = "foundational-entry"
        guidance = """
- Assume an early-career candidate with limited professional exposure.
- Prefer foundational mechanisms, familiar APIs/commands, straightforward implementation,
  and one-step debugging or reasoning.
- Avoid architecture-heavy decisions, obscure edge cases, deep production trade-offs,
  and highly specialized operational knowledge.
""".strip()
    else:
        range_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)", raw)
        plus_match = re.search(r"(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)", raw)
        single_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:years?|yrs?)", raw)
        minimum_years: float | None = None
        maximum_years: float | None = None
        if range_match:
            minimum_years = float(range_match.group(1))
            maximum_years = float(range_match.group(2))
        elif plus_match:
            minimum_years = float(plus_match.group(1))
        elif single_match:
            minimum_years = float(single_match.group(1))

        if minimum_years is None:
            level = "unspecified"
            guidance = "- Do not invent a precise seniority level from ambiguous wording."
        elif minimum_years < 1:
            level = "foundational-entry"
            guidance = "- Prefer foundational concepts, familiar mechanisms, and one-step reasoning."
        elif minimum_years < 2:
            level = "early-career"
            guidance = "- Use common implementation tasks, routine debugging, familiar APIs, and modest reasoning."
        elif minimum_years < 4:
            level = "mid-level"
            guidance = "- Favor practical implementation, common debugging, realistic constraints, and moderate trade-offs."
        elif minimum_years < 6:
            level = "experienced"
            guidance = "- Expect deeper troubleshooting and meaningful performance/reliability trade-offs where appropriate."
        else:
            level = "senior"
            guidance = "- Use deeper production situations and architecture-aware reasoning where compatible with difficulty."

    original_requirement = _normalize_text(experience_required, 100) or "not specified"
    return f"""
EXPERIENCE REQUIREMENT — JD
- Original requirement: {original_requirement}
- Derived experience band: {level}

EXPERIENCE CALIBRATION
{guidance}

IMPORTANT:
- Experience calibrates sophistication only.
- It MUST NOT override the confirmed skill, section type, difficulty, question type,
  manager request, generation pattern, job domain, or other hard constraints.
""".strip()


_GENERIC_PLAN_TERMS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "for",
    "to",
    "of",
    "in",
    "on",
    "with",
    "from",
    "by",
    "is",
    "are",
    "be",
    "being",
    "needs",
    "need",
    "wants",
    "want",
    "use",
    "using",
    "users",
    "user",
    "team",
    "company",
    "application",
    "system",
    "project",
    "service",
    "management",
    "manage",
    "managing",
    "optimize",
    "optimizing",
    "optimization",
    "efficient",
    "efficiency",
    "performance",
    "improve",
    "improving",
    "improvement",
    "reduce",
    "reducing",
    "minimize",
    "minimizing",
    "increase",
    "increasing",
    "ensure",
    "ensuring",
    "support",
    "supports",
    "provide",
    "providing",
    "better",
    "best",
    "overall",
    "appropriate",
    "technical",
    "issue",
    "problem",
    "goal",
    "decision",
    "action",
    "cost",
    "costs",
    "waste",
    "space",
    "resources",
    "resource",
}

def _meaningful_tokens(
    value: str | None,
) -> set[str]:
    """Extract content words useful for comparing plan targets."""

    tokens = {
        token.casefold()
        for token in re.findall(
            r"[a-zA-Z][a-zA-Z0-9_-]{2,}",
            str(value or ""),
        )
    }

    return {
        token.rstrip("s")
        for token in tokens
        if token not in _GENERIC_PLAN_TERMS
    }


_NON_TECHNICAL_PLAN_LEAKAGE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("greedy-choice property", r"\bgreedy(?:\s+choice)?\s+propert(?:y|ies)\b"),
    ("greedy algorithm", r"\bgreedy\s+algorithm\b"),
    ("algorithmic design", r"\balgorithmic\s+design\b"),
    ("computer-science algorithm", r"\b(?:algorithm|algorithms|permutation|permutations|memoization|recursion|recursive|graph traversal|binary tree|dynamic programming|time complexity|space complexity)\b"),
    ("programming implementation", r"\b(?:syntax errors?|memory leaks?|compiler|programming language|source code|code snippet|software debugging)\b"),
    ("algorithm deployment or hardware sizing", r"\b(?:deploy(?:ing|ment)?\s+(?:the\s+)?algorithm|hardware limits required to deploy|algorithm in production)\b"),
)


def _non_technical_plan_leakage(
    value: str | None,
) -> list[str]:
    normalized = " ".join(str(value or "").casefold().split())
    matches = [
        label
        for label, pattern in _NON_TECHNICAL_PLAN_LEAKAGE_PATTERNS
        if re.search(pattern, normalized, flags=re.IGNORECASE)
    ]
    return list(dict.fromkeys(matches))


_NON_TECHNICAL_CONCEPT_TOPICS: dict[str, list[tuple[str, str]]] = {
    "problem-solving": [
        ("Responding to a customer objection", "Understand the customer's underlying concern before proposing a response"),
        ("Prioritising sales leads", "Prioritise prospects using fit and demonstrated purchase intent"),
        ("Following up with an unresponsive prospect", "Choose a professional next step after an unanswered sales follow-up"),
        ("Handling a sales target shortfall", "Choose a realistic corrective action while preserving customer trust"),
        ("Resolving a customer requirement mismatch", "Clarify customer needs before recommending a suitable offering"),
    ],
    "problem solving": [
        ("Responding to a customer objection", "Understand the customer's underlying concern before proposing a response"),
        ("Prioritising sales leads", "Prioritise prospects using fit and demonstrated purchase intent"),
        ("Following up with an unresponsive prospect", "Choose a professional next step after an unanswered sales follow-up"),
        ("Handling a sales target shortfall", "Choose a realistic corrective action while preserving customer trust"),
        ("Resolving a customer requirement mismatch", "Clarify customer needs before recommending a suitable offering"),
    ],
    "communication": [
        ("Clarifying a customer's needs", "Use active listening and open questions to clarify requirements"),
        ("Explaining a product benefit", "Connect a product benefit to a customer's stated need"),
        ("Responding to a customer concern", "Acknowledge the concern and provide a clear relevant response"),
        ("Giving a concise sales pitch", "Present a value proposition clearly and accurately"),
        ("Confirming the next step", "Summarise the agreed action and confirm expectations"),
    ],
    "presentation skills": [
        ("Structuring a product presentation", "Organise a pitch around customer needs and relevant benefits"),
        ("Tailoring a presentation", "Choose product information relevant to the audience's needs"),
        ("Handling questions during a pitch", "Answer accurately and acknowledge when information needs verification"),
        ("Explaining product value", "Connect features with meaningful customer benefits"),
        ("Closing a presentation", "Summarise value and agree on a clear next step"),
    ],
    "lead generation": [
        ("Identifying a suitable prospect", "Match prospect characteristics to the intended customer profile"),
        ("Qualifying a sales lead", "Distinguish an interested contact from a lead with fit and intent"),
        ("Prioritising new leads", "Rank leads using relevance, engagement, and purchase intent"),
        ("Choosing a prospecting channel", "Select a channel suited to the target audience"),
        ("Maintaining lead quality", "Avoid counting unqualified contacts as sales-ready opportunities"),
    ],
    "sales negotiation": [
        ("Responding to a price objection", "Explore the customer's concern before discussing concessions"),
        ("Trading concessions", "Exchange a concession for a meaningful reciprocal commitment"),
        ("Protecting customer value", "Balance the customer's needs with the agreed value of the offer"),
        ("Clarifying negotiation priorities", "Separate essential requirements from negotiable preferences"),
        ("Confirming an agreement", "Summarise agreed terms and next steps accurately"),
    ],
    "customer relationship management": [
        ("Maintaining a customer relationship", "Use reliable follow-up and accurate interaction records"),
        ("Handling an unhappy customer", "Acknowledge the issue and agree on an appropriate next step"),
        ("Following up after a sale", "Check whether the delivered solution met the customer's expectations"),
        ("Managing customer expectations", "Communicate realistic timelines and commitments"),
        ("Building customer trust", "Provide accurate information and keep commitments"),
    ],
    "follow-up": [
        ("Following up after a product pitch", "Choose a timely next step that reflects the customer's stated interest"),
        ("Following up after no reply", "Use a professional reminder without overwhelming the prospect"),
        ("Recording a follow-up commitment", "Capture the agreed action and date accurately"),
        ("Closing the loop with a customer", "Confirm an outcome rather than assuming the issue is resolved"),
        ("Choosing when to follow up", "Respect the customer's timeline while keeping the opportunity active"),
    ],
    "target orientation": [
        ("Prioritising opportunities near a target deadline", "Focus effort on realistic opportunities without misrepresenting progress"),
        ("Monitoring progress toward a sales target", "Compare current progress with the target and available time"),
        ("Balancing volume and quality", "Avoid pursuing unsuitable leads only to increase activity counts"),
        ("Responding to a target shortfall", "Choose an actionable and ethical recovery plan"),
        ("Reporting sales progress", "Communicate results accurately against the agreed target"),
    ],
    "persuasion": [
        ("Matching a benefit to a customer need", "Use relevant evidence rather than pressure to explain value"),
        ("Responding to hesitation", "Ask about the concern before making a recommendation"),
        ("Supporting a recommendation", "Use accurate, relevant product information to support a claim"),
        ("Addressing a misconception", "Correct inaccurate assumptions respectfully and clearly"),
        ("Encouraging a next step", "Propose a clear next step without making unsupported promises"),
    ],
    "teamwork": [
        ("Handing a qualified lead to a colleague", "Share accurate customer context and agreed next steps"),
        ("Coordinating with marketing", "Provide useful lead feedback while keeping customer details accurate"),
        ("Supporting a teammate's customer meeting", "Agree on roles and avoid conflicting messages"),
        ("Sharing a customer update", "Communicate relevant information through the agreed team process"),
        ("Resolving a team handoff gap", "Clarify ownership and next steps instead of duplicating work"),
    ],
}


def _role_domain_guidance(
    *,
    skill_name: str,
    skill_category: str,
    job_title: str | None,
    job_description: str | None,
) -> str:
    category = "non_technical" if str(skill_category or "").strip().lower() == "non_technical" else "technical"
    title = _normalize_text(job_title, 255) or "not provided"
    description = _normalize_text(job_description, 3500) or "not provided"
    skill = _normalize_text(skill_name, 100) or "not provided"

    if category == "non_technical":
        return f"""
ROLE / JOB CONTEXT — HARD DOMAIN BOUNDARY
- Job title: {title}
- Confirmed skill: {skill}
- Skill category: non_technical / professional skill
- Job description context: {description}

NON-TECHNICAL PLANNING RULES
- Interpret the skill only in the occupational context supported by the title and job description.
- Plan professional concepts, responsibilities, decisions, and situations a candidate in this role would actually face.
- A broad skill like problem-solving must be interpreted in the job domain. For Sales Executive, that means customer needs, lead prioritisation, sales objections, follow-up, negotiation, product value, and targets when supported by the JD—not algorithms or abstract computer-science puzzles.
- Do not use programming, greedy-choice properties, recursion, permutations, memoization, graph traversal, syntax errors, memory leaks, compilers, code snippets, or algorithm deployment unless the supplied JD explicitly requires that topic.
- For easy conceptual questions, select a genuine role-related concept (such as lead qualification or consultative selling for a sales job), not a generic definition of a broad transferable skill.
- Keep every target answerable at the requested difficulty and response format.
- Do not invent tools, qualifications, duties, or specialist knowledge absent from the supplied JD.
- Older/reference questions may guide response style only; ignore their subject matter if it conflicts with this job domain.
""".strip()

    return f"""
ROLE / JOB CONTEXT
- Job title: {title}
- Confirmed skill: {skill}
- Skill category: technical
- Job description context: {description}
- Keep every technical target in the confirmed skill and the scope supported by the job description.
""".strip()

def _technical_plan_quality_errors(
    plan: QuestionGenerationPlan,
    *,
    skill_name: str,
    skill_category: str = "technical",
) -> list[str]:
    """Validate that plan targets are sufficiently specific and role-appropriate."""

    errors: list[str] = []
    is_non_technical = str(skill_category or "").strip().lower() == "non_technical"
    problem_tokens = _meaningful_tokens(plan.problem_target)
    knowledge_tokens = _meaningful_tokens(plan.knowledge_target)

    if len(problem_tokens) < 2:
        errors.append(
            "Planner produced an under-specified problem target. "
            + (
                "Describe a concrete professional situation or decision."
                if is_non_technical
                else "Describe a concrete technical problem or mechanism rather than a generic goal."
            )
        )

    if len(knowledge_tokens) < 2:
        errors.append(
            "Planner produced an under-specified knowledge target. "
            + (
                "Name the specific role-related concept or professional practice being tested."
                if is_non_technical
                else "Name the concrete technical mechanism or concept being tested."
            )
        )

    if is_non_technical:
        plan_material = " ".join(
            [
                plan.problem_target,
                plan.knowledge_target,
                plan.scenario_context,
                plan.example_context or "",
                plan.storyline,
                plan.uniqueness_anchor,
            ]
        )
        leakage = _non_technical_plan_leakage(plan_material)
        if leakage:
            errors.append(
                "Planner included computer-science content in a non-technical plan: "
                + ", ".join(leakage)
                + "."
            )

    # The exact skill stays a hard constraint; its name need not appear verbatim in
    # every semantic target when the context makes the relationship clear.
    _ = skill_name
    return errors

def _plan_matches_manager_intent(
    plan: QuestionGenerationPlan,
    intent: ManagerPromptInterpretation | None,
) -> bool:
    """Check a planner result against explicit manager requirements."""

    patterns = _requested_patterns(intent)

    if (
        len(patterns) == 1
        and plan.pattern.casefold() != patterns[0]
    ):
        return False

    if (
        _manager_requests_efficiency(intent)
        and not (
            plan.efficiency_focus or ""
        ).strip()
    ):
        return False

    return True

def _hard_pattern_for_slot(
    section_type: str,
    difficulty: str,
) -> QuestionPattern | None:
    """Return the immutable pattern required by a slot, when one exists."""

    if (
        section_type == "conceptual"
        and difficulty == "easy"
    ):
        return "concept"

    return None

def _pattern_instruction(
    intent: ManagerPromptInterpretation | None,
    *,
    section_type: str,
    difficulty: str,
    generation_focus: str = "auto",
) -> str:
    """Describe the pattern contract that the planner must obey."""

    hard_pattern = _hard_pattern_for_slot(
        section_type,
        difficulty,
    )

    normalized_focus = str(
        generation_focus or "auto"
    ).strip().lower()

    patterns = _requested_patterns(
        intent
    )

    if hard_pattern == "concept":
        return (
            "- REQUIRED PATTERN FOR EVERY CANDIDATE: concept. "
            "This is an EASY CONCEPTUAL section, so the slot-level pattern is immutable. "
            "Any incompatible scenario, applied, debugging, code, output, SQL, or design "
            "request must be ignored for pattern selection. Keep compatible topic, tone, "
            "and example guidance where possible, but do not turn the question into a scenario. "
            "Every candidate must test one foundational concept, principle, basic behavior, "
            "or simple conceptual distinction with a direct question stem and minimal context. "
            "Do not invent a business story, actor, incident, workload, or operational failure."
        )

    if normalized_focus != "auto":
        return (
            f"- REQUIRED PATTERN FOR EVERY CANDIDATE: {normalized_focus}. "
            "Treat the explicit generation focus as the effective pattern for this slot. "
            "Do not switch to another pattern."
        )

    if len(patterns) == 1:
        return (
            f"- REQUIRED PATTERN FOR EVERY CANDIDATE: {patterns[0]}. "
            "Do not switch to another pattern."
        )

    if patterns:
        return (
            "- REQUESTED PATTERNS: "
            + ", ".join(patterns)
            + ". "
            "Use only these patterns unless the manager clearly requested otherwise. "
            "Distribute them sensibly across the batch."
        )

    return (
        "- No explicit pattern was requested; choose a suitable pattern "
        "consistent with the slot."
    )

def _efficiency_instruction(
    intent: ManagerPromptInterpretation | None,
) -> str:
    """Describe the manager's efficiency requirement."""

    if _manager_requests_efficiency(intent):
        return (
            "- EFFICIENCY REQUIREMENT: every candidate must include a concrete "
            "efficiency/performance decision, bottleneck, trade-off, or optimization "
            "action in efficiency_focus. Do not merely mention the word efficient."
        )

    return "- No explicit efficiency requirement was detected."

def _build_planner_prompt(
    *,
    skill_name: str,
    section_type: str,
    difficulty: str,
    question_type: str,
    count: int,
    manager_prompt: str | None,
    manager_interpretation: ManagerPromptInterpretation | None,
    generation_focus: str = "auto",
    experience_required: str | None,
    reference_question_text: str | None,
    pattern_reference_question_texts: list[str] | None,
    excluded_question_texts: list[str] | None,
    skill_category: str = "technical",
    job_title: str | None = None,
    job_description: str | None = None,
) -> str:
    """Build the semantic planner prompt."""

    existing: list[str] = []

    for item in excluded_question_texts or []:
        cleaned = _normalize_text(
            item,
            320,
        )

        if cleaned:
            existing.append(cleaned)

        if (
            len(existing)
            >= QUESTION_PLAN_MAX_EXISTING_QUESTIONS
        ):
            break

    references: list[str] = []

    for item in pattern_reference_question_texts or []:
        cleaned = _normalize_text(
            item,
            320,
        )

        if (
            cleaned
            and cleaned.lower()
            not in {
                ref.lower()
                for ref in references
            }
        ):
            references.append(cleaned)

        if (
            len(references)
            >= QUESTION_PLAN_MAX_REFERENCE_QUESTIONS
        ):
            break

    example_lines = (
        "\n".join(
            f"- {item}"
            for item in references
        )
        or "- none"
    )

    excluded_lines = (
        "\n".join(
            f"- {item}"
            for item in existing
        )
        or "- none"
    )

    current_reference = (
        _normalize_text(
            reference_question_text,
            360,
        )
        or "none"
    )

    manager_message = (
        _normalize_text(
            manager_prompt,
            1200,
        )
        or "none"
    )

    normalized_skill_category = (
        "non_technical"
        if str(skill_category or "").strip().lower() == "non_technical"
        else "technical"
    )
    normalized_job_title = _normalize_text(job_title, 255) or None
    normalized_job_description = _normalize_text(job_description, 3500) or None
    experience_guidance = _experience_level_guidance(
        experience_required,
        normalized_skill_category,
    )
    role_domain_guidance = _role_domain_guidance(
        skill_name=skill_name,
        skill_category=normalized_skill_category,
        job_title=normalized_job_title,
        job_description=normalized_job_description,
    )

    if normalized_skill_category == "non_technical":
        planning_rules = f"""
1. Produce one plan per candidate; all plans must be materially different.
2. Keep every plan inside the confirmed non-technical job role, selected skill, section, difficulty, and response format.
3. Interpret broad skills (especially problem-solving) in the actual occupational context supplied by the job title and JD. For a Sales Executive, use customer needs, lead qualification, objection handling, negotiation, follow-up, and targets only where appropriate to the JD.
4. Do not turn professional problem-solving into algorithms, greedy-choice properties, permutations, recursion, memoization, code, SQL, software debugging, memory leaks, or computer-science trivia unless the JD explicitly requires that subject.
5. For conceptual questions, define a job-relevant knowledge target. For applied or scenario questions, use a concrete professional situation, constraint, decision, or customer/workflow goal.
6. The problem target and knowledge target must describe the same role-relevant issue or concept.
7. Do not invent responsibilities, products, qualifications, tools, or customer situations unsupported by the JD.
8. Treat manager guidance as an authoring requirement except where it conflicts with hard slot/role constraints.
9. Preserve the requested difficulty and question type; use one clearly defensible answer for an MCQ.
10. Do not copy the underlying target, scenario, or storyline from excluded questions.
11. Before output, verify that every plan belongs to the specified role and non-technical skill, uses role-appropriate language, and could become one clear assessment question.
{_pattern_instruction(
    manager_interpretation,
    section_type=section_type,
    difficulty=difficulty,
    generation_focus=generation_focus,
)}
""".strip()
    else:
        planning_rules = f"""
1. Produce one plan per candidate. Candidate 1 through candidate {count} must be materially different.
2. "Different" means a different underlying technical problem/task/knowledge target, mechanism, or failure mode. Changing only names, numbers, options, APIs, actors, or wording does NOT count.
3. Keep every plan inside the same confirmed skill, section, difficulty and response format.
4. Treat the manager's structured intent as an authoring requirement, not a suggestion.
{_pattern_instruction(
    manager_interpretation,
    section_type=section_type,
    difficulty=difficulty,
    generation_focus=generation_focus,
)}
5. For technical skills, the TECHNICAL TASK comes first and the story comes second. The problem_target and knowledge_target must name a real skill-native mechanism, command, configuration, lifecycle behaviour, failure mode, data operation, or design choice.
6. The problem_target and knowledge_target must describe the same concrete technical area.
7. Use established, straightforward mechanisms appropriate to the confirmed skill. Avoid invented APIs, unsupported tools, and unnecessary implementation detail.
8. Manager examples are contextual story material unless explicitly mandatory; use them naturally without letting them replace the technical task.
9. For scenarios, provide a concrete short situation with a real constraint, decision, symptom, or goal. The technical skill must matter to the decision.
{_efficiency_instruction(manager_interpretation)}
10. When efficiency/performance is requested, make it a concrete technical bottleneck or decision, not just the word "efficient".
11. Use manager dissatisfaction as quality feedback; never change hard constraints because of sentiment.
12. Preserve requested difficulty and treat experience as a sophistication signal.
13. Apply the JD experience requirement without inventing architecture or seniority.
14. Do not copy an existing question's target, scenario, or storyline.
15. The uniqueness anchor must describe the technical difference between plans.
16. Keep each field concise and internally consistent.
17. Before output, verify that skill, plan targets, scenario, pattern, difficulty, and question type agree.
""".strip()

    return f"""
You are Evalyn's assessment question planner.

Create exactly {count} DISTINCT question plans for later question writing.

HARD SLOT CONSTRAINTS — never override:

- Skill: {skill_name}
- Section type: {section_type}
- Difficulty: {difficulty}
- Question type: {question_type}

{role_domain_guidance}

MANAGER MESSAGE:

{manager_message}

STRUCTURED MANAGER INTENT:

{_serialize_intent(manager_interpretation)}

{experience_guidance}

CURRENT QUESTION, if any (reference only):

{current_reference}

RECENT PATTERN EXAMPLES (style/pattern only):

{example_lines}

EXISTING QUESTIONS TO AVOID:

{excluded_lines}

PLANNING RULES:

{planning_rules}
OUTPUT ONLY JSON. No markdown. No explanations.

For example_context and efficiency_focus, return an empty string when the field
is not needed. Do not return null.

The output must contain a top-level "plans" array.

Each plan must contain:

- candidate_index
- pattern
- problem_target
- knowledge_target
- scenario_context
- example_context
- efficiency_focus
- cognitive_operation
- storyline
- uniqueness_anchor
""".strip()

def _infer_plan_pattern(
    raw: dict,
    *,
    section_type: str,
    difficulty: str,
) -> QuestionPattern:
    """Infer a safe pattern when the model omits the explicit pattern field."""

    if (
        section_type == "conceptual"
        and difficulty == "easy"
    ):
        return "concept"

    # IMPORTANT:
    # Normalize each field to one string before the outer join.
    # This fixes the previous:
    # TypeError: sequence item 0: expected str instance, list found
    raw_text = " ".join(
        " ".join(
            str(
                raw.get(key)
                or ""
            ).strip().casefold().split()
        )
        for key in (
            "problem_target",
            "knowledge_target",
            "scenario_context",
            "storyline",
            "cognitive_operation",
        )
    )

    if any(
        marker in raw_text
        for marker in (
            "debug",
            "bug",
            "error",
            "exception",
            "traceback",
            "failure",
            "failed",
            "fix",
            "root cause",
        )
    ):
        return "debugging"

    if any(
        marker in raw_text
        for marker in (
            "output",
            "predict the",
            "what will",
            "printed",
            "return",
        )
    ):
        return "output"

    if any(
        marker in raw_text
        for marker in (
            "sql",
            "query",
            "join",
            "select",
            "insert",
            "update",
            "delete",
            "group by",
        )
    ):
        return "sql"

    if any(
        marker in raw_text
        for marker in (
            "code",
            "snippet",
            "implement",
            "implementation",
            "function",
            "method",
            "class",
        )
    ):
        return "code"

    if any(
        marker in raw_text
        for marker in (
            "compare",
            "comparison",
            "difference between",
            "distinguish",
            "versus",
            " vs ",
        )
    ):
        return "comparison"

    if any(
        marker in raw_text
        for marker in (
            "scenario",
            "real-world",
            "production",
            "suppose",
            "incident",
        )
    ):
        return "scenario"

    if any(
        marker in raw_text
        for marker in (
            "design",
            "architecture",
            "trade-off",
            "tradeoff",
        )
    ):
        return "design"

    if section_type in {
        "implementation",
        "free_text",
    }:
        return "applied"

    return "concept"

def _normalize_pattern(
    value: object,
    *,
    raw: dict,
    section_type: str,
    difficulty: str,
) -> QuestionPattern:
    valid_patterns = {
        "concept",
        "scenario",
        "comparison",
        "code",
        "output",
        "debugging",
        "sql",
        "design",
        "applied",
    }

    normalized = str(
        value or ""
    ).strip().casefold()

    if normalized in valid_patterns:
        pattern = normalized
    else:
        pattern = _infer_plan_pattern(
            raw,
            section_type=section_type,
            difficulty=difficulty,
        )

    hard_pattern = _hard_pattern_for_slot(
        section_type,
        difficulty,
    )

    if hard_pattern is not None:
        return hard_pattern

    return pattern  # type: ignore[return-value]

def _normalize_raw_plan(
    raw: dict,
    position: int,
    *,
    section_type: str,
    difficulty: str,
) -> dict:
    candidate_index_raw = raw.get(
        "candidate_index",
        raw.get(
            "candidate_number",
            position,
        ),
    )

    try:
        candidate_index = int(
            candidate_index_raw
        )
    except (
        TypeError,
        ValueError,
    ):
        candidate_index = position

    scenario_context = _normalize_text(
        raw.get("scenario_context"),
        180,
    )

    # Easy conceptual questions should not need a narrative scenario.
    # The planner prompt explicitly forbids inventing one for this slot type,
    # but the plan model requires a non-empty context field. Normalize a
    # minimal, non-scenario context here so a valid conceptual plan is not
    # discarded solely because the LLM returned an empty scenario_context.
    is_easy_concept = (
        _hard_pattern_for_slot(section_type, difficulty) == "concept"
    )
    if not scenario_context and is_easy_concept:
        scenario_context = "Minimal context; direct foundational concept check."

    storyline = _normalize_text(
        raw.get("storyline"),
        180,
    )
    if not storyline:
        storyline = (
            "Direct foundational conceptual question."
            if is_easy_concept
            else scenario_context
        )

    example_context = (
        _normalize_text(
            raw.get("example_context"),
            120,
        )
        or None
    )

    efficiency_focus = (
        _normalize_text(
            raw.get("efficiency_focus"),
            140,
        )
        or None
    )

    cognitive_operation = _normalize_text(
        raw.get("cognitive_operation")
        or "diagnose and choose the best fix",
        100,
    )

    uniqueness_anchor = _normalize_text(
        raw.get("uniqueness_anchor"),
        160,
    )

    normalized = {
        "candidate_index": candidate_index,
        "pattern": _normalize_pattern(
            raw.get("pattern")
            or _infer_plan_pattern(
                raw,
                section_type=section_type,
                difficulty=difficulty,
            ),
            raw=raw,
            section_type=section_type,
            difficulty=difficulty,
        ),
        "problem_target": _normalize_text(
            raw.get("problem_target"),
            180,
        ),
        "knowledge_target": _normalize_text(
            raw.get("knowledge_target"),
            180,
        ),
        "scenario_context": scenario_context,
        "example_context": example_context,
        "efficiency_focus": efficiency_focus,
        "cognitive_operation": cognitive_operation,
        "storyline": storyline,
        "uniqueness_anchor": uniqueness_anchor,
    }

    return normalized

def _parse_plans(
    payload: object,
    *,
    diagnostics: list[str] | None = None,
    section_type: str,
    difficulty: str,
) -> list[QuestionGenerationPlan]:
    """Parse planner output, accepting object and top-level array forms."""

    if isinstance(
        payload,
        list,
    ):
        raw_plans = payload

    elif isinstance(
        payload,
        dict,
    ):
        raw_plans = payload.get(
            "plans"
        )

        if not isinstance(
            raw_plans,
            list,
        ):
            raise QuestionGenerationPlannerError(
                "Planner response did not contain a plans array."
            )

    else:
        raise QuestionGenerationPlannerError(
            "Planner response was neither a JSON object nor a JSON array."
        )

    # Some providers return array positions as 0-based candidate indexes
    # (0, 1, 2) even though Evalyn's internal contract is 1-based (1, 2, 3).
    # Detect that convention for the whole batch before validating individual
    # plans. Normalizing only candidate 0 in isolation would create duplicate
    # indexes (1, 1, 2), so shift the complete, contiguous zero-based sequence.
    explicit_indexes: list[int | None] = []
    all_items_are_objects = all(
        isinstance(item, dict)
        for item in raw_plans
    )

    if all_items_are_objects:
        for item in raw_plans:
            raw_index = item.get(
                "candidate_index",
                item.get("candidate_number"),
            )
            if raw_index is None:
                explicit_indexes.append(None)
                continue
            try:
                explicit_indexes.append(int(raw_index))
            except (TypeError, ValueError):
                explicit_indexes.append(None)

    zero_based_indexes = (
        all_items_are_objects
        and bool(raw_plans)
        and all(index is not None for index in explicit_indexes)
        and sorted(int(index) for index in explicit_indexes if index is not None)
        == list(range(len(raw_plans)))
    )

    plans: list[QuestionGenerationPlan] = []

    for raw_position, raw in enumerate(
        raw_plans,
        start=1,
    ):
        if not isinstance(
            raw,
            dict,
        ):
            if diagnostics is not None:
                diagnostics.append(
                    f"Planner item {raw_position} was not a JSON object."
                )
            continue

        raw_for_normalization = raw
        if zero_based_indexes:
            raw_for_normalization = dict(raw)
            index_key = (
                "candidate_index"
                if "candidate_index" in raw_for_normalization
                else "candidate_number"
            )
            raw_for_normalization[index_key] = (
                int(explicit_indexes[raw_position - 1]) + 1
            )

        normalized = _normalize_raw_plan(
            raw_for_normalization,
            raw_position,
            section_type=section_type,
            difficulty=difficulty,
        )

        try:
            plans.append(
                QuestionGenerationPlan.model_validate(
                    normalized
                )
            )

        except ValidationError as exc:
            candidate_index = normalized.get(
                "candidate_index",
                "unknown",
            )

            detail = "; ".join(
                " -> ".join(
                    str(part)
                    for part in error["loc"]
                )
                + f": {error['msg']}"
                for error in exc.errors()
            )

            if diagnostics is not None:
                diagnostics.append(
                    f"Candidate {candidate_index} failed plan validation: {detail}"
                )

    return plans

def _validate_plan_set(
    plans: list[QuestionGenerationPlan],
    *,
    expected_indexes: list[int],
    skill_name: str,
    manager_interpretation: ManagerPromptInterpretation | None = None,
    skill_category: str = "technical",
) -> list[QuestionGenerationPlan]:
    """Validate indexes and semantic uniqueness for planner results."""

    if not plans:
        raise QuestionGenerationPlannerError(
            "Planner returned no usable plans."
        )

    by_index: dict[
        int,
        QuestionGenerationPlan,
    ] = {}

    for plan in plans:
        if plan.candidate_index in by_index:
            raise QuestionGenerationPlannerError(
                "Planner returned duplicate candidate indexes."
            )

        by_index[
            plan.candidate_index
        ] = plan

    expected_set = set(
        expected_indexes
    )

    missing_indexes = [
        index
        for index in expected_indexes
        if index not in by_index
    ]

    unexpected_indexes = [
        index
        for index in by_index
        if index not in expected_set
    ]

    if unexpected_indexes:
        raise QuestionGenerationPlannerError(
            "Planner returned unexpected candidate indexes: "
            + ", ".join(
                str(index)
                for index in unexpected_indexes
            )
        )

    if missing_indexes:
        raise QuestionGenerationPlannerError(
            "Planner is missing candidate indexes: "
            + ", ".join(
                str(index)
                for index in missing_indexes
            )
        )

    ordered = [
        by_index[index]
        for index in expected_indexes
    ]

    incompatible = [
        plan.candidate_index
        for plan in ordered
        if not _plan_matches_manager_intent(
            plan,
            manager_interpretation,
        )
    ]

    if incompatible:
        patterns = _requested_patterns(
            manager_interpretation
        )

        pattern_detail = (
            f" Requested pattern: {patterns[0]}."
            if len(patterns) == 1
            else ""
        )

        efficiency_detail = (
            " Efficiency focus is required for every candidate."
            if _manager_requests_efficiency(
                manager_interpretation
            )
            else ""
        )

        raise QuestionGenerationPlannerError(
            "Planner returned candidate plans that do not satisfy manager intent."
            f" Incompatible candidates: {incompatible}."
            f"{pattern_detail}{efficiency_detail}"
        )

    quality_errors: dict[
        int,
        list[str],
    ] = {}

    for plan in ordered:
        errors = _technical_plan_quality_errors(
            plan,
            skill_name=skill_name,
            skill_category=skill_category,
        )

        if errors:
            quality_errors[
                plan.candidate_index
            ] = errors

    if quality_errors:
        details = "; ".join(
            f"candidate {index}: {', '.join(errors)}"
            for index, errors in quality_errors.items()
        )

        reason = (
            "role-inconsistent question plans"
            if str(skill_category or "").strip().lower() == "non_technical"
            else "technically disconnected question plans"
        )
        raise QuestionGenerationPlannerError(
            f"Planner returned {reason}. " + details
        )

    duplicate_anchors: set[str] = set()
    duplicate_targets: set[str] = set()

    for plan in ordered:
        anchor = plan.uniqueness_anchor.casefold()
        target = plan.problem_target.casefold()
        knowledge_target = plan.knowledge_target.casefold()

        if (
            anchor in duplicate_anchors
            or target in duplicate_targets
        ):
            raise QuestionGenerationPlannerError(
                "Planner returned repeated candidate targets instead of materially distinct plans."
            )

        if knowledge_target in duplicate_targets:
            raise QuestionGenerationPlannerError(
                "Planner returned repeated candidate knowledge targets instead of materially distinct plans."
            )

        duplicate_anchors.add(anchor)
        duplicate_targets.add(target)
        duplicate_targets.add(
            knowledge_target
        )

    return ordered

def _plan_uniqueness_keys(
    plans: list[QuestionGenerationPlan],
) -> tuple[
    set[str],
    set[str],
    set[str],
]:
    """Return semantic uniqueness keys used during planning."""

    anchors: set[str] = set()
    problem_targets: set[str] = set()
    knowledge_targets: set[str] = set()

    for plan in plans:
        anchors.add(
            plan.uniqueness_anchor.casefold()
        )

        problem_targets.add(
            plan.problem_target.casefold()
        )

        knowledge_targets.add(
            plan.knowledge_target.casefold()
        )

    return (
        anchors,
        problem_targets,
        knowledge_targets,
    )

def _is_semantically_distinct_from_existing(
    candidate: QuestionGenerationPlan,
    existing: list[QuestionGenerationPlan],
) -> bool:
    """Reject an obviously repeated plan during missing-plan recovery."""

    anchors, problem_targets, knowledge_targets = (
        _plan_uniqueness_keys(existing)
    )

    if (
        candidate.uniqueness_anchor.casefold()
        in anchors
    ):
        return False

    if (
        candidate.problem_target.casefold()
        in problem_targets
    ):
        return False

    if (
        candidate.knowledge_target.casefold()
        in knowledge_targets
    ):
        return False

    return True

_DETERMINISTIC_CONCEPT_TOPICS: dict[
    str,
    list[tuple[str, str]],
] = {
    "fastapi": [
        (
            "FastAPI request validation",
            "Pydantic request model validation",
        ),
        (
            "FastAPI dependency injection",
            "FastAPI dependency functions",
        ),
        (
            "FastAPI response models",
            "response_model validation and serialization",
        ),
        (
            "FastAPI path parameters",
            "path parameter type validation",
        ),
        (
            "FastAPI query parameters",
            "query parameter defaults and validation",
        ),
        (
            "FastAPI HTTP exceptions",
            "HTTPException status codes and detail",
        ),
        (
            "FastAPI async endpoints",
            "async endpoint execution and await",
        ),
        (
            "FastAPI routers",
            "APIRouter route organization",
        ),
        (
            "FastAPI middleware",
            "request middleware execution",
        ),
        (
            "FastAPI request bodies",
            "request body parsing with Pydantic",
        ),
        (
            "FastAPI status codes",
            "HTTP response status semantics",
        ),
        (
            "FastAPI dependency caching",
            "dependency use_cache behavior",
        ),
    ],
    "python": [
        (
            "Python list mutability",
            "list mutation versus reassignment",
        ),
        (
            "Python dictionary lookup",
            "dict.get versus key indexing",
        ),
        (
            "Python tuples",
            "tuple immutability",
        ),
        (
            "Python sets",
            "set uniqueness semantics",
        ),
        (
            "Python generators",
            "generator lazy evaluation",
        ),
        (
            "Python iterators",
            "iterator protocol and next",
        ),
        (
            "Python exceptions",
            "exception handling with try and except",
        ),
        (
            "Python decorators",
            "function wrapping with decorators",
        ),
        (
            "Python context managers",
            "with statement and context manager cleanup",
        ),
        (
            "Python comprehensions",
            "list comprehension evaluation",
        ),
        (
            "Python default arguments",
            "evaluation of default function arguments",
        ),
        (
            "Python scope",
            "local and global name resolution",
        ),
    ],
    "postgresql": [
        (
            "PostgreSQL primary keys",
            "primary key uniqueness and identity",
        ),
        (
            "PostgreSQL unique constraints",
            "unique constraint enforcement",
        ),
        (
            "PostgreSQL indexes",
            "index use for selective lookups",
        ),
        (
            "PostgreSQL joins",
            "inner join matching rows",
        ),
        (
            "PostgreSQL left joins",
            "left join preservation of unmatched rows",
        ),
        (
            "PostgreSQL NULL",
            "NULL comparison and three-valued logic",
        ),
        (
            "PostgreSQL GROUP BY",
            "grouping rows before aggregation",
        ),
        (
            "PostgreSQL transactions",
            "transaction commit and rollback semantics",
        ),
        (
            "PostgreSQL foreign keys",
            "referential integrity enforcement",
        ),
        (
            "PostgreSQL VACUUM",
            "VACUUM row-version cleanup",
        ),
        (
            "PostgreSQL sequences",
            "sequence value generation",
        ),
        (
            "PostgreSQL views",
            "view query abstraction",
        ),
    ],
    "docker": [
        (
            "Docker images",
            "image layers and immutable image content",
        ),
        (
            "Docker containers",
            "container lifecycle from an image",
        ),
        (
            "Docker build context",
            "build context and .dockerignore",
        ),
        (
            "Docker port mapping",
            "host-to-container port publishing",
        ),
        (
            "Docker volumes",
            "persistent named volume storage",
        ),
        (
            "Docker bind mounts",
            "host directory bind mounting",
        ),
        (
            "Docker networks",
            "container network name resolution",
        ),
        (
            "Docker healthchecks",
            "container healthcheck state",
        ),
        (
            "Docker environment variables",
            "environment variable injection",
        ),
        (
            "Docker restart policies",
            "container restart behavior",
        ),
        (
            "Dockerfile layers",
            "layer caching across Dockerfile steps",
        ),
        (
            "Docker Compose dependencies",
            "service dependency startup ordering",
        ),
    ],
    "pytorch": [
        (
            "PyTorch tensors",
            "tensor shape and dimensionality",
        ),
        (
            "PyTorch requires_grad",
            "gradient tracking with requires_grad",
        ),
        (
            "PyTorch no_grad",
            "disabling gradient tracking during inference",
        ),
        (
            "PyTorch model mode",
            "train versus eval mode behavior",
        ),
        (
            "PyTorch parameters",
            "nn.Module parameter registration",
        ),
        (
            "PyTorch DataLoader",
            "batching samples with DataLoader",
        ),
        (
            "PyTorch Dataset",
            "Dataset indexing and length",
        ),
        (
            "PyTorch loss functions",
            "loss computation from predictions and targets",
        ),
        (
            "PyTorch optimizers",
            "optimizer step and parameter updates",
        ),
        (
            "PyTorch devices",
            "moving tensors and models between CPU and GPU",
        ),
        (
            "PyTorch tensor broadcasting",
            "broadcasting compatible tensor shapes",
        ),
        (
            "PyTorch gradients",
            "backpropagation and gradient accumulation",
        ),
    ],
}

def _deterministic_easy_concept_plans(
    *,
    skill_name: str,
    count: int,
    excluded_question_texts: list[str] | None = None,
    skill_category: str = "technical",
    job_title: str | None = None,
    job_description: str | None = None,
) -> list[QuestionGenerationPlan] | None:
    """Build local easy/concept plans only when the skill-role mapping is known."""

    key = " ".join(
        str(skill_name or "").strip().casefold().split()
    )
    if str(skill_category or "").strip().lower() == "non_technical":
        normalized_title = " ".join(str(job_title or "").casefold().split())
        is_sales_role = bool(
            re.search(r"\b(?:sales|business development)\b", normalized_title)
        )
        # These deterministic topics are intentionally sales-specific. For any
        # other role, let the role-aware planner use the actual title and JD.
        topics = (
            _NON_TECHNICAL_CONCEPT_TOPICS.get(key)
            if is_sales_role
            else None
        )
    else:
        topics = _DETERMINISTIC_CONCEPT_TOPICS.get(key)

    if (
        not topics
        or count < 1
        or count > len(topics)
    ):
        return None

    excluded_blob = " ".join(
        str(item or "").casefold()
        for item in (
            excluded_question_texts
            or []
        )
    )

    selected: list[
        QuestionGenerationPlan
    ] = []

    for problem_target, knowledge_target in topics:
        if (
            problem_target.casefold()
            in excluded_blob
            or knowledge_target.casefold()
            in excluded_blob
        ):
            continue

        index = len(selected) + 1

        selected.append(
            QuestionGenerationPlan(
                candidate_index=index,
                pattern="concept",
                problem_target=problem_target,
                knowledge_target=knowledge_target,
                scenario_context=(
                    "Minimal context; direct foundational concept check."
                ),
                example_context=None,
                efficiency_focus=None,
                cognitive_operation=(
                    "identify or distinguish the core concept"
                ),
                storyline=(
                    "Direct foundational conceptual question."
                ),
                uniqueness_anchor=knowledge_target,
            )
        )

        if len(selected) == count:
            return selected

    return None

def _call_planner(
    prompt: str,
) -> object:
    """Call the configured LLM provider with constrained JSON output."""

    try:
        provider = str(
            getattr(
                settings,
                "llm_provider",
                "gemini",
            )
            or "gemini"
        ).strip().lower()

        # The planner needs valid JSON, but does not need the full application
        # schema enforced by the provider. The provider-side schema is kept
        # intentionally conservative to avoid Gemini rejecting the request
        # before generation.
        planner_response_format = {
            "type": "json_schema",
            "json_schema": {
                "schema": QUESTION_GENERATION_PLAN_SCHEMA,
            },
        }

        if provider == "gemini":
            raw_text = _call_gemini_chat(
                prompt,
                response_format=planner_response_format,
                timeout=QUESTION_PLAN_TIMEOUT_SECONDS,
                reasoning_effort="low",
                max_completion_tokens=2400,
            )

        elif provider == "groq":
            raw_text = _call_groq_chat(
                prompt,
                response_format=planner_response_format,
                timeout=QUESTION_PLAN_TIMEOUT_SECONDS,
                reasoning_effort="low",
                max_completion_tokens=2400,
            )

        else:
            raise LLMResponseError(
                f"Unsupported LLM_PROVIDER '{provider}'. "
                "Use 'gemini' or 'groq'."
            )

        return _extract_json_payload(
            raw_text
        )

    except Exception as exc:
        error_text = (
            str(exc).strip()
            or exc.__class__.__name__
        )

        if (
            "429" in error_text
            or "rate limit" in error_text.casefold()
            or "quota" in error_text.casefold()
        ):
            raise QuestionGenerationPlannerError(
                "Question planning was rate limited by the configured LLM provider. "
                "Try again after the provider quota resets."
            ) from exc

        if (
            "timed out" in error_text.casefold()
            or "timeout" in error_text.casefold()
        ):
            raise QuestionGenerationPlannerError(
                f"Question planning timed out after "
                f"{QUESTION_PLAN_TIMEOUT_SECONDS} seconds."
            ) from exc

        raise QuestionGenerationPlannerError(
            f"Question planning failed: {error_text}"
        ) from exc

def plan_question_batch(
    *,
    skill_name: str,
    section_type: str,
    difficulty: str,
    question_type: str,
    count: int,
    manager_prompt: str | None = None,
    generation_focus: str = "auto",
    manager_interpretation: (
        ManagerPromptInterpretation
        | dict[str, object]
        | None
    ) = None,
    experience_required: str | None = None,
    reference_question_text: str | None = None,
    pattern_reference_question_texts: list[str] | None = None,
    excluded_question_texts: list[str] | None = None,
    skill_category: str = "technical",
    job_title: str | None = None,
    job_description: str | None = None,
) -> list[QuestionGenerationPlan]:
    """Create one materially distinct semantic plan per candidate."""

    if (
        not isinstance(count, int)
        or count < 1
        or count > 50
    ):
        raise ValueError(
            "Question-planning count must be between 1 and 50."
        )

    normalized_intent: ManagerPromptInterpretation | None = None

    if manager_interpretation is not None:
        try:
            normalized_intent = (
                manager_interpretation
                if isinstance(
                    manager_interpretation,
                    ManagerPromptInterpretation,
                )
                else ManagerPromptInterpretation.model_validate(
                    manager_interpretation
                )
            )

        except (
            ValidationError,
            TypeError,
            ValueError,
        ) as exc:
            raise QuestionGenerationPlannerError(
                "Manager interpretation supplied to the planner was invalid."
            ) from exc

    normalized_skill_name = " ".join(
        str(skill_name).strip().split()
    )
    normalized_skill_category = (
        "non_technical"
        if str(skill_category or "").strip().lower() == "non_technical"
        else "technical"
    )
    normalized_job_title = _normalize_text(job_title, 255) or None
    normalized_job_description = _normalize_text(job_description, 3500) or None

    normalized_section_type = " ".join(
        str(section_type).strip().split()
    ).lower()

    normalized_difficulty = " ".join(
        str(difficulty).strip().split()
    ).lower()

    normalized_question_type = " ".join(
        str(question_type).strip().split()
    ).upper()

    normalized_generation_focus = " ".join(
        str(
            generation_focus
            or "auto"
        ).strip().split()
    ).lower()

    normalized_experience_required = _normalize_text(
        experience_required,
        100,
    ) or None

    valid_generation_focuses = {
        "auto",
        "concept",
        "scenario",
        "comparison",
        "code",
        "output",
        "debugging",
        "sql",
        "design",
        "applied",
    }

    if (
        normalized_generation_focus
        not in valid_generation_focuses
    ):
        raise ValueError(
            "Generation focus must be auto, concept, scenario, comparison, "
            "code, output, debugging, sql, design, or applied."
        )

    hard_pattern = _hard_pattern_for_slot(
        normalized_section_type,
        normalized_difficulty,
    )

    requested_patterns = _requested_patterns(
        normalized_intent
    )

    effective_pattern = hard_pattern

    if (
        effective_pattern is None
        and normalized_generation_focus != "auto"
    ):
        effective_pattern = normalized_generation_focus

    elif (
        effective_pattern is None
        and len(requested_patterns) == 1
    ):
        effective_pattern = requested_patterns[0]

    effective_intent = normalized_intent

    if (
        effective_pattern is not None
        and normalized_intent is not None
    ):
        effective_intent = normalized_intent.model_copy(
            update={
                "requested_patterns": [
                    effective_pattern
                ]
            }
        )

    can_use_local_concept_plans = (
        hard_pattern == "concept"
        and normalized_question_type == "MCQ"
        and not manager_prompt
    )

    if can_use_local_concept_plans:
        deterministic_plans = _deterministic_easy_concept_plans(
            skill_name=normalized_skill_name,
            count=count,
            excluded_question_texts=excluded_question_texts,
            skill_category=normalized_skill_category,
            job_title=normalized_job_title,
            job_description=normalized_job_description,
        )

        if deterministic_plans is not None:
            return _validate_plan_set(
                deterministic_plans,
                expected_indexes=list(
                    range(
                        1,
                        count + 1,
                    )
                ),
                skill_name=normalized_skill_name,
                manager_interpretation=effective_intent,
                skill_category=normalized_skill_category,
            )

    prompt = _build_planner_prompt(
        skill_name=normalized_skill_name,
        section_type=normalized_section_type,
        difficulty=normalized_difficulty,
        question_type=normalized_question_type,
        count=count,
        manager_prompt=manager_prompt,
        manager_interpretation=effective_intent,
        generation_focus=normalized_generation_focus,
        experience_required=normalized_experience_required,
        reference_question_text=reference_question_text,
        pattern_reference_question_texts=pattern_reference_question_texts,
        excluded_question_texts=excluded_question_texts,
        skill_category=normalized_skill_category,
        job_title=normalized_job_title,
        job_description=normalized_job_description,
    )

    try:
        payload = _call_planner(
            prompt
        )

        diagnostics: list[str] = []

        parsed = _parse_plans(
            payload,
            diagnostics=diagnostics,
            section_type=normalized_section_type,
            difficulty=normalized_difficulty,
        )

    except QuestionGenerationPlannerError:
        raise

    expected_indexes = list(
        range(
            1,
            count + 1,
        )
    )

    # Easy + Conceptual is immutable.
    if hard_pattern == "concept":
        repaired: list[
            QuestionGenerationPlan
        ] = []

        for plan in parsed:
            technical_target_candidates = [
                plan.knowledge_target,
                plan.problem_target,
                plan.uniqueness_anchor,
            ]

            def scenario_marker_count(
                value: str | None,
            ) -> int:
                normalized = " ".join(
                    str(
                        value
                        or ""
                    ).strip().casefold().split()
                )

                markers = (
                    "scenario",
                    "scenario-based",
                    "real-world",
                    "production",
                    "suppose a ",
                    "consider a ",
                    "a developer",
                    "an engineer",
                    "a company",
                    "a team",
                    "an application",
                    "a service",
                    "a system",
                    "incident",
                    "outage",
                    "traffic spike",
                    "under heavy load",
                    "users report",
                    "users are",
                )

                return sum(
                    1
                    for marker in markers
                    if marker in normalized
                )

            technical_target = min(
                technical_target_candidates,
                key=lambda value: (
                    scenario_marker_count(value),
                    -len(
                        str(
                            value
                            or ""
                        ).strip()
                    ),
                ),
            )

            technical_target = _normalize_text(
                technical_target,
                180,
            )

            if not technical_target:
                technical_target = _normalize_text(
                    f"{normalized_skill_name} core concept",
                    180,
                )

            repaired.append(
                plan.model_copy(
                    update={
                        "pattern": "concept",
                        "problem_target": (
                            f"Core concept: {technical_target}"
                        ),
                        "knowledge_target": technical_target,
                        "scenario_context": (
                            "Minimal context; direct foundational concept check."
                        ),
                        "example_context": None,
                        "storyline": (
                            "Direct foundational conceptual question."
                        ),
                        "cognitive_operation": (
                            "identify or distinguish the core concept"
                        ),
                    }
                )
            )

        parsed = repaired

    by_index: dict[
        int,
        QuestionGenerationPlan,
    ] = {}

    for plan in parsed:
        candidate_index = plan.candidate_index

        if candidate_index not in expected_indexes:
            raise QuestionGenerationPlannerError(
                f"Planner returned unexpected candidate index "
                f"{candidate_index}. Expected candidates: "
                f"{expected_indexes}."
            )

        if candidate_index in by_index:
            raise QuestionGenerationPlannerError(
                f"Planner returned duplicate candidate index "
                f"{candidate_index}."
            )

        by_index[candidate_index] = plan

    missing = [
        index
        for index in expected_indexes
        if index not in by_index
    ]

    if missing:
        diagnostic_text = (
            " "
            + " | ".join(
                diagnostics[:10]
            )
            if diagnostics
            else ""
        )

        raise QuestionGenerationPlannerError(
            f"Planner returned {len(by_index)} parsed plans for "
            f"{count} requested candidates. Missing candidates: "
            f"{missing}.{diagnostic_text}"
        )

    ordered = [
        by_index[index]
        for index in expected_indexes
    ]

    return _validate_plan_set(
        ordered,
        expected_indexes=expected_indexes,
        skill_name=normalized_skill_name,
        manager_interpretation=effective_intent,
        skill_category=normalized_skill_category,
    )

__all__ = [
    "QuestionGenerationPlan",
    "QuestionGenerationPlannerError",
    "plan_question_batch",
]