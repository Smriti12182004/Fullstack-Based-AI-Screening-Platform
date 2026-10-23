"""Shared weighted rubric for free-text answers."""

from __future__ import annotations

from typing import Any


QUESTION_MAX_POINTS = 10.0

FREE_TEXT_RUBRIC: list[dict[str, Any]] = [
    {
        "key": "answer_accuracy",
        "label": "Answer accuracy and relevance",
        "max_points": 4.0,
        "guidance": (
            "Assess whether the answer is accurate, relevant to the question, and "
            "consistent with the facts or constraints provided. Judge technical "
            "correctness only when the question genuinely requires technical "
            "knowledge. Do not penalize a professional or non-technical answer "
            "for not containing technical details."
        ),
    },
    {
        "key": "key_concepts",
        "label": "Coverage of key concepts",
        "max_points": 3.0,
        "guidance": (
            "Coverage of important facts, steps, decisions, or requirements needed "
            "to answer the question. Assess the concepts relevant to the question "
            "and role, not generic or unsupported details."
        ),
    },
    {
        "key": "reasoning_application",
        "label": "Reasoning and application",
        "max_points": 2.0,
        "guidance": (
            "Quality of explanation, reasoning, practical application, and "
            "justification where relevant to the question."
        ),
    },
    {
        "key": "clarity_completeness",
        "label": "Clarity and completeness",
        "max_points": 1.0,
        "guidance": (
            "Whether the response is understandable, sufficiently complete, and "
            "organized enough to address the question."
        ),
    },
]


def rubric_for_question(
    question_type: str | None,
    correct_answer: str | None = None,
    explanation: str | None = None,
) -> list[dict[str, Any]] | None:
    """Return a question-specific rubric snapshot for free-text answers."""
    normalized = (
        str(question_type or "")
        .strip()
        .upper()
        .replace("-", "_")
        .replace(" ", "_")
    )

    if normalized not in {
        "FREE_TEXT",
        "FREETEXT",
        "FREE_RESPONSE",
        "TEXT",
    }:
        return None

    rubric = [dict(item) for item in FREE_TEXT_RUBRIC]
    references = []

    for value in (correct_answer, explanation):
        normalized_value = " ".join(str(value or "").strip().split())
        if normalized_value:
            references.append(normalized_value[:1200])

    if references:
        rubric[1]["guidance"] += (
            " Use these question-specific expected answer/key points when "
            "evaluating coverage: "
            + " | ".join(references)
        )
    else:
        rubric[1]["guidance"] += (
            " Use the exact question and a relevant, defensible answer to identify "
            "key concepts; do not require unsupported details."
        )

    return rubric
