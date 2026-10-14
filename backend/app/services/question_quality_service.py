"""Question quality gate for Evalyn AI-generated assessment questions.

This module is deliberately independent from the LLM generation path.
The generator proposes content; this service validates whether the content
fits the assessment blueprint and passes deterministic quality checks.

The first version intentionally treats difficulty classification as a
pre-screen, not as a final scientific measurement of cognitive difficulty.
A later layer can add an independent LLM judge without changing this API.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Iterable, Literal

from sqlalchemy.orm import Session

from app.models import Question, Section, SectionSkill


Difficulty = Literal["easy", "medium", "hard"]
QuestionType = Literal["MCQ", "FREE_TEXT"]

VALID_DIFFICULTIES: set[str] = {"easy", "medium", "hard"}
VALID_QUESTION_TYPES: set[str] = {"MCQ", "FREE_TEXT"}

MAX_QUESTION_TEXT_LENGTH = 1000
MAX_OPTION_LENGTH = 500

# These are intentionally transparent heuristics. They are used to reject
# obvious difficulty mismatches before the independent AI judge is added.
EASY_DISQUALIFIER_PATTERNS: tuple[str, ...] = (
    r"\bdebug(?:ging)?\b",
    r"\btrade[- ]?off\b",
    r"\boptimi[sz](?:e|ation|ing)\b",
    r"\barchitect(?:ure|ural)\b",
    r"\bbenchmark(?:ing)?\b",
    r"\bconcurrent(?:ly)?\b",
    r"\brace condition\b",
    r"\bdeadlock\b",
    r"\bmemory leak\b",
    r"\bperformance bottleneck\b",
    r"\broot cause\b",
    r"\bproduction incident\b",
    r"\bscale(?:d|s|ing)?\b",
)

MEDIUM_SIGNALS: tuple[str, ...] = (
    r"\bscenario\b",
    r"\bsituation\b",
    r"\bapplication\b",
    r"\bwhy\b",
    r"\bwhich approach\b",
    r"\bpredict\b",
    r"\bresult\b",
    r"\boutput\b",
    r"\bconfigure\b",
    r"\btroubleshoot\b",
    r"\bdiagnos(?:e|is)\b",
    r"\bchoose\b",
)

HARD_SIGNALS: tuple[str, ...] = (
    r"\btrade[- ]?off\b",
    r"\barchitecture\b",
    r"\boptimi[sz](?:e|ation|ing)\b",
    r"\bconcurrent(?:ly)?\b",
    r"\brace condition\b",
    r"\bdeadlock\b",
    r"\broot cause\b",
    r"\bproduction incident\b",
    r"\bscal(?:e|ability|able)\b",
    r"\bmultiple constraints\b",
    r"\bedge case\b",
    r"\bfailure mode\b",
)


class QuestionQualityError(ValueError):
    """Raised when a question fails a quality gate."""


@dataclass(frozen=True)
class DifficultyEvaluation:
    requested: str
    suggested: Difficulty
    score: int
    reasons: tuple[str, ...] = ()
    obvious_mismatch: bool = False


@dataclass(frozen=True)
class QuestionQualityReport:
    passed: bool
    errors: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    normalized_text: str = ""
    difficulty: DifficultyEvaluation | None = None
    exact_duplicate_question_id: int | None = None
    lexical_similarity_max: float = 0.0
    details: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class QuestionBlueprint:
    """Immutable representation of one assessment slot."""

    section_id: int
    skill_id: int
    difficulty: Difficulty


def normalize_question_text(text: str) -> str:
    """Normalize text for exact/lexical duplicate comparison."""

    normalized = " ".join((text or "").strip().lower().split())
    normalized = re.sub(r"[?.!]+$", "", normalized)
    return normalized


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+[\w'-]*\b", text))


def _contains_any(text: str, patterns: Iterable[str]) -> list[str]:
    hits: list[str] = []
    for pattern in patterns:
        if re.search(pattern, text, flags=re.IGNORECASE):
            hits.append(pattern)
    return hits


def _lexical_similarity(left: str, right: str) -> float:
    """Fast lexical similarity used as a cheap pre-filter.

    This is NOT semantic similarity. It is deliberately named and documented
    as lexical so it cannot be confused with the existing embedding/FAISS
    retrieval capability.
    """

    return SequenceMatcher(
        None,
        normalize_question_text(left),
        normalize_question_text(right),
    ).ratio()


def evaluate_difficulty_heuristic(
    question_text: str,
    requested_difficulty: str,
) -> DifficultyEvaluation:
    """Pre-screen difficulty using transparent deterministic rules.

    This gate catches obvious mismatches. It is not a replacement for an
    independently evaluated cognitive-difficulty model.
    """

    requested = requested_difficulty.strip().lower()
    if requested not in VALID_DIFFICULTIES:
        raise QuestionQualityError("Difficulty must be easy, medium, or hard.")

    text = " ".join(question_text.strip().split())
    word_count = _word_count(text)
    sentence_count = max(1, len(re.findall(r"[.!?]+", text)))
    easy_hits = _contains_any(text, EASY_DISQUALIFIER_PATTERNS)
    medium_hits = _contains_any(text, MEDIUM_SIGNALS)
    hard_hits = _contains_any(text, HARD_SIGNALS)

    score = 2
    reasons: list[str] = []

    # Complexity signals raise the pre-screen score.
    score += min(len(medium_hits), 2)
    score += min(len(hard_hits), 4)

    if word_count > 45:
        score += 1
        reasons.append("Question has a relatively long scenario/context.")

    if sentence_count >= 3:
        score += 1
        reasons.append("Question contains multiple reasoning/context sentences.")

    if easy_hits:
        score += 3
        reasons.append("Question contains signals normally associated with advanced reasoning.")

    score = min(score, 10)

    if score <= 4:
        suggested: Difficulty = "easy"
    elif score <= 7:
        suggested = "medium"
    else:
        suggested = "hard"

    if requested == "easy" and easy_hits:
        obvious_mismatch = True
    elif requested == "easy" and score >= 6:
        obvious_mismatch = True
    elif requested == "medium" and score >= 9:
        obvious_mismatch = True
    elif requested == "hard" and score <= 4:
        obvious_mismatch = True
    else:
        obvious_mismatch = False

    if not reasons:
        reasons.append("No strong advanced-complexity signals were detected by the deterministic pre-screen.")

    return DifficultyEvaluation(
        requested=requested,
        suggested=suggested,
        score=score,
        reasons=tuple(reasons),
        obvious_mismatch=obvious_mismatch,
    )


def build_blueprint(
    section: Section,
    section_skill: SectionSkill,
) -> QuestionBlueprint:
    """Build the expected slot metadata from actual database models."""

    difficulty = str(section.difficulty or "").strip().lower()
    if difficulty not in VALID_DIFFICULTIES:
        raise QuestionQualityError(
            f"Section {section.id} has invalid difficulty '{section.difficulty}'."
        )

    return QuestionBlueprint(
        section_id=section.id,
        skill_id=section_skill.skill_id,
        difficulty=difficulty,  # type: ignore[arg-type]
    )


def _validate_structure(
    question_text: str,
    question_type: str,
    options: list[str] | None,
    correct_answer: str | None,
) -> list[str]:
    errors: list[str] = []

    normalized_text = " ".join((question_text or "").strip().split())
    if not normalized_text:
        errors.append("Question text is empty.")
    elif len(normalized_text) > MAX_QUESTION_TEXT_LENGTH:
        errors.append("Question text exceeds the 1000-character limit.")

    normalized_type = (question_type or "").strip().upper()
    if normalized_type not in VALID_QUESTION_TYPES:
        errors.append("Question type must be MCQ or FREE_TEXT.")

    if normalized_type == "MCQ":
        clean_options = [
            " ".join((option or "").strip().split())
            for option in (options or [])
            if (option or "").strip()
        ]
        if len(clean_options) < 4:
            errors.append("AI screening MCQs must contain at least four non-empty options.")

        lowered = [option.lower() for option in clean_options]
        if len(lowered) != len(set(lowered)):
            errors.append("MCQ options must be unique.")

        for option in clean_options:
            if len(option) > MAX_OPTION_LENGTH:
                errors.append("An MCQ option exceeds the 500-character limit.")

        if not (correct_answer or "").strip():
            errors.append("MCQ correct answer is required.")
        elif (correct_answer or "").strip().lower() not in set(lowered):
            errors.append("MCQ correct answer must exactly match one option.")

    elif normalized_type == "FREE_TEXT":
        if options:
            errors.append("FREE_TEXT questions must not contain MCQ options.")
        if correct_answer:
            errors.append("FREE_TEXT questions must not contain an MCQ correct answer.")

    return errors


def validate_question_quality(
    db: Session,
    *,
    question_text: str,
    question_type: str,
    skill_id: int,
    difficulty: str,
    options: list[str] | None = None,
    correct_answer: str | None = None,
    section_id: int | None = None,
    existing_questions: Iterable[Question] | None = None,
    reject_lexical_similarity_at: float = 0.92,
) -> QuestionQualityReport:
    """Validate one question against structure, blueprint, difficulty and duplicates.

    ``existing_questions`` may be supplied by a caller that already has the
    relevant question-bank/section pool in memory. This makes regeneration and
    batch generation efficient and deterministic.

    The function does not mutate the database.
    """

    errors: list[str] = []
    warnings: list[str] = []
    normalized_text = " ".join((question_text or "").strip().split())

    errors.extend(
        _validate_structure(
            question_text=normalized_text,
            question_type=question_type,
            options=options,
            correct_answer=correct_answer,
        )
    )

    normalized_difficulty = (difficulty or "").strip().lower()
    if normalized_difficulty not in VALID_DIFFICULTIES:
        errors.append("Difficulty must be easy, medium, or hard.")

    section: Section | None = None
    if section_id is not None:
        section = db.get(Section, section_id)
        if section is None:
            errors.append(f"Section {section_id} was not found.")
        else:
            section_difficulty = str(section.difficulty or "").strip().lower()
            if section_difficulty not in VALID_DIFFICULTIES:
                errors.append(
                    f"Section {section.id} has invalid difficulty '{section.difficulty}'."
                )
            elif normalized_difficulty != section_difficulty:
                errors.append(
                    "Question difficulty does not match the target section difficulty."
                )

            allowed_skill = (
                db.query(SectionSkill)
                .filter(
                    SectionSkill.section_id == section.id,
                    SectionSkill.skill_id == skill_id,
                    SectionSkill.question_count > 0,
                )
                .first()
            )
            if allowed_skill is None:
                errors.append(
                    "Question skill is not allocated to the target section."
                )

    difficulty_eval: DifficultyEvaluation | None = None
    if normalized_difficulty in VALID_DIFFICULTIES and normalized_text:
        difficulty_eval = evaluate_difficulty_heuristic(
            normalized_text,
            normalized_difficulty,
        )
        if difficulty_eval.obvious_mismatch:
            errors.append(
                "Deterministic difficulty pre-screen indicates that the question does not fit its requested difficulty."
            )

    duplicate_id: int | None = None
    max_similarity = 0.0

    for existing in existing_questions or ():
        existing_text = getattr(existing, "question_text", None)
        if not existing_text:
            continue

        if normalize_question_text(existing_text) == normalize_question_text(normalized_text):
            duplicate_id = getattr(existing, "id", None)
            errors.append("Question is an exact normalized-text duplicate of an existing question.")
            break

        similarity = _lexical_similarity(existing_text, normalized_text)
        max_similarity = max(max_similarity, similarity)

    if max_similarity >= reject_lexical_similarity_at:
        errors.append(
            f"Question is lexically too similar to an existing question (similarity={max_similarity:.3f})."
        )

    # This message is intentionally explicit so callers do not accidentally
    # advertise lexical similarity as semantic/embedding similarity.
    if max_similarity >= 0.75 and max_similarity < reject_lexical_similarity_at:
        warnings.append(
            f"Question has elevated lexical similarity to an existing question (max={max_similarity:.3f}); an embedding-based semantic check is recommended."
        )

    details: dict[str, object] = {
        "section_id": section_id,
        "skill_id": skill_id,
        "requested_difficulty": normalized_difficulty,
        "question_type": (question_type or "").strip().upper(),
        "has_section": section is not None if section_id is not None else False,
        "validation_stage": "deterministic_pre_screen",
    }

    if section is not None:
        details["section_difficulty"] = str(section.difficulty).strip().lower()

    if difficulty_eval is not None:
        details["difficulty_score"] = difficulty_eval.score
        details["difficulty_suggested"] = difficulty_eval.suggested
        details["difficulty_reasons"] = difficulty_eval.reasons

    return QuestionQualityReport(
        passed=not errors,
        errors=tuple(errors),
        warnings=tuple(warnings),
        normalized_text=normalized_text,
        difficulty=difficulty_eval,
        exact_duplicate_question_id=duplicate_id,
        lexical_similarity_max=max_similarity,
        details=details,
    )
