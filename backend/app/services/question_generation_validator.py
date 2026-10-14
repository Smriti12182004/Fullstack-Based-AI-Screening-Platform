"""Plan diverse assessment questions before asking the LLM to write them.

The planner converts manager guidance plus the hard slot context into a compact
plan for each candidate.  The generator then writes one question against one
plan.  This separation prevents a local model from satisfying "be diverse" by
only changing names, numbers, options, or superficial wording.
"""

from __future__ import annotations

import json
import re
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.services.llm_client import (
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


QUESTION_GENERATION_PLAN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "plans": {
            "type": "array",
            "minItems": 1,
            "maxItems": 50,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "candidate_index": {"type": "integer", "minimum": 1, "maximum": 50},
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
                    "problem_target": {"type": "string"},
                    "knowledge_target": {"type": "string"},
                    "scenario_context": {"type": "string"},
                    "example_context": {
                        "anyOf": [
                            {"type": "string"},
                            {"type": "null"},
                        ]
                    },
                    "efficiency_focus": {
                        "anyOf": [
                            {"type": "string"},
                            {"type": "null"},
                        ]
                    },
                    "cognitive_operation": {"type": "string"},
                    "storyline": {"type": "string"},
                    "uniqueness_anchor": {"type": "string"},
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
    "required": ["plans"],
}


def _normalize_text(value: object, max_length: int) -> str:
    return " ".join(str(value or "").strip().split())[:max_length]


def _extract_json_payload(raw_text: str) -> object:
    """Parse planner JSON, including fenced or lightly wrapped model output."""
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise QuestionGenerationPlannerError(
            "LLM returned an empty question-planning response."
        )

    cleaned = raw_text.strip()

    # Most responses are already pure JSON.
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Remove a markdown fence when the model adds one despite the prompt.
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        fenced = "\n".join(lines).strip()
        try:
            return json.loads(fenced)
        except json.JSONDecodeError:
            cleaned = fenced

    # Accept harmless leading/trailing prose by decoding the first JSON value
    # rather than assuming the response must be an object. This is important
    # because Gemini currently returns the planner batch as a top-level array.
    decoder = json.JSONDecoder()
    candidate_starts = [
        index
        for index in (cleaned.find("["), cleaned.find("{"))
        if index >= 0
    ]
    if candidate_starts:
        start = min(candidate_starts)
        try:
            value, _ = decoder.raw_decode(cleaned[start:])
            return value
        except json.JSONDecodeError:
            pass

    raise QuestionGenerationPlannerError(
        "LLM did not return valid JSON for question planning."
    )



def _serialize_intent(intent: ManagerPromptInterpretation | None) -> str:
    if intent is None:
        return "No structured manager interpretation is available."

    return json.dumps(
        intent.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _requested_patterns(intent: ManagerPromptInterpretation | None) -> list[str]:
    """Return normalized manager-requested patterns, preserving their order."""

    if intent is None:
        return []

    patterns: list[str] = []
    for pattern in intent.requested_patterns:
        normalized = str(pattern).strip().casefold()
        if normalized and normalized not in patterns:
            patterns.append(normalized)
    return patterns


def _manager_requests_efficiency(intent: ManagerPromptInterpretation | None) -> bool:
    """Return whether the manager explicitly asked for efficiency/performance focus."""

    if intent is None:
        return False

    fields = [
        *intent.must_include,
        *intent.priority_notes,
        intent.intent_summary,
        intent.normalized_manager_instruction,
    ]
    return any("efficien" in str(value).casefold() or "perform" in str(value).casefold()
               for value in fields)


_GENERIC_PLAN_TERMS = {
    "a", "an", "the", "and", "or", "for", "to", "of", "in", "on",
    "with", "from", "by", "is", "are", "be", "being", "needs", "need",
    "wants", "want", "use", "using", "users", "user", "team", "company",
    "application", "system", "project", "service", "management",
    "manage", "managing", "optimize", "optimizing", "optimization",
    "efficient", "efficiency", "performance", "improve", "improving",
    "improvement", "reduce", "reducing", "minimize", "minimizing",
    "increase", "increasing", "ensure", "ensuring", "support", "supports",
    "provide", "providing", "better", "best", "overall", "appropriate",
    "technical", "issue", "problem", "goal", "decision", "action",
    "cost", "costs", "waste", "space", "resources", "resource",
}


def _meaningful_tokens(value: str | None) -> set[str]:
    """Extract content words useful for comparing a plan's technical targets."""

    tokens = {
        token.casefold()
        for token in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", str(value or ""))
    }
    return {token.rstrip("s") for token in tokens if token not in _GENERIC_PLAN_TERMS}


def _technical_plan_quality_errors(
    plan: QuestionGenerationPlan,
    *,
    skill_name: str,
) -> list[str]:
    """Run stable, skill-level checks on planner output.

    The planner must stay technically grounded, but it does not have to repeat
    the literal skill name in every plan. Native mechanisms are often the better
    signal of the actual target (for example, PostgreSQL plans may mention MVCC,
    VACUUM, foreign-key locking, or planner statistics without repeating
    ``postgresql``). The requested skill is already a hard slot constraint and
    is supplied again to the question generator.
    """

    errors: list[str] = []
    problem_tokens = _meaningful_tokens(plan.problem_target)
    knowledge_tokens = _meaningful_tokens(plan.knowledge_target)

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

    # ``skill_name`` remains part of the validator contract so callers do not
    # need to change, but we intentionally do not require literal string
    # matching here. Skill-native terminology is inherently domain-specific and
    # should be judged by the planner prompt plus downstream question validation.
    _ = skill_name

    return errors


def _plan_matches_manager_intent(
    plan: QuestionGenerationPlan,
    intent: ManagerPromptInterpretation | None,
) -> bool:
    """Check planner outputs against manager-requested hard pattern/focus requirements."""

    patterns = _requested_patterns(intent)
    if len(patterns) == 1 and plan.pattern.casefold() != patterns[0]:
        return False

    if _manager_requests_efficiency(intent) and not (plan.efficiency_focus or "").strip():
        return False

    return True


def _pattern_instruction(intent: ManagerPromptInterpretation | None) -> str:
    """Describe the pattern contract that the planner must obey."""

    patterns = _requested_patterns(intent)
    if len(patterns) == 1:
        return (
            f'- REQUIRED PATTERN FOR EVERY CANDIDATE: {patterns[0]}. '
            'Do not switch to concept, applied, comparison, or another pattern.'
        )
    if patterns:
        return (
            "- REQUESTED PATTERNS: " + ", ".join(patterns) + ". "
            "Use only these patterns unless the manager clearly requested otherwise. "
            "Distribute them sensibly across the batch."
        )
    return "- No explicit pattern was requested; choose a suitable pattern consistent with the slot."


def _efficiency_instruction(intent: ManagerPromptInterpretation | None) -> str:
    """Describe the manager's efficiency requirement for planner generation."""

    if _manager_requests_efficiency(intent):
        return (
            '- EFFICIENCY REQUIREMENT: every candidate must include a concrete efficiency/performance '
            'decision, bottleneck, trade-off, or optimization action in efficiency_focus. '
            'Do not merely mention the word efficient.'
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
    reference_question_text: str | None,
    pattern_reference_question_texts: list[str] | None,
    excluded_question_texts: list[str] | None,
) -> str:
    existing = []
    for item in excluded_question_texts or []:
        cleaned = _normalize_text(item, 320)
        if cleaned:
            existing.append(cleaned)
        if len(existing) >= QUESTION_PLAN_MAX_EXISTING_QUESTIONS:
            break

    references = []
    for item in pattern_reference_question_texts or []:
        cleaned = _normalize_text(item, 320)
        if cleaned and cleaned.lower() not in {ref.lower() for ref in references}:
            references.append(cleaned)
        if len(references) >= QUESTION_PLAN_MAX_REFERENCE_QUESTIONS:
            break

    example_lines = "\n".join(f"- {item}" for item in references) or "- none"
    excluded_lines = "\n".join(f"- {item}" for item in existing) or "- none"
    current_reference = _normalize_text(reference_question_text, 360) or "none"
    manager_message = _normalize_text(manager_prompt, 1200) or "none"

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

CURRENT QUESTION, if any (reference only):
{current_reference}

RECENT PATTERN EXAMPLES (style/pattern only):
{example_lines}

EXISTING QUESTIONS TO AVOID:
{excluded_lines}

PLANNING RULES:
1. Produce one plan per candidate. Candidate 1 through candidate {count} must be materially different.
2. "Different" means a different underlying technical problem/task/knowledge target, mechanism, or failure mode. Changing only names, numbers, options, APIs, actors, or wording does NOT count.
3. Keep every plan inside the same confirmed skill, section, difficulty and response format.
4. Treat the manager's structured intent as an authoring requirement, not a suggestion.
{_pattern_instruction(manager_interpretation)}
5. For technical skills, the TECHNICAL TASK comes first and the story comes second. The problem_target and knowledge_target must name an actual skill-native mechanism, command, configuration, lifecycle behavior, failure mode, data operation, or design choice. Do NOT turn the manager's business example into the technical problem itself.
6. The problem_target and knowledge_target must describe the same concrete technical area. Bad example: "optimize storage space" -> "Docker container management". Good example: "reduce Docker build context size" -> "Docker build context and .dockerignore".
7. Use established, straightforward mechanisms appropriate to the confirmed skill. Do not invent obscure algorithms, fake APIs, unsupported tools, or unnecessary implementation details. For easy questions, prefer a familiar mechanism that can yield one clear best answer.
8. Manager examples such as fruits, vegetables, stores, teams, etc. are contextual story material unless explicitly made mandatory technical content. Use them naturally in a realistic domain setting. For example, a fruit-and-vegetable store can be the business using Docker; do not invent a farmer who somehow manages containers unless that is natural to the scenario.
9. For a scenario request, create a concrete short situation with a real constraint, decision, symptom, or goal. The technical skill must matter to the decision; the scenario must not be decorative filler.
{_efficiency_instruction(manager_interpretation)}
10. When efficiency/performance is requested, make it a technical bottleneck or decision tied to the planned mechanism: image size/build time, CPU or memory usage, query cost, latency, throughput, I/O, network traffic, cache reuse, etc. Do not merely write "efficient" or "reduce costs".
11. Use manager dissatisfaction/frustration only as feedback about quality. Prefer clearer, more interesting, more varied plans; never change hard constraints because of sentiment.
12. Preserve requested difficulty. For easy questions, use one clear concept and straightforward reasoning. Do not create multi-layered puzzles or ask for obscure facts.
13. Do not copy any existing question's underlying target, scenario, or storyline.
14. Do not invent unrelated candidate backgrounds, job histories, or qualifications in uniqueness_anchor. The anchor must describe the technical difference between this plan and the others.
15. Keep each field concise so a configured LLM can execute the later generation reliably.
16. Before output, silently check: (a) the plan explicitly belongs to {skill_name}; (b) problem_target and knowledge_target are technically connected; (c) scenario_context supports that technical target; (d) efficiency_focus affects the real technical decision when requested; and (e) the plan could become one clear question with a single defensible answer.

OUTPUT ONLY JSON. No markdown. No explanations.
""".strip()


def _infer_plan_pattern(raw: dict) -> QuestionPattern:
    """Infer a safe pattern when the model omits the explicit pattern field."""
    text = " ".join(
        str(raw.get(key) or "").strip().casefold()
        for key in ("problem_target", "knowledge_target", "scenario_context")
    )

    if any(token in text for token in (
        "debug", "diagnos", "root cause", "failure", "error", "exception",
        "outage", "lock contention", "timeout", "oom",
    )):
        return "debugging"

    return "scenario"


def _normalize_pattern(value: object) -> QuestionPattern:
    """Normalize common LLM pattern aliases into the planner contract."""

    normalized = " ".join(str(value or "").strip().casefold().split())
    aliases = {
        "debug": "debugging",
        "diagnostic": "debugging",
        "troubleshooting": "debugging",
        "practical": "applied",
        "implementation": "applied",
        "application": "applied",
        "scenario-based": "scenario",
        "scenario based": "scenario",
        "sql/debugging": "sql",
    }
    normalized = aliases.get(normalized, normalized)

    allowed = {
        "concept", "scenario", "comparison", "code", "output",
        "debugging", "sql", "design", "applied",
    }
    if normalized in allowed:
        return normalized  # type: ignore[return-value]

    return "scenario"


def _normalize_raw_plan(raw: dict, position: int) -> dict:
    """Normalize the compact planner format into the internal plan contract."""
    try:
        candidate_index = int(raw.get("candidate_index", raw.get("candidate_id", position)))
    except (TypeError, ValueError):
        candidate_index = position

    scenario_context = _normalize_text(raw.get("scenario_context"), 180)
    storyline = _normalize_text(raw.get("storyline") or scenario_context, 180)
    example_context = _normalize_text(raw.get("example_context"), 120) or None
    efficiency_focus = _normalize_text(raw.get("efficiency_focus"), 140) or None
    cognitive_operation = _normalize_text(
        raw.get("cognitive_operation") or "diagnose and choose the best fix",
        100,
    )
    uniqueness_anchor = _normalize_text(raw.get("uniqueness_anchor"), 160)

    normalized = {
        "candidate_index": candidate_index,
        "pattern": _normalize_pattern(raw.get("pattern") or _infer_plan_pattern(raw)),
        "problem_target": _normalize_text(raw.get("problem_target"), 180),
        "knowledge_target": _normalize_text(raw.get("knowledge_target"), 180),
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
) -> list[QuestionGenerationPlan]:
    """Parse the planner output, accepting both object and compact list forms."""

    if isinstance(payload, list):
        raw_plans = payload
    elif isinstance(payload, dict):
        raw_plans = payload.get("plans")
        if not isinstance(raw_plans, list):
            raise QuestionGenerationPlannerError(
                "Planner response did not contain a plans array."
            )
    else:
        raise QuestionGenerationPlannerError(
            "Planner response was neither a JSON object nor a JSON array."
        )

    plans: list[QuestionGenerationPlan] = []
    for raw_position, raw in enumerate(raw_plans, start=1):
        if not isinstance(raw, dict):
            if diagnostics is not None:
                diagnostics.append(
                    f"Planner item {raw_position} was not a JSON object."
                )
            continue

        normalized = _normalize_raw_plan(raw, raw_position)

        try:
            plans.append(QuestionGenerationPlan.model_validate(normalized))
        except ValidationError as exc:
            candidate_index = normalized.get("candidate_index", "unknown")
            detail = "; ".join(
                " -> ".join(str(part) for part in error["loc"])
                + f": {error["msg"]}"
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
    """Validate indexes and semantic uniqueness for a set of planner results."""

    if not plans:
        raise QuestionGenerationPlannerError("Planner returned no usable plans.")

    by_index: dict[int, QuestionGenerationPlan] = {}
    for plan in plans:
        if plan.candidate_index in by_index:
            raise QuestionGenerationPlannerError(
                "Planner returned duplicate candidate indexes."
            )
        by_index[plan.candidate_index] = plan

    missing_indexes = [index for index in expected_indexes if index not in by_index]
    unexpected_indexes = [
        index for index in by_index
        if index not in set(expected_indexes)
    ]
    if unexpected_indexes:
        raise QuestionGenerationPlannerError(
            "Planner returned unexpected candidate indexes: "
            + ", ".join(str(index) for index in unexpected_indexes)
        )
    if missing_indexes:
        raise QuestionGenerationPlannerError(
            "Planner is missing candidate indexes: "
            + ", ".join(str(index) for index in missing_indexes)
        )

    ordered = [by_index[index] for index in expected_indexes]

    incompatible = [
        plan.candidate_index
        for plan in ordered
        if not _plan_matches_manager_intent(plan, manager_interpretation)
    ]
    if incompatible:
        patterns = _requested_patterns(manager_interpretation)
        pattern_detail = f" Requested pattern: {patterns[0]}." if len(patterns) == 1 else ""
        efficiency_detail = (
            " Efficiency focus is required for every candidate."
            if _manager_requests_efficiency(manager_interpretation)
            else ""
        )
        raise QuestionGenerationPlannerError(
            "Planner returned candidate plans that do not satisfy manager intent."
            f" Incompatible candidates: {incompatible}."
            f"{pattern_detail}{efficiency_detail}"
        )

    quality_errors: dict[int, list[str]] = {}
    for plan in ordered:
        errors = _technical_plan_quality_errors(plan, skill_name=skill_name)
        if errors:
            quality_errors[plan.candidate_index] = errors
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

        if anchor in duplicate_anchors or target in duplicate_targets:
            raise QuestionGenerationPlannerError(
                "Planner returned repeated candidate targets instead of materially distinct plans."
            )

        # A model can sometimes vary the problem wording while keeping the exact
        # knowledge target. Treat that as repetition during planning as well.
        if knowledge_target in duplicate_targets:
            raise QuestionGenerationPlannerError(
                "Planner returned repeated candidate knowledge targets instead of materially distinct plans."
            )

        duplicate_anchors.add(anchor)
        duplicate_targets.add(target)
        duplicate_targets.add(knowledge_target)

    return ordered


def _plan_uniqueness_keys(
    plans: list[QuestionGenerationPlan],
) -> tuple[set[str], set[str], set[str]]:
    """Return semantic uniqueness keys used when filling missing plans."""

    anchors: set[str] = set()
    problem_targets: set[str] = set()
    knowledge_targets: set[str] = set()
    for plan in plans:
        anchors.add(plan.uniqueness_anchor.casefold())
        problem_targets.add(plan.problem_target.casefold())
        knowledge_targets.add(plan.knowledge_target.casefold())
    return anchors, problem_targets, knowledge_targets


def _is_semantically_distinct_from_existing(
    candidate: QuestionGenerationPlan,
    existing: list[QuestionGenerationPlan],
) -> bool:
    """Reject an obviously repeated plan during missing-plan recovery."""

    anchors, problem_targets, knowledge_targets = _plan_uniqueness_keys(existing)
    if candidate.uniqueness_anchor.casefold() in anchors:
        return False
    if candidate.problem_target.casefold() in problem_targets:
        return False
    if candidate.knowledge_target.casefold() in knowledge_targets:
        return False
    return True


def _call_planner(
    prompt: str,
) -> object:
    """Call the shared Gemini client with the planner's structured JSON schema."""
    try:
        # The planner is an internal reasoning step, so server-side structured
        # output is intentionally avoided here. Gemini's Interactions API has a
        # restricted JSON-schema dialect; local Pydantic validation below gives
        # us the same contract without making the planner request fragile.
        raw_text = _call_groq_chat(
            prompt,
            timeout=QUESTION_PLAN_TIMEOUT_SECONDS,
            reasoning_effort="low",
            max_completion_tokens=2400,
        )
        return _extract_json_payload(raw_text)
    except Exception as exc:
        error_text = str(exc).strip() or exc.__class__.__name__
        if "429" in error_text or "rate limit" in error_text.casefold() or "quota" in error_text.casefold():
            raise QuestionGenerationPlannerError(
                "Question planning was rate limited by the configured LLM provider. "
                "Try again after the provider quota resets."
            ) from exc
        if "timed out" in error_text.casefold() or "timeout" in error_text.casefold():
            raise QuestionGenerationPlannerError(
                f"Question planning timed out after {QUESTION_PLAN_TIMEOUT_SECONDS} seconds."
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
    manager_interpretation: ManagerPromptInterpretation | dict[str, object] | None = None,
    reference_question_text: str | None = None,
    pattern_reference_question_texts: list[str] | None = None,
    excluded_question_texts: list[str] | None = None,
) -> list[QuestionGenerationPlan]:
    """Create one materially distinct semantic plan per requested candidate.

    Planning is intentionally one-shot. Recovery calls were removed because they
    added latency and introduced a second response contract without improving the
    underlying authoring quality. The single planner response is normalized,
    validated, and either accepted as a complete batch or rejected clearly.
    """

    if not isinstance(count, int) or count < 1 or count > 50:
        raise ValueError("Question-planning count must be between 1 and 50.")

    normalized_intent: ManagerPromptInterpretation | None = None
    if manager_interpretation is not None:
        try:
            normalized_intent = (
                manager_interpretation
                if isinstance(manager_interpretation, ManagerPromptInterpretation)
                else ManagerPromptInterpretation.model_validate(manager_interpretation)
            )
        except (ValidationError, TypeError, ValueError) as exc:
            raise QuestionGenerationPlannerError(
                "Manager interpretation supplied to the planner was invalid."
            ) from exc

    normalized_skill_name = " ".join(str(skill_name).strip().split())
    normalized_section_type = " ".join(str(section_type).strip().split()).lower()
    normalized_difficulty = " ".join(str(difficulty).strip().split()).lower()
    normalized_question_type = " ".join(str(question_type).strip().split()).upper()

    prompt = _build_planner_prompt(
        skill_name=normalized_skill_name,
        section_type=normalized_section_type,
        difficulty=normalized_difficulty,
        question_type=normalized_question_type,
        count=count,
        manager_prompt=manager_prompt,
        manager_interpretation=normalized_intent,
        reference_question_text=reference_question_text,
        pattern_reference_question_texts=pattern_reference_question_texts,
        excluded_question_texts=excluded_question_texts,
    )

    try:
        payload = _call_planner(prompt)
        diagnostics: list[str] = []
        parsed = _parse_plans(payload, diagnostics=diagnostics)
    except QuestionGenerationPlannerError:
        raise

    expected_indexes = list(range(1, count + 1))
    by_index: dict[int, QuestionGenerationPlan] = {}

    for plan in parsed:
        candidate_index = plan.candidate_index
        if candidate_index not in expected_indexes:
            raise QuestionGenerationPlannerError(
                f"Planner returned unexpected candidate index {candidate_index}. "
                f"Expected candidates: {expected_indexes}."
            )
        if candidate_index in by_index:
            raise QuestionGenerationPlannerError(
                f"Planner returned duplicate candidate index {candidate_index}."
            )
        by_index[candidate_index] = plan

    missing = [index for index in expected_indexes if index not in by_index]
    if missing:
        diagnostic_text = (
            " " + " | ".join(diagnostics[:10])
            if diagnostics
            else ""
        )
        raise QuestionGenerationPlannerError(
            f"Planner returned {len(by_index)} parsed plans for {count} requested candidates. "
            f"Missing candidates: {missing}.{diagnostic_text}"
        )

    ordered = [by_index[index] for index in expected_indexes]

    # efficiency_focus is a hard generation constraint only when the manager
    # explicitly requested efficiency/performance. A local model may otherwise
    # invent an efficiency focus for a performance-related technical topic;
    # treating that invented field as mandatory makes valid candidates fail.
    if not _manager_requests_efficiency(normalized_intent):
        ordered = [
            plan.model_copy(update={"efficiency_focus": None})
            if plan.efficiency_focus
            else plan
            for plan in ordered
        ]

    return _validate_plan_set(
        ordered,
        expected_indexes=expected_indexes,
        skill_name=normalized_skill_name,
        manager_interpretation=normalized_intent,
    )


__all__ = [
    "QuestionGenerationPlan",
    "QuestionGenerationPlannerError",
    "plan_question_batch",
]
