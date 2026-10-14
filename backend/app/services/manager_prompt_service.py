"""Manager-prompt understanding for Evalyn assessment authoring.

This module intentionally sits in front of question generation. It converts
natural-language manager guidance into structured authoring intent while
leaving all hard assessment constraints under backend control.

The interpreter is deliberately independent from the existing question
-generation pipeline in the first rollout so it can be tested without changing
existing generation behaviour.
"""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from typing import Literal

from google import genai
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings


MANAGER_PROMPT_MAX_LENGTH = 1200
MANAGER_PROMPT_INTERPRETER_TIMEOUT_SECONDS = 120
MANAGER_PROMPT_INTERPRETER_MAX_ATTEMPTS = 2


class ManagerPromptServiceError(Exception):
    """Base exception for manager-prompt interpretation failures."""


class ManagerPromptInterpreterConnectionError(ManagerPromptServiceError):
    """Raised when Gemini cannot be reached for intent interpretation."""


class ManagerPromptInterpreterResponseError(ManagerPromptServiceError):
    """Raised when the manager-intent response is invalid or unusable."""


IntentSentiment = Literal[
    "neutral",
    "positive",
    "satisfied",
    "dissatisfied",
    "frustrated",
    "urgent",
    "mixed",
]

QuestionPattern = Literal[
    "concept",
    "scenario",
    "comparison",
    "code",
    "output",
    "debugging",
    "sql",
    "design",
    "applied",
]

DifficultyLevel = Literal[
    "easy",
    "medium",
    "hard",
    "auto",
]

ExampleRole = Literal[
    "primary",
    "secondary",
    "supporting",
    "context",
]

class ManagerExample(BaseModel):
    """Concrete examples or contexts mentioned by the manager."""

    text: str = Field(min_length=1, max_length=120)
    role: ExampleRole = "supporting"


class ManagerSentiment(BaseModel):
    """A bounded interpretation of how the manager feels about prior output."""

    label: IntentSentiment = "neutral"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: str | None = Field(default=None, max_length=240)


class ManagerCandidateMix(BaseModel):
    """Requested pattern mix for a generated batch."""

    pattern: QuestionPattern
    count: int | None = Field(default=None, ge=1, le=50)
    share: float | None = Field(default=None, ge=0.0, le=1.0)


class ManagerPromptInterpretation(BaseModel):
    """Structured intent extracted from one natural-language manager prompt."""

    intent_summary: str = Field(min_length=1, max_length=500)
    sentiment: ManagerSentiment = Field(default_factory=ManagerSentiment)

    requested_patterns: list[QuestionPattern] = Field(default_factory=list)
    candidate_mix: list[ManagerCandidateMix] = Field(default_factory=list)
    requested_difficulty: DifficultyLevel = "auto"

    must_include: list[str] = Field(default_factory=list, max_length=20)
    preferred_examples: list[ManagerExample] = Field(default_factory=list, max_length=12)
    avoid: list[str] = Field(default_factory=list, max_length=20)

    diversity_level: Literal["low", "medium", "high"] = "medium"
    distinct_problem_statements: bool = True
    vary_scenario_contexts: bool = True

    requested_length: Literal["short", "medium", "long", "auto"] = "auto"
    requested_response_depth: Literal["direct", "reasoning", "step_by_step", "auto"] = "auto"

    priority_notes: list[str] = Field(default_factory=list, max_length=12)
    normalized_manager_instruction: str = Field(min_length=1, max_length=1200)


MANAGER_PROMPT_INTERPRETATION_SCHEMA = {
    "type": "object",
    "properties": {
        "intent_summary": {"type": "string"},
        "sentiment": {
            "type": "object",
            "properties": {
                "label": {
                    "type": "string",
                    "enum": [
                        "neutral",
                        "positive",
                        "satisfied",
                        "dissatisfied",
                        "frustrated",
                        "urgent",
                        "mixed",
                    ],
                },
                "confidence": {"type": "number"},
                "evidence": {"type": ["string", "null"]},
            },
            "required": ["label", "confidence", "evidence"],
        },
        "requested_patterns": {
            "type": "array",
            "items": {
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
        },
        "candidate_mix": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
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
                    "count": {"type": ["integer", "null"]},
                    "share": {"type": ["number", "null"]},
                },
                "required": ["pattern", "count", "share"],
            },
        },
        "requested_difficulty": {
            "type": "string",
            "enum": ["easy", "medium", "hard", "auto"],
        },
        "must_include": {"type": "array", "items": {"type": "string"}},
        "preferred_examples": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "role": {
                        "type": "string",
                        "enum": [
                            "primary",
                            "secondary",
                            "supporting",
                            "context",
                        ],
                    },
                },
                "required": ["text", "role"],
            },
        },
        "avoid": {"type": "array", "items": {"type": "string"}},
        "diversity_level": {
            "type": "string",
            "enum": ["low", "medium", "high"],
        },
        "distinct_problem_statements": {"type": "boolean"},
        "vary_scenario_contexts": {"type": "boolean"},
        "requested_length": {
            "type": "string",
            "enum": ["short", "medium", "long", "auto"],
        },
        "requested_response_depth": {
            "type": "string",
            "enum": ["direct", "reasoning", "step_by_step", "auto"],
        },
        "priority_notes": {"type": "array", "items": {"type": "string"}},
        "normalized_manager_instruction": {"type": "string"},
    },
    "required": [
        "intent_summary",
        "sentiment",
        "requested_patterns",
        "candidate_mix",
        "requested_difficulty",
        "must_include",
        "preferred_examples",
        "avoid",
        "diversity_level",
        "distinct_problem_statements",
        "vary_scenario_contexts",
        "requested_length",
        "requested_response_depth",
        "priority_notes",
        "normalized_manager_instruction",
    ],
}


def _normalize_manager_prompt(manager_prompt: str) -> str:
    """Normalize whitespace while preserving the manager's wording/content."""

    normalized = " ".join(str(manager_prompt or "").strip().split())

    if not normalized:
        raise ValueError("Manager generation guidance cannot be empty.")

    if len(normalized) > MANAGER_PROMPT_MAX_LENGTH:
        raise ValueError(
            "Manager generation guidance must be 1200 characters or fewer."
        )

    return normalized


def _build_interpreter_prompt(
    manager_prompt: str,
    *,
    slot_difficulty: DifficultyLevel = "auto",
    section_type: str = "unknown",
    question_type: str = "unknown",
    batch_count: int | None = None,
) -> str:
    """Build a semantic interpretation prompt for the local Ollama model."""

    batch_context = (
        str(batch_count) if batch_count is not None else "unknown"
    )

    return f"""
You are Evalyn's manager-instruction interpreter.

Your job is NOT to generate questions.
Your job is to understand what a human assessment manager means when they write
natural-language guidance for question generation.

Treat the manager as a human communicating imperfectly. Typos, missing words,
short phrases, repeated phrases, informal wording, emotional language, and
mixed instructions are normal. Infer the intended meaning from context instead
of requiring exact keywords.

You must distinguish:
1. HARD PRODUCT CONSTRAINTS already supplied by the system.
2. Explicit requests from the manager.
3. Strong preferences.
4. Soft preferences or examples.
5. Things the manager wants avoided.
6. Concrete examples/contexts the manager mentioned.
7. Signals that the manager is unhappy, satisfied, frustrated, or asking for
   a change because the previous result was poor.

Current hard authoring context:
- Slot difficulty: {slot_difficulty}
- Section type: {section_type}
- Question type: {question_type}
- Requested batch size: {batch_context}

IMPORTANT INTERPRETATION RULES
- Never treat a manager example as a hard technical constraint unless the
  wording clearly makes it a requirement.
- If the manager says "use fruits and vegetables as examples", preserve both
  as concrete examples rather than silently dropping one.
- If the manager says "maybe use fruits and vegetables", treat them as useful
  suggestions, not mandatory content.
- If the manager says "food as an example, fruit as a secondary example",
  record the roles separately.
- If the manager says "do not make every question about food", mark repeated
  use of the example as something to avoid and require scenario diversity.
- If the manager says "the last questions were all the same", interpret this
  as dissatisfaction with semantic repetition, not merely wording repetition.
- A different option set does NOT count as a different problem statement.
- A different number, variable name, entity name, or option order does NOT
  count as meaningful diversity when the underlying task is unchanged.
- "Short realistic scenario" means the desired story should be easy to follow,
  concrete, concise, and understandable before the technical question begins.
- When the manager asks for "interesting" or "story-like" questions, preserve
  a simple human-readable storyline without adding irrelevant narrative.
- When the manager asks for efficiency, performance, practical reasoning,
  troubleshooting, comparison, or similar emphasis, capture that explicitly.
- Infer requested difficulty when the manager clearly asks for easy, medium,
  hard, beginner-friendly, challenging, tricky-but-fair, etc. Do not override
  the supplied hard slot difficulty; only record what the manager requested.
- If the manager asks for mixed patterns in one batch, represent the mix.
- If the wording is ambiguous, choose the most conservative reasonable
  interpretation and explain the interpretation in intent_summary/priority_notes.
- Never invent a requirement the manager did not communicate.

EMOTION/SENTIMENT
Interpret emotional language only to understand how the manager wants the
next generation to change. Do not diagnose mental health or personality.
Examples:
- "these are all the same", "stop doing this" -> dissatisfied/frustrated
- "great, keep this style" -> satisfied/positive
- "please fix", "this isn't what I asked" -> dissatisfied
- "urgent", "I need this now" -> urgent
Emotion changes authoring priorities; it never changes hard slot constraints.

NATURAL-LANGUAGE EXAMPLE
Manager:
"use a short realistic scenario, maybe fruits and vegetables, but don't keep
making all of them food truck questions. also work on efficiency. the last ones
were boring and basically the same."
Interpretation should capture:
- scenario/application style
- fruits and vegetables as examples/suggested contexts
- avoid repeated food-truck scenarios
- efficiency as an emphasis
- dissatisfaction with semantic repetition
- high diversity
- easy-to-understand storyline

Return ONLY valid JSON matching the required structure.

MANAGER MESSAGE:
---
{manager_prompt}
---
""".strip()


def _extract_response_payload(response: object) -> object:
    """Extract JSON text returned by Gemini's Interactions API."""

    raw_text = getattr(response, "output_text", None)
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise ManagerPromptInterpreterResponseError(
            "Gemini returned an empty manager-intent response."
        )

    cleaned = raw_text.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Be tolerant of accidental Markdown fences while keeping the schema
        # validation in the caller as the final authority.
        if cleaned.startswith("```"):
            fenced = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            fenced = re.sub(r"\s*```$", "", fenced)
            try:
                return json.loads(fenced.strip())
            except json.JSONDecodeError:
                pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        candidate = cleaned[start : end + 1]
        candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    raise ManagerPromptInterpreterResponseError(
        "Gemini returned invalid JSON for manager-intent interpretation."
    )


def _post_to_gemini(prompt: str) -> object:
    """Call Gemini for manager-intent interpretation with structured JSON output."""

    if not settings.gemini_api_key:
        raise ManagerPromptInterpreterResponseError(
            "GEMINI_API_KEY is not configured."
        )

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        interaction = client.interactions.create(
            model=settings.gemini_model,
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": MANAGER_PROMPT_INTERPRETATION_SCHEMA,
            },
        )
        return interaction
    except Exception as exc:
        message = str(exc)
        if "429" in message or "RESOURCE_EXHAUSTED" in message:
            raise ManagerPromptInterpreterResponseError(
                "Gemini rate limit or quota was exceeded during manager-intent interpretation."
            ) from exc
        if "401" in message or "403" in message or "API key" in message:
            raise ManagerPromptInterpreterResponseError(
                "Gemini API authentication or access was rejected."
            ) from exc
        if "timeout" in message.casefold() or "timed out" in message.casefold():
            raise ManagerPromptInterpreterConnectionError(
                "Manager-intent interpretation timed out while waiting for Gemini."
            ) from exc
        raise ManagerPromptInterpreterConnectionError(
            "Unable to reach Gemini for manager-intent interpretation."
        ) from exc


def _post_to_ollama(prompt: str) -> object:
    """Backward-compatible alias; manager intent now uses Gemini."""
    return _post_to_gemini(prompt)


# These are intentionally small, canonical semantic cues rather than a growing
# list of brittle phrase-specific rules. They let us reconcile an LLM response
# against the manager's actual wording, including common typos such as
# "senario" -> "scenario".
_PATTERN_CUES: dict[str, tuple[str, ...]] = {
    "scenario": (
        "scenario",
        "scenarios",
        "situational",
        "realistic situation",
        "real world situation",
        "real-world situation",
    ),
    "comparison": (
        "comparison",
        "compare",
        "difference between",
        "versus",
        "vs",
    ),
    "debugging": (
        "debugging",
        "debug",
        "troubleshooting",
        "root cause",
        "diagnose",
        "fix the bug",
        "failure analysis",
    ),
    "code": (
        "code",
        "coding",
        "code snippet",
        "implementation",
        "program",
    ),
    "output": (
        "output prediction",
        "predict the output",
        "what will this print",
        "what does this return",
    ),
    "sql": (
        "sql",
        "query writing",
        "joins",
        "group by",
    ),
    "design": (
        "system design",
        "architecture",
        "trade-off",
        "tradeoff",
        "design",
    ),
    "applied": (
        "applied",
        "practical",
        "hands-on",
        "real world",
        "real-world",
        "production",
    ),
    "concept": (
        "concept",
        "conceptual",
        "principle",
        "fundamentals",
        "definition",
    ),
}

_EXAMPLE_MARKERS = (
    "example",
    "examples",
    "eg",
    "e.g",
    "for example",
    "take eg",
    "take an example",
    "as an example",
)

_MIX_MARKERS = (
    "mix",
    "mixed",
    "variety",
    "different types",
    "combination",
    "some questions",
    "a few questions",
)

_NON_EXAMPLE_INSTRUCTION_TOKENS = {
    "short", "brief", "realistic", "scenario", "scenarios", "question",
    "questions", "interesting", "easy", "understand", "efficient",
    "efficiency", "performance", "optimize", "optimization",
}

_EFFICIENCY_CUES = (
    "efficiency",
    "efficient",
    "performance",
    "optimize",
    "optimization",
    "faster",
    "reduce overhead",
    "resource usage",
)


def _clean_semantic_text(value: str | None) -> str:
    """Normalize text for lightweight semantic cue matching."""
    return " ".join(str(value or "").casefold().split())


def _token_similarity(left: str, right: str) -> float:
    """Return a conservative character-level similarity score."""
    return SequenceMatcher(None, _clean_semantic_text(left), _clean_semantic_text(right)).ratio()


def _source_contains_cue(prompt: str, cue: str) -> bool:
    """Match a cue exactly or with a small typo-tolerant single-token fallback."""
    normalized_prompt = _clean_semantic_text(prompt)
    normalized_cue = _clean_semantic_text(cue)

    if normalized_cue in normalized_prompt:
        return True

    if " " in normalized_cue:
        return False

    words = re.findall(r"[a-z]+(?:-[a-z]+)?", normalized_prompt)
    return any(
        len(word) >= 5
        and len(normalized_cue) >= 5
        and _token_similarity(word, normalized_cue) >= 0.84
        for word in words
    )


def _infer_source_patterns(prompt: str) -> list[QuestionPattern]:
    """Infer clear pattern cues from the manager's original text, typo-tolerantly."""
    normalized = _clean_semantic_text(prompt)
    found: list[QuestionPattern] = []

    for pattern, cues in _PATTERN_CUES.items():
        if any(_source_contains_cue(normalized, cue) for cue in cues):
            found.append(pattern)  # type: ignore[arg-type]

    # "practical scenario" is primarily a scenario instruction, not two
    # independent patterns. Prefer scenario when it is explicitly requested.
    if "scenario" in found and "applied" in found:
        found = [pattern for pattern in found if pattern != "applied"]

    return found


def _has_explicit_mix_marker(prompt: str) -> bool:
    """Return whether the manager explicitly asks for a mixture of patterns."""
    normalized = _clean_semantic_text(prompt)
    return any(marker in normalized for marker in _MIX_MARKERS)


def _manager_mentions_examples(prompt: str) -> bool:
    """Return whether the manager is clearly using example/context language."""
    normalized = _clean_semantic_text(prompt)
    return any(marker in normalized for marker in _EXAMPLE_MARKERS)


def _manager_emphasizes_efficiency(prompt: str) -> bool:
    """Return whether efficiency/performance is explicitly requested."""
    normalized = _clean_semantic_text(prompt)
    return any(_source_contains_cue(normalized, cue) for cue in _EFFICIENCY_CUES)


def _source_supports_item(prompt: str, item: str) -> bool:
    """Keep model-derived contextual items only when the source supports them."""
    normalized_item = _clean_semantic_text(item)
    normalized_prompt = _clean_semantic_text(prompt)
    if not normalized_item:
        return False
    if normalized_item in normalized_prompt:
        return True

    item_tokens = [
        token for token in re.findall(r"[a-z]{3,}", normalized_item)
        if token not in {"question", "questions", "same", "different", "problem", "options"}
    ]
    if not item_tokens:
        return False

    supported = 0
    for token in item_tokens:
        if _source_contains_cue(normalized_prompt, token):
            supported += 1

    return supported / len(item_tokens) >= 0.60


def _repair_interpretation_from_source(
    result: ManagerPromptInterpretation,
    manager_prompt: str,
) -> ManagerPromptInterpretation:
    """Reconcile model output against high-confidence evidence in the source text.

    The LLM remains the main semantic interpreter. This second, deterministic
    pass prevents common local-model mistakes from becoming authoritative when
    the manager's original wording clearly says otherwise.
    """
    source_patterns = _infer_source_patterns(manager_prompt)
    explicit_mix = _has_explicit_mix_marker(manager_prompt)
    mentions_examples = _manager_mentions_examples(manager_prompt)
    efficiency_requested = _manager_emphasizes_efficiency(manager_prompt)

    if source_patterns:
        if explicit_mix and len(source_patterns) > 1:
            result.requested_patterns = source_patterns
        else:
            # When the manager clearly asks for one style, do not let the model
            # invent a mixed candidate plan merely because the batch is >1.
            result.requested_patterns = [source_patterns[0]]
            result.candidate_mix = []

    if mentions_examples:
        cleaned_examples: list[ManagerExample] = []
        seen_examples: set[str] = set()

        # Promote source-supported model examples out of must_include when the
        # manager framed them as examples rather than mandatory content.
        must_include_without_examples: list[str] = []
        for item in result.must_include:
            item_tokens = set(re.findall(r"[a-z]{3,}", _clean_semantic_text(item)))
            is_instruction_like = bool(item_tokens & _NON_EXAMPLE_INSTRUCTION_TOKENS)
            if (
                _source_supports_item(manager_prompt, item)
                and len(item_tokens) <= 6
                and not is_instruction_like
            ):
                normalized_item = _clean_semantic_text(item)
                if normalized_item not in seen_examples:
                    cleaned_examples.append(ManagerExample(text=item, role="context"))
                    seen_examples.add(normalized_item)
                    continue
            must_include_without_examples.append(item)

        for example in result.preferred_examples:
            if _source_supports_item(manager_prompt, example.text):
                key = _clean_semantic_text(example.text)
                if key and key not in seen_examples:
                    cleaned_examples.append(example)
                    seen_examples.add(key)

        if cleaned_examples:
            result.preferred_examples = cleaned_examples[:12]
        result.must_include = must_include_without_examples

    if efficiency_requested:
        if not any(_clean_semantic_text(item) == "efficiency" for item in result.must_include):
            result.must_include.append("efficiency")
        if "efficiency" not in {
            _clean_semantic_text(note) for note in result.priority_notes
        }:
            result.priority_notes.append(
                "Efficiency should affect the actual scenario decision or technical task, not just the wording."
            )

    # Never allow an unsupported LLM-invented avoidance context to become a
    # hard instruction. Keep only source-supported avoidances or clearly generic
    # repetition requirements already expressed by the manager.
    result.avoid = [
        item for item in result.avoid
        if _source_supports_item(manager_prompt, item)
    ][:20]

    # The user's request to avoid repeating the same problem is explicit even
    # when the local model phrases it differently. Preserve the quality signal.
    normalized_source = _clean_semantic_text(manager_prompt)
    if (
        ("same problem" in normalized_source and "option" in normalized_source)
        or "same question" in normalized_source
        or "repetitive" in normalized_source
        or "repetition" in normalized_source
        or "all the same" in normalized_source
    ):
        if not any("semantic repetition" in _clean_semantic_text(note) for note in result.priority_notes):
            result.priority_notes.append("Avoid semantic repetition; changed options do not make a new problem.")
        result.distinct_problem_statements = True
        result.diversity_level = "high"
        result.vary_scenario_contexts = True

    return result

def interpret_manager_prompt(
    manager_prompt: str,
    *,
    slot_difficulty: DifficultyLevel = "auto",
    section_type: str = "unknown",
    question_type: str = "unknown",
    batch_count: int | None = None,
) -> ManagerPromptInterpretation:
    """Interpret natural-language manager guidance into structured intent.

    This function does not generate or persist questions. It is intentionally
    safe to call before the current generation flow is changed.
    """

    normalized_prompt = _normalize_manager_prompt(manager_prompt)
    last_error = ""
    prompt = _build_interpreter_prompt(
        normalized_prompt,
        slot_difficulty=slot_difficulty,
        section_type=section_type,
        question_type=question_type,
        batch_count=batch_count,
    )

    for attempt in range(MANAGER_PROMPT_INTERPRETER_MAX_ATTEMPTS):
        if attempt > 0:
            prompt = f"""
Reinterpret the manager message more carefully.

Previous interpreter validation error:
{last_error}

Preserve the original manager meaning. Do not invent instructions.
Return ONLY valid JSON matching the required schema.

Original manager message:
{normalized_prompt}
""".strip()

        response = _post_to_gemini(prompt)

        try:
            payload = _extract_response_payload(response)
            result = ManagerPromptInterpretation.model_validate(payload)
        except (
            ManagerPromptInterpreterResponseError,
            ValidationError,
            TypeError,
            ValueError,
        ) as exc:
            last_error = str(exc)
            continue

        if result.normalized_manager_instruction.casefold() != normalized_prompt.casefold():
            # The interpreter is allowed to normalize typos internally, but it
            # must not erase or radically rewrite the manager's original intent.
            # Keep the manager's normalized source message as the canonical copy.
            result.normalized_manager_instruction = normalized_prompt

        result = _repair_interpretation_from_source(result, normalized_prompt)
        result.normalized_manager_instruction = normalized_prompt
        return result

    raise ManagerPromptInterpreterResponseError(
        "Unable to interpret manager guidance reliably after "
        f"{MANAGER_PROMPT_INTERPRETER_MAX_ATTEMPTS} attempts. "
        f"Last issue: {last_error}"
    )


__all__ = [
    "ManagerExample",
    "ManagerPromptInterpreterConnectionError",
    "ManagerPromptInterpreterResponseError",
    "ManagerPromptInterpretation",
    "ManagerPromptServiceError",
    "ManagerSentiment",
    "interpret_manager_prompt",
]
