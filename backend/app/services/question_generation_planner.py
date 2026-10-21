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
) -> str:
    """Return planner calibration guidance derived from the JD experience requirement.

    Experience is deliberately treated as a sophistication signal, not as a
    replacement for section type, difficulty, question type, skill, or manager
    requirements.
    """

    raw = " ".join(
        str(experience_required or "").strip().casefold().split()
    )

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

    if any(
        marker in raw
        for marker in (
            "fresher",
            "fresh graduate",
            "entry level",
            "entry-level",
            "graduate",
            "0 year",
            "0 years",
            "zero year",
            "zero years",
        )
    ):
        level = "foundational-entry"
        guidance = """
- Assume an early-career candidate with limited professional exposure.
- Prefer foundational mechanisms, familiar APIs/commands, straightforward implementation,
  and one-step debugging or reasoning.
- Avoid architecture-heavy decisions, obscure edge cases, deep production trade-offs,
  and highly specialized operational knowledge.
""".strip()
    else:
        range_match = re.search(
            r"(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)",
            raw,
        )

        plus_match = re.search(
            r"(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)",
            raw,
        )

        single_match = re.search(
            r"(\d+(?:\.\d+)?)\s*(?:years?|yrs?)",
            raw,
        )

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
            guidance = """
- Do not invent a precise seniority level from ambiguous wording.
- Preserve the slot's difficulty and use normal professional reasoning.
""".strip()
        elif minimum_years < 1:
            level = "foundational-entry"
            guidance = """
- Prefer foundational concepts and familiar mechanisms.
- Favor direct implementation, simple application, and one-step debugging.
- Avoid deep architecture, obscure edge cases, and advanced production trade-offs.
""".strip()
        elif minimum_years < 2:
            level = "early-career"
            guidance = """
- Use common implementation tasks, routine debugging, familiar APIs, and modest reasoning.
- Expect some practical coding familiarity but avoid deep architecture and highly specialized
  production trade-offs.
""".strip()
        elif minimum_years < 4:
            level = "mid-level"
            guidance = """
- Favor practical implementation, common debugging, realistic constraints, and moderate
  reasoning about trade-offs.
- Production-style situations are appropriate when they still match the requested difficulty.
- Avoid assuming ownership of complex architecture unless the section and difficulty require it.
""".strip()
        elif minimum_years < 6:
            level = "experienced"
            guidance = """
- Expect solid practical experience with the skill.
- Favor deeper troubleshooting, performance/reliability implications, realistic constraints,
  and meaningful implementation trade-offs where compatible with the requested difficulty.
- Do not turn a Medium slot into an architecture interview; sophistication must remain bounded
  by the slot difficulty.
""".strip()
        else:
            level = "senior"
            guidance = """
- Expect strong professional experience with the skill.
- Complex production situations, deeper failure analysis, performance/reliability trade-offs,
  and architecture-aware reasoning are appropriate when compatible with the requested section
  and difficulty.
- Avoid obscure trivia; seniority should increase depth and judgment, not randomness.
""".strip()

    original_requirement = _normalize_text(
        experience_required,
        100,
    ) or "not specified"

    return f"""
EXPERIENCE REQUIREMENT — JD
- Original requirement: {original_requirement}
- Derived experience band: {level}

EXPERIENCE CALIBRATION
{guidance}

IMPORTANT:
- Experience calibration controls sophistication, professional judgment, and expected depth.
- It MUST NOT override the confirmed skill, section type, difficulty, question type,
  manager request, generation pattern, or other hard assessment constraints.
- Experience should change how deeply a candidate reasons about the skill, not replace the skill.
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


def _technical_plan_quality_errors(
    plan: QuestionGenerationPlan,
    *,
    skill_name: str,
) -> list[str]:
    """Run stable skill-level checks on planner output."""

    errors: list[str] = []

    problem_tokens = _meaningful_tokens(
        plan.problem_target
    )

    knowledge_tokens = _meaningful_tokens(
        plan.knowledge_target
    )

    if len(problem_tokens) < 2:
        errors.append(
            "Planner produced an under-specified problem target. "
            "Describe a concrete technical problem or mechanism rather than a generic goal."
        )

    if len(knowledge_tokens) < 2:
        errors.append(
            "Planner produced an under-specified knowledge target. "
            "Name the concrete technical mechanism or concept being tested."
        )

    # The confirmed skill remains a hard generation constraint and is supplied
    # directly to the generation model. Literal string matching is intentionally
    # not required because native skill terminology may be more appropriate.
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

    experience_guidance = _experience_level_guidance(
        experience_required
    )

    return f"""
You are Evalyn's assessment question planner.

Create exactly {count} DISTINCT question plans for later question writing.

HARD SLOT CONSTRAINTS — never override:

- Skill: {skill_name}
- Section type: {section_type}
- Difficulty: {difficulty}
- Question type: {question_type}

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

1. Produce one plan per candidate. Candidate 1 through candidate {count} must be materially different.

2. "Different" means a different underlying technical problem/task/knowledge target,
   mechanism, or failure mode. Changing only names, numbers, options, APIs, actors,
   or wording does NOT count.

3. Keep every plan inside the same confirmed skill, section, difficulty and response format.

4. Treat the manager's structured intent as an authoring requirement, not a suggestion.

{_pattern_instruction(
    manager_interpretation,
    section_type=section_type,
    difficulty=difficulty,
    generation_focus=generation_focus,
)}

5. For technical skills, the TECHNICAL TASK comes first and the story comes second.
   The problem_target and knowledge_target must name an actual skill-native mechanism,
   command, configuration, lifecycle behavior, failure mode, data operation,
   or design choice. Do NOT turn the manager's business example into the technical
   problem itself.

6. The problem_target and knowledge_target must describe the same concrete technical area.

   Bad example:
   "optimize storage space" -> "Docker container management"

   Good example:
   "reduce Docker build context size" -> "Docker build context and .dockerignore"

7. Use established, straightforward mechanisms appropriate to the confirmed skill.
   Do not invent obscure algorithms, fake APIs, unsupported tools, or unnecessary
   implementation details. For easy questions, prefer a familiar mechanism that
   can yield one clear best answer.

8. Manager examples such as fruits, vegetables, stores, teams, etc. are contextual
   story material unless explicitly made mandatory technical content. Use them naturally
   in a realistic domain setting. For example, a fruit-and-vegetable store can be the
   business using Docker; do not invent a farmer who somehow manages containers unless
   that is natural to the scenario.

9. For a scenario request, create a concrete short situation with a real constraint,
   decision, symptom, or goal. The technical skill must matter to the decision;
   the scenario must not be decorative filler.

{_efficiency_instruction(manager_interpretation)}

10. When efficiency/performance is requested, make it a technical bottleneck or decision
    tied to the planned mechanism: image size/build time, CPU or memory usage, query cost,
    latency, throughput, I/O, network traffic, cache reuse, etc. Do not merely write
    "efficient" or "reduce costs".

11. Use manager dissatisfaction/frustration only as feedback about quality. Prefer clearer,
    more interesting, more varied plans; never change hard constraints because of sentiment.

12. Preserve requested difficulty. Experience calibration may raise or lower the sophistication
    of the scenario, reasoning depth, troubleshooting depth, or professional judgment within
    that difficulty, but it MUST NOT change the requested difficulty itself.

13. Apply the JD experience requirement as a sophistication signal:
    - Fresher/0 years: foundational mechanisms, familiar APIs/commands, straightforward
      implementation, and simple reasoning.
    - 1–2 years: routine implementation, common debugging, familiar APIs, modest reasoning.
    - 2–4 years: practical production-style problems, realistic constraints, and moderate
      trade-offs where compatible with the slot.
    - 4–6 years: deeper troubleshooting, reliability/performance implications, and meaningful
      implementation trade-offs where compatible with the slot.
    - 6+ years: deeper production situations, failure analysis, performance/reliability trade-offs,
      and architecture-aware reasoning where compatible with the slot.
    Never invent advanced architecture merely because the JD asks for more experience.

14. Do not copy any existing question's underlying target, scenario, or storyline.

15. Do not invent unrelated candidate backgrounds, job histories, or qualifications in
    uniqueness_anchor. The anchor must describe the technical difference between this plan
    and the others.

16. Keep each field concise so a configured LLM can execute the later generation reliably.

17. Before output, silently check:

    (a) the plan explicitly belongs to {skill_name};

    (b) problem_target and knowledge_target are technically connected;

    (c) scenario_context supports that technical target;

    (d) efficiency_focus affects the real technical decision when requested;

    (e) the experience level is reflected through sophistication rather than topic drift;

    (f) the plan could become one clear question with a single defensible answer.

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

        normalized = _normalize_raw_plan(
            raw,
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

        raise QuestionGenerationPlannerError(
            "Planner returned technically disconnected question plans. "
            + details
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
) -> list[QuestionGenerationPlan] | None:
    """Build local plans for common Easy/Conceptual slots."""

    key = " ".join(
        str(
            skill_name
            or ""
        ).strip().casefold().split()
    )

    topics = _DETERMINISTIC_CONCEPT_TOPICS.get(
        key
    )

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
    )


__all__ = [
    "QuestionGenerationPlan",
    "QuestionGenerationPlannerError",
    "plan_question_batch",
]