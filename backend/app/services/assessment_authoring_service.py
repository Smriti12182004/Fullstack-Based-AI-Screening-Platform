
from __future__ import annotations

from datetime import datetime, timezone
from difflib import SequenceMatcher
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.timestamps import utc_now
from app.services.llm_client import (
    LLMConnectionError,
    LLMQuotaError,
    LLMResponseError,
)
from app.models import (
    JobAssessmentAccess,
    Question,
    QuestionBank,
    QuestionSet,
    QuestionVersion,
    Skill,
)
from app.models.assessment_set import AssessmentSet
from app.models.question_generation_attempt import QuestionGenerationAttempt
from app.models.question_slot import QuestionSlot
from app.services.llm_service import (
    LLMServiceError,
    QUESTION_BATCH_HARD_LIMIT,
    build_generation_variation_instruction,
    find_non_technical_domain_leakage,
    generate_questions_from_skills,
)
from app.services.question_service import _normalize_question_text
from app.services.skill_review_service import get_job_skills
from app.services.question_generation_planner import (
    QuestionGenerationPlannerError,
    plan_question_batch,
)
from app.services.manager_prompt_service import (
    ManagerPromptServiceError,
    interpret_manager_prompt,
)


VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_SECTION_TYPES = {"conceptual", "implementation", "free_text"}
VALID_SOURCES = {"ai_generated", "manual", "historical", "question_bank"}
VALID_QUESTION_TYPES = {"MCQ", "FREE_TEXT"}


def _default_question_type_for_section(section_type: str) -> str:
    return (
        "FREE_TEXT"
        if str(section_type or "").strip().lower() == "free_text"
        else "MCQ"
    )


def _slot_question_type(slot: QuestionSlot) -> str:
    value = (
        str(getattr(slot, "preferred_question_type", "") or "")
        .strip()
        .upper()
    )
    if value in VALID_QUESTION_TYPES:
        return value
    return _default_question_type_for_section(slot.section_type)


def _now():
    return datetime.now(timezone.utc)


def _require_manager_access(
    db: Session,
    question_set: QuestionSet,
    user_id: int,
) -> None:
    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == question_set.job_id,
            JobAssessmentAccess.user_id == user_id,
        )
        .first()
    )
    if access is None:
        raise ValueError(
            "You are not authorized to manage this assessment."
        )


def _get_question_set(
    db: Session,
    question_set_id: int,
    user_id: int,
) -> QuestionSet:
    question_set = db.get(
        QuestionSet,
        question_set_id,
    )
    if question_set is None:
        raise ValueError(
            "Question set not found."
        )
    _require_manager_access(
        db,
        question_set,
        user_id,
    )
    return question_set


def _get_slot(
    db: Session,
    slot_id: int,
    user_id: int,
) -> tuple[QuestionSlot, QuestionSet]:
    slot = db.get(
        QuestionSlot,
        slot_id,
    )
    if slot is None:
        raise ValueError(
            "Question slot not found."
        )

    assessment_set = db.get(
        AssessmentSet,
        slot.assessment_set_id,
    )
    if assessment_set is None:
        raise ValueError(
            "Assessment set not found."
        )

    question_set = _get_question_set(
        db,
        assessment_set.question_set_id,
        user_id,
    )
    return slot, question_set



def _get_job_skill_generation_context(
    db: Session,
    job_id: int,
    skill_id: int,
) -> dict[str, str | None]:
    """Load the job title/JD and the per-job skill category for role-aware generation.

    Skill categories belong to the JobSkill association; the global Skill model does not
    carry this field. Missing/legacy classification defaults to technical for backward
    compatibility rather than silently treating unknown data as a non-technical role.
    """
    job_row = db.execute(
        text(
            """
            SELECT title, description, experience_required
            FROM jobs
            WHERE id = :job_id
            LIMIT 1
            """
        ),
        {"job_id": job_id},
    ).mappings().first() or {}

    skill_row = db.execute(
        text(
            """
            SELECT category
            FROM job_skills
            WHERE job_id = :job_id
              AND skill_id = :skill_id
            LIMIT 1
            """
        ),
        {"job_id": job_id, "skill_id": skill_id},
    ).mappings().first() or {}

    raw_category = str(skill_row.get("category") or "technical").strip().lower()
    category = raw_category if raw_category in {"technical", "non_technical"} else "technical"
    description = " ".join(str(job_row.get("description") or "").strip().split())[:3500] or None

    return {
        "job_title": " ".join(str(job_row.get("title") or "").strip().split())[:255] or None,
        "job_description": description,
        "experience_required": " ".join(
            str(job_row.get("experience_required") or "").strip().split()
        )[:100] or None,
        "skill_category": category,
        "prompt_skill_category": "Professional Skill" if category == "non_technical" else "Other",
    }

def _section_description(
    section_type: str,
    section_name: str | None = None,
) -> str:
    """Return a meaningful authoring description without relying on a DB column."""
    normalized = (
        section_type or "conceptual"
    ).strip().lower()

    descriptions = {
        "conceptual": (
            "Foundational concepts, principles, definitions, comparisons, "
            "and reasoning. Easy-level MCQs only."
        ),
        "implementation": (
            "Practical application through code reading, output prediction, "
            "debugging, SQL, APIs, configuration, and implementation decisions."
        ),
        "free_text": (
            "Evaluation-oriented questions. Supports MCQ and open-response "
            "questions; open responses are evaluated against a rubric."
        ),
    }

    return descriptions.get(
        normalized,
        f"{section_name or 'Assessment'} questions for this section.",
    )


def _section_rows(
    db: Session,
    question_set_id: int,
) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT
                s.id,
                s.name,
                COALESCE(s.section_type, 'conceptual') AS section_type,
                s.display_order
            FROM sections s
            WHERE s.question_set_id = :question_set_id
            ORDER BY s.display_order ASC, s.id ASC
            """
        ),
        {
            "question_set_id": question_set_id,
        },
    ).mappings().all()

    result = []

    for row in rows:
        item = dict(row)
        item["description"] = _section_description(
            item.get("section_type"),
            item.get("name"),
        )
        result.append(item)

    return result


def _section_skill_rows(
    db: Session,
    section_id: int,
) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT
                ss.section_id,
                ss.skill_id,
                COALESCE(ss.easy_count, 0) AS easy_count,
                COALESCE(ss.medium_count, 0) AS medium_count,
                COALESCE(ss.hard_count, 0) AS hard_count
            FROM section_skills ss
            WHERE ss.section_id = :section_id
            ORDER BY ss.id ASC
            """
        ),
        {
            "section_id": section_id,
        },
    ).mappings().all()

    return [
        dict(row)
        for row in rows
    ]


def _skill_map(
    db: Session,
    skill_ids: set[int],
) -> dict[int, Skill]:
    if not skill_ids:
        return {}

    return {
        skill.id: skill
        for skill in (
            db.query(Skill)
            .filter(
                Skill.id.in_(skill_ids)
            )
            .all()
        )
    }


def _label_for_variant(
    variant_number: int,
) -> str:
    if 1 <= variant_number <= 26:
        return chr(64 + variant_number)
    return str(variant_number)


def _slot_response(
    db: Session,
    slot: QuestionSlot,
) -> dict:
    current = slot.current_question

    attempts = (
        db.query(
            QuestionGenerationAttempt
        )
        .filter(
            QuestionGenerationAttempt.question_slot_id
            == slot.id
        )
        .order_by(
            QuestionGenerationAttempt.attempt_number.desc()
        )
        .all()
    )

    metadata = db.execute(
        text(
            """
            SELECT
                s.name AS section_name,
                COALESCE(s.section_type, 'conceptual') AS section_type,
                sk.name AS skill_name
            FROM sections s
            JOIN skills sk ON sk.id = :skill_id
            WHERE s.id = :section_id
            """
        ),
        {
            "section_id": slot.section_id,
            "skill_id": slot.skill_id,
        },
    ).mappings().first() or {}

    return {
        "id": slot.id,
        "assessment_set_id": slot.assessment_set_id,
        "section_id": slot.section_id,
        "section_name": metadata.get(
            "section_name"
        ),
        "section_description": _section_description(
            metadata.get("section_type"),
            metadata.get("section_name"),
        ),
        "skill_id": slot.skill_id,
        "skill_name": metadata.get(
            "skill_name"
        ),
        "section_type": slot.section_type,
        "difficulty": slot.difficulty,
        "slot_number": slot.slot_number,
        "preferred_question_type": _slot_question_type(
            slot
        ),
        "source_type": slot.source_type,
        "status": slot.status,
        "current_question": (
            _question_response(
                current,
                db,
            )
            if current
            else None
        ),
        "generation_attempts": [
            _attempt_response(attempt)
            for attempt in attempts
        ],
    }


def _question_response(
    question: Question,
    db: Session | None = None,
) -> dict:
    ratings = {
        "manager_rating": None,
        "reviewer_rating": None,
    }

    if db is not None:
        row = db.execute(
            text(
                "SELECT manager_rating, reviewer_rating "
                "FROM questions WHERE id = :question_id"
            ),
            {
                "question_id": question.id,
            },
        ).mappings().first()

        if row:
            ratings = {
                "manager_rating": row[
                    "manager_rating"
                ],
                "reviewer_rating": row[
                    "reviewer_rating"
                ],
            }

    return {
        "id": question.id,
        "question_text": question.question_text,
        "question_type": question.question_type,
        "section_type": getattr(
            question,
            "section_type",
            None,
        ),
        "skill_id": question.skill_id,
        "difficulty": question.difficulty,
        "options": question.options or [],
        "correct_answer": question.correct_answer,
        "explanation": question.explanation,
        "status": question.status,
        "source": question.source,
        "version": question.version,
        "created_at": question.created_at,
        "updated_at": question.updated_at,
        **ratings,
    }


def _generation_pattern_label(
    pattern: object,
) -> str | None:
    """Convert an internal planner pattern into the canonical UI label."""
    normalized = (
        str(pattern or "")
        .strip()
        .lower()
    )

    labels = {
        "concept": "Concept / principle",
        "scenario": "Scenario",
        "comparison": "Comparison",
        "code": "Code interpretation",
        "output": "Output prediction",
        "debugging": "Debugging",
        "sql": "SQL",
        "design": "Design / reasoning",
        "applied": "Applied reasoning",
    }

    return labels.get(
        normalized
    )


def _attempt_response(
    attempt: QuestionGenerationAttempt,
) -> dict:
    return {
        "id": attempt.id,
        "question_slot_id": attempt.question_slot_id,
        "attempt_number": attempt.attempt_number,
        "status": attempt.status,
        "question_text": attempt.question_text,
        "question_type": attempt.question_type,
        "section_type": attempt.section_type,
        "skill_id": attempt.skill_id,
        "difficulty": attempt.difficulty,
        "options": attempt.options,
        "correct_answer": attempt.correct_answer,
        "explanation": attempt.explanation,
        "provider": attempt.provider,
        "model_name": attempt.model_name,
        "request_id": attempt.request_id,
        "validation_status": attempt.validation_status,
        "validation_errors": attempt.validation_errors,
        "error_message": attempt.error_message,
        "candidate_question_id": attempt.candidate_question_id,
        "previous_question_id": attempt.previous_question_id,
        "created_at": attempt.created_at,
        "completed_at": attempt.completed_at,
        "accepted_at": attempt.accepted_at,
        "restored_at": attempt.restored_at,
        # New attempts carry the planner-selected pattern. Historical attempts
        # created before the pattern column existed retain the deterministic
        # text classifier as a backward-compatible fallback.
        "pattern": attempt.pattern
        or _infer_generation_pattern(
            attempt.question_text,
            attempt.options,
        ),
    }


def _set_summary(
    db: Session,
    assessment_set: AssessmentSet,
) -> dict:
    slots = (
        db.query(QuestionSlot)
        .filter(
            QuestionSlot.assessment_set_id
            == assessment_set.id
        )
        .all()
    )

    total = len(slots)

    filled = sum(
        1
        for slot in slots
        if slot.current_question_id
        is not None
    )

    pending = sum(
        1
        for slot in slots
        if (
            slot.current_question_id is not None
            and slot.current_question.status
            == "pending_review"
        )
    )

    approved = sum(
        1
        for slot in slots
        if (
            slot.current_question_id is not None
            and slot.current_question.status
            == "approved"
        )
    )

    return {
        "total_slots": total,
        "filled_slots": filled,
        "remaining_slots": max(
            total - filled,
            0,
        ),
        "pending_review": pending,
        "approved": approved,
        "ready_for_finalize": (
            total > 0
            and filled == total
        ),
    }


def _set_response(
    db: Session,
    assessment_set: AssessmentSet,
) -> dict:
    slots = (
        db.query(QuestionSlot)
        .filter(
            QuestionSlot.assessment_set_id
            == assessment_set.id
        )
        .order_by(
            QuestionSlot.section_id.asc(),
            QuestionSlot.skill_id.asc(),
            QuestionSlot.difficulty.asc(),
            QuestionSlot.slot_number.asc(),
        )
        .all()
    )

    return {
        "id": assessment_set.id,
        "question_set_id": assessment_set.question_set_id,
        "variant_number": assessment_set.variant_number,
        "label": assessment_set.label,
        "status": assessment_set.status,
        "review_status": assessment_set.status,
        "reviewer_id": assessment_set.reviewer_id,
        "reviewed_at": assessment_set.reviewed_at,
        "review_comment": assessment_set.review_comment,
        "review_checklist": (
            assessment_set.review_checklist or {}
        ),
        "summary": _set_summary(
            db,
            assessment_set,
        ),
        "slots": [
            _slot_response(
                db,
                slot,
            )
            for slot in slots
        ],
    }


def _workspace_set_responses_bulk(
    db: Session,
    assessment_sets: list[AssessmentSet],
    sections: list[dict],
) -> list[dict]:
    """Build workspace set payloads with batched queries instead of per-slot queries.

    The regular single-set serializers remain available to routes that need them.
    This optimized serializer is used by the main authoring workspace endpoint,
    where loading two sets with many slots previously performed several SQL queries
    per slot (attempt history, section/skill metadata, and question ratings).
    """
    if not assessment_sets:
        return []

    set_ids = [int(item.id) for item in assessment_sets]
    slots = (
        db.query(QuestionSlot)
        .filter(QuestionSlot.assessment_set_id.in_(set_ids))
        .order_by(
            QuestionSlot.assessment_set_id.asc(),
            QuestionSlot.section_id.asc(),
            QuestionSlot.skill_id.asc(),
            QuestionSlot.difficulty.asc(),
            QuestionSlot.slot_number.asc(),
        )
        .all()
    )

    slot_ids = [int(slot.id) for slot in slots]
    question_ids = sorted(
        {
            int(slot.current_question_id)
            for slot in slots
            if slot.current_question_id is not None
        }
    )

    attempts_by_slot: dict[int, list[QuestionGenerationAttempt]] = {}
    if slot_ids:
        attempts = (
            db.query(QuestionGenerationAttempt)
            .filter(QuestionGenerationAttempt.question_slot_id.in_(slot_ids))
            .order_by(
                QuestionGenerationAttempt.question_slot_id.asc(),
                QuestionGenerationAttempt.attempt_number.desc(),
            )
            .all()
        )
        for attempt in attempts:
            attempts_by_slot.setdefault(
                int(attempt.question_slot_id), []
            ).append(attempt)

    question_by_id: dict[int, Question] = {}
    if question_ids:
        question_by_id = {
            int(question.id): question
            for question in db.query(Question)
            .filter(Question.id.in_(question_ids))
            .all()
        }

    section_by_id = {
        int(section["id"]): section
        for section in sections
        if section.get("id") is not None
    }

    slot_skill_ids = sorted({int(slot.skill_id) for slot in slots})
    skill_by_id: dict[int, Skill] = {}
    if slot_skill_ids:
        skill_by_id = {
            int(skill.id): skill
            for skill in db.query(Skill)
            .filter(Skill.id.in_(slot_skill_ids))
            .all()
        }

    slots_by_set: dict[int, list[dict]] = {
        set_id: [] for set_id in set_ids
    }

    for slot in slots:
        section = section_by_id.get(int(slot.section_id), {})
        skill = skill_by_id.get(int(slot.skill_id))
        question = (
            question_by_id.get(int(slot.current_question_id))
            if slot.current_question_id is not None
            else None
        )

        question_payload = None
        if question is not None:
            question_payload = _question_response(question)
            question_payload["manager_rating"] = question.manager_rating
            question_payload["reviewer_rating"] = question.reviewer_rating

        slot_payload = {
            "id": slot.id,
            "assessment_set_id": slot.assessment_set_id,
            "section_id": slot.section_id,
            "section_name": section.get("name"),
            "section_description": _section_description(
                section.get("section_type", "conceptual"),
                section.get("name"),
            ),
            "skill_id": slot.skill_id,
            "skill_name": skill.name if skill is not None else None,
            "section_type": slot.section_type,
            "difficulty": slot.difficulty,
            "slot_number": slot.slot_number,
            "preferred_question_type": _slot_question_type(slot),
            "source_type": slot.source_type,
            "status": slot.status,
            "current_question": question_payload,
            "generation_attempts": [
                _attempt_response(attempt)
                for attempt in attempts_by_slot.get(int(slot.id), [])
            ],
        }
        slots_by_set.setdefault(int(slot.assessment_set_id), []).append(
            slot_payload
        )

    responses = []
    for assessment_set in assessment_sets:
        set_slots = slots_by_set.get(int(assessment_set.id), [])
        total = len(set_slots)
        filled = sum(
            1 for slot in set_slots if slot["current_question"] is not None
        )
        pending = sum(
            1
            for slot in set_slots
            if slot["current_question"] is not None
            and slot["current_question"].get("status") == "pending_review"
        )
        approved = sum(
            1
            for slot in set_slots
            if slot["current_question"] is not None
            and slot["current_question"].get("status") == "approved"
        )

        responses.append(
            {
                "id": assessment_set.id,
                "question_set_id": assessment_set.question_set_id,
                "variant_number": assessment_set.variant_number,
                "label": assessment_set.label,
                "status": assessment_set.status,
                "review_status": assessment_set.status,
                "reviewer_id": assessment_set.reviewer_id,
                "reviewed_at": assessment_set.reviewed_at,
                "review_comment": assessment_set.review_comment,
                "review_checklist": assessment_set.review_checklist or {},
                "summary": {
                    "total_slots": total,
                    "filled_slots": filled,
                    "remaining_slots": max(total - filled, 0),
                    "pending_review": pending,
                    "approved": approved,
                    "ready_for_finalize": total > 0 and filled == total,
                },
                "slots": set_slots,
            }
        )

    return responses


def bootstrap_question_set(
    db: Session,
    question_set_id: int,
    user_id: int,
) -> dict:
    question_set = _get_question_set(
        db,
        question_set_id,
        user_id,
    )

    if int(
        getattr(
            question_set,
            "variant_count",
            2,
        )
    ) != 2:
        raise ValueError(
            "This assessment workflow requires exactly 2 sets: Set A and Set B."
        )

    sections = _section_rows(
        db,
        question_set_id,
    )

    if not sections:
        raise ValueError(
            "Configure at least one assessment section before creating sets."
        )

    all_skill_ids: set[int] = set()
    allocations: list[dict] = []

    for section in sections:
        section_type = str(
            section["section_type"]
            or "conceptual"
        ).strip().lower()

        if section_type not in VALID_SECTION_TYPES:
            raise ValueError(
                f"Section '{section['name']}' has unsupported type "
                f"'{section_type}'."
            )

        section_skills = _section_skill_rows(
            db,
            int(section["id"]),
        )

        # Sections are configured progressively. An unconfigured section must
        # not block bootstrap for other sections that already have valid,
        # positive allocations. Complete-blueprint validation is enforced before
        # a set can be submitted for review.
        if not section_skills:
            continue

        for allocation in section_skills:
            skill_id = int(
                allocation["skill_id"]
            )

            all_skill_ids.add(
                skill_id
            )

            counts = {
                "easy": max(
                    int(
                        allocation["easy_count"]
                        or 0
                    ),
                    0,
                ),
                "medium": max(
                    int(
                        allocation["medium_count"]
                        or 0
                    ),
                    0,
                ),
                "hard": max(
                    int(
                        allocation["hard_count"]
                        or 0
                    ),
                    0,
                ),
            }

            if sum(
                counts.values()
            ) <= 0:
                continue

            allocations.append(
                {
                    "section_id": int(
                        section["id"]
                    ),
                    "section_name": section[
                        "name"
                    ],
                    "section_type": section_type,
                    "skill_id": skill_id,
                    "counts": counts,
                }
            )

    if not allocations:
        raise ValueError(
            "No positive question allocations are configured in the "
            "assessment blueprint."
        )

    skills = _skill_map(
        db,
        all_skill_ids,
    )

    missing_skills = sorted(
        all_skill_ids
        - set(skills)
    )

    if missing_skills:
        raise ValueError(
            f"Skill(s) not found: "
            f"{', '.join(map(str, missing_skills))}."
        )

    existing_sets = {
        item.variant_number: item
        for item in (
            db.query(AssessmentSet)
            .filter(
                AssessmentSet.question_set_id
                == question_set_id
            )
            .order_by(
                AssessmentSet.variant_number.asc()
            )
            .all()
        )
    }

    try:
        for variant_number in (
            1,
            2,
        ):
            assessment_set = existing_sets.get(
                variant_number
            )

            if assessment_set is None:
                assessment_set = AssessmentSet(
                    question_set_id=question_set_id,
                    variant_number=variant_number,
                    label=(
                        f"Set "
                        f"{_label_for_variant(variant_number)}"
                    ),
                    status="draft",
                )

                db.add(
                    assessment_set
                )
                db.flush()

                existing_sets[
                    variant_number
                ] = assessment_set

            for allocation in allocations:
                for difficulty, count in (
                    allocation[
                        "counts"
                    ].items()
                ):
                    for slot_number in range(
                        1,
                        count + 1,
                    ):
                        exists = (
                            db.query(QuestionSlot)
                            .filter(
                                QuestionSlot.assessment_set_id
                                == assessment_set.id,
                                QuestionSlot.section_id
                                == allocation["section_id"],
                                QuestionSlot.skill_id
                                == allocation["skill_id"],
                                QuestionSlot.difficulty
                                == difficulty,
                                QuestionSlot.slot_number
                                == slot_number,
                            )
                            .first()
                        )

                        if exists is None:
                            db.add(
                                QuestionSlot(
                                    assessment_set_id=assessment_set.id,
                                    section_id=allocation[
                                        "section_id"
                                    ],
                                    skill_id=allocation[
                                        "skill_id"
                                    ],
                                    section_type=allocation[
                                        "section_type"
                                    ],
                                    difficulty=difficulty,
                                    slot_number=slot_number,
                                    preferred_question_type=(
                                        _default_question_type_for_section(
                                            allocation[
                                                "section_type"
                                            ]
                                        )
                                    ),
                                    status="empty",
                                )
                            )

        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()

        raise ValueError(
            "Unable to initialize the assessment sets and question slots."
        ) from exc

    sets = [
        existing_sets[number]
        for number in (
            1,
            2,
        )
    ]

    confirmed_skills = get_job_skills(
        db,
        question_set.job_id,
    )

    available_skills = [
        {
            "id": skill.id,
            "name": skill.name,
            "category": (
                getattr(
                    skill,
                    "category",
                    None,
                )
                or "Other"
            ),
        }
        for skill in confirmed_skills
    ]

    return {
        "question_set_id": question_set_id,
        "job_id": question_set.job_id,
        "name": question_set.name,
        "hiring_year": question_set.hiring_year,
        "variant_count": 2,
        "sections": sections,
        "available_skills": available_skills,
        "sets": [
            _set_response(
                db,
                item,
            )
            for item in sets
        ],
    }


def get_question_set_authoring_workspace(
    db: Session,
    question_set_id: int,
    user_id: int,
) -> dict:
    question_set = _get_question_set(
        db,
        question_set_id,
        user_id,
    )

    sets = (
        db.query(AssessmentSet)
        .filter(
            AssessmentSet.question_set_id
            == question_set.id
        )
        .order_by(
            AssessmentSet.variant_number.asc()
        )
        .all()
    )

    sections = _section_rows(
        db,
        question_set_id,
    )

    confirmed_skills = get_job_skills(
        db,
        question_set.job_id,
    )

    available_skills = [
        {
            "id": skill.id,
            "name": skill.name,
            "category": (
                getattr(
                    skill,
                    "category",
                    None,
                )
                or "Other"
            ),
        }
        for skill in confirmed_skills
    ]

    # A brand-new draft has three empty sections and no assessment sets yet.
    # Return its editable blueprint instead of trying to create Sets A/B before
    # any positive skill allocations exist. Once at least one section has a
    # positive allocation, bootstrap the two sets and create slots only for the
    # configured allocations; the manager can configure the remaining sections
    # later and bootstrap again to add their slots.
    if len(sets) < 2:
        has_positive_allocations = any(
            sum(
                max(int(allocation.get(f"{difficulty}_count") or 0), 0)
                for difficulty in ("easy", "medium", "hard")
            ) > 0
            for section in sections
            for allocation in _section_skill_rows(
                db,
                int(section["id"]),
            )
        )

        if has_positive_allocations:
            return bootstrap_question_set(
                db,
                question_set_id,
                user_id,
            )

    return {
        "question_set_id": question_set.id,
        "job_id": question_set.job_id,
        "name": question_set.name,
        "hiring_year": question_set.hiring_year,
        "variant_count": 2,
        "sections": sections,
        "available_skills": available_skills,
        "sets": _workspace_set_responses_bulk(
            db=db,
            assessment_sets=sets,
            sections=sections,
        ),
    }


def get_assessment_set(
    db: Session,
    assessment_set_id: int,
    user_id: int,
) -> dict:
    assessment_set = db.get(
        AssessmentSet,
        assessment_set_id,
    )

    if assessment_set is None:
        raise ValueError(
            "Assessment set not found."
        )

    _get_question_set(
        db,
        assessment_set.question_set_id,
        user_id,
    )

    return _set_response(
        db,
        assessment_set,
    )


def _get_assigned_assessment_reviewer(
    db: Session,
    job_id: int,
) -> dict:
    """Return the single Assessment Reviewer assigned to the job.

    Reviewer assignment is currently represented by JobAssessmentAccess plus
    the user's ``assessment_reviewer`` role. We keep this lookup read-only here
    so the existing job-access model and its RBAC behavior remain unchanged.
    """
    rows = db.execute(
        text(
            """
            SELECT
                u.id,
                u.username,
                u.email
            FROM users u
            JOIN job_assessment_access jaa
              ON jaa.user_id = u.id
            WHERE jaa.job_id = :job_id
              AND u.role = 'assessment_reviewer'
            ORDER BY jaa.created_at ASC, u.id ASC
            """
        ),
        {
            "job_id": job_id,
        },
    ).mappings().all()

    if not rows:
        raise ValueError(
            "No Assessment Reviewer is assigned to this job."
        )

    if len(rows) > 1:
        raise ValueError(
            "Multiple Assessment Reviewers are assigned to this job. "
            "Assign exactly one reviewer before submitting the set."
        )

    row = rows[0]

    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
    }


def _validate_sections_for_review(
    db: Session,
    question_set_id: int,
) -> None:
    """Require a positive skill allocation in every section before review."""
    sections = _section_rows(
        db,
        question_set_id,
    )

    if not sections:
        raise ValueError(
            "Configure at least one assessment section before submitting for review."
        )

    for section in sections:
        section_type = str(
            section.get("section_type") or "conceptual"
        ).strip().lower()

        if section_type not in VALID_SECTION_TYPES:
            raise ValueError(
                f"Section '{section['name']}' has unsupported type "
                f"'{section_type}'."
            )

        allocations = _section_skill_rows(
            db,
            int(section["id"]),
        )

        if not allocations:
            raise ValueError(
                f"Section '{section['name']}' must contain at least one "
                "skill allocation before the assessment can be submitted for review."
            )

        requested_questions = sum(
            max(int(allocation.get(f"{difficulty}_count") or 0), 0)
            for allocation in allocations
            for difficulty in ("easy", "medium", "hard")
        )

        if requested_questions <= 0:
            raise ValueError(
                f"Section '{section['name']}' must contain at least one requested "
                "question before the assessment can be submitted for review."
            )


def submit_assessment_set_for_review(
    db: Session,
    assessment_set_id: int,
    user_id: int,
) -> dict:
    """Submit one concrete AssessmentSet to its assigned reviewer.

    This is intentionally scoped to one variant. It never changes the
    QuestionSet status and never changes the status of the other variant.
    """
    assessment_set = db.get(
        AssessmentSet,
        assessment_set_id,
    )

    if assessment_set is None:
        raise ValueError(
            "Assessment set not found."
        )

    question_set = _get_question_set(
        db,
        assessment_set.question_set_id,
        user_id,
    )

    if assessment_set.status not in {
        "draft",
        "rejected",
    }:
        raise ValueError(
            "Only draft or rejected assessment sets can be submitted for review."
        )

    # Draft sets may be created from a partial blueprint to enable incremental
    # authoring, but every semantic section must be configured before review.
    _validate_sections_for_review(
        db,
        question_set.id,
    )

    slots = (
        db.query(QuestionSlot)
        .filter(
            QuestionSlot.assessment_set_id
            == assessment_set.id
        )
        .order_by(
            QuestionSlot.section_id.asc(),
            QuestionSlot.skill_id.asc(),
            QuestionSlot.difficulty.asc(),
            QuestionSlot.slot_number.asc(),
        )
        .all()
    )

    if not slots:
        raise ValueError(
            "This assessment set has no question slots and cannot be "
            "submitted for review."
        )

    missing_slots = [
        slot.slot_number
        for slot in slots
        if slot.current_question_id is None
    ]

    if missing_slots:
        missing_display = ", ".join(
            f"#{number}"
            for number in missing_slots[:10]
        )

        suffix = (
            ""
            if len(missing_slots) <= 10
            else "..."
        )

        raise ValueError(
            "Every question slot must contain a question before the set can "
            "be submitted for review. Missing slots: "
            f"{missing_display}{suffix}"
        )

    rejected_slots = []

    for slot in slots:
        question = slot.current_question

        if (
            question is not None
            and str(
                question.status or ""
            ).strip().lower()
            == "rejected"
        ):
            rejected_slots.append(
                slot.slot_number
            )

    if rejected_slots:
        rejected_display = ", ".join(
            f"#{number}"
            for number in rejected_slots[:10]
        )

        suffix = (
            ""
            if len(rejected_slots) <= 10
            else "..."
        )

        raise ValueError(
            "Rejected questions must be replaced or revised before the set can "
            "be submitted for review. Affected slots: "
            f"{rejected_display}{suffix}"
        )

    reviewer = _get_assigned_assessment_reviewer(
        db,
        question_set.job_id,
    )

    assessment_set.status = "submitted_for_review"
    assessment_set.reviewer_id = None
    assessment_set.reviewed_at = None
    assessment_set.review_comment = None
    assessment_set.review_checklist = {}

    try:
        db.commit()
        db.refresh(
            assessment_set
        )

    except SQLAlchemyError as exc:
        db.rollback()

        raise ValueError(
            "Unable to submit the assessment set for review."
        ) from exc

    return {
        **_set_response(
            db,
            assessment_set,
        ),
        "message": (
            f"{assessment_set.label} was submitted successfully "
            "for review."
        ),
        "assigned_reviewer": reviewer,
    }


def _get_next_attempt_number(
    db: Session,
    slot_id: int,
) -> int:
    latest = (
        db.query(
            QuestionGenerationAttempt
        )
        .filter(
            QuestionGenerationAttempt.question_slot_id
            == slot_id
        )
        .order_by(
            QuestionGenerationAttempt.attempt_number.desc()
        )
        .first()
    )

    return (
        int(latest.attempt_number) + 1
        if latest
        else 1
    )


def _get_excluded_question_texts(
    db: Session,
    slot: QuestionSlot,
    question_set: QuestionSet,
) -> list[str]:
    texts: list[str] = []

    attempts = (
        db.query(
            QuestionGenerationAttempt.question_text
        )
        .filter(
            QuestionGenerationAttempt.question_slot_id
            == slot.id,
            QuestionGenerationAttempt.question_text.is_not(
                None
            ),
        )
        .order_by(QuestionGenerationAttempt.attempt_number.desc())
        .all()
    )

    texts.extend(
        row[0]
        for row in attempts
        if row[0]
    )

    slots = (
        db.query(QuestionSlot)
        .join(
            AssessmentSet,
            AssessmentSet.id
            == QuestionSlot.assessment_set_id,
        )
        .filter(
            AssessmentSet.question_set_id
            == question_set.id
        )
        .all()
    )

    current_ids = [
        item.current_question_id
        for item in slots
        if item.current_question_id
    ]

    if current_ids:
        texts.extend(
            row[0]
            for row in (
                db.query(
                    Question.question_text
                )
                .filter(
                    Question.id.in_(
                        current_ids
                    )
                )
                .all()
            )
            if row[0]
        )

    bank_questions = (
        db.query(
            Question.question_text
        )
        .outerjoin(
            QuestionBank,
            Question.question_bank_id
            == QuestionBank.id,
        )
        .filter(
            Question.skill_id
            == slot.skill_id,
            Question.difficulty
            == slot.difficulty,
            Question.section_type
            == slot.section_type,
            (
                (
                    (
                        QuestionBank.job_id
                        == question_set.job_id
                    )
                    & (
                        QuestionBank.hiring_year
                        == question_set.hiring_year
                    )
                )
                | Question.question_bank_id.is_(None)
            ),
        )
        .limit(250)
        .all()
    )

    texts.extend(
        row[0]
        for row in bank_questions
        if row[0]
    )

    unique: list[str] = []
    seen: set[str] = set()

    for value in texts:
        key = _normalize_question_text(
            value
        )

        if key and key not in seen:
            seen.add(
                key
            )
            unique.append(
                value
            )

    return unique


def _validate_candidate_against_slot(
    generated,
    slot: QuestionSlot,
    skill: Skill,
    excluded_texts: list[str],
    skill_category: str = "technical",
    job_title: str | None = None,
    job_description: str | None = None,
) -> tuple[bool, list[str]]:
    errors: list[str] = []

    if str(skill_category or "").strip().lower() == "non_technical":
        question_text = str(getattr(generated, "question_text", "") or "")
        stem_leakage = find_non_technical_domain_leakage(
            question_text,
            job_title=job_title,
            job_description=job_description,
        )
        candidate_material = "\n".join(
            [
                question_text,
                *(getattr(generated, "options", None) or []),
                str(getattr(generated, "correct_answer", "") or ""),
                str(getattr(generated, "explanation", "") or ""),
            ]
        )
        material_leakage = find_non_technical_domain_leakage(
            candidate_material,
            job_title=job_title,
            job_description=job_description,
        )
        leakage = list(dict.fromkeys(stem_leakage + material_leakage))
        if leakage:
            errors.append(
                "Generated question is outside the confirmed non-technical role domain: "
                + ", ".join(leakage)
                + "."
            )

    if (
        generated.skill_name.strip().lower()
        != skill.name.strip().lower()
    ):
        errors.append(
            "Generated question skill does not match the target slot."
        )

    if (
        generated.difficulty.strip().lower()
        != slot.difficulty
    ):
        errors.append(
            "Generated question difficulty does not match the target slot."
        )

    if (
        generated.section_type.strip().lower()
        != slot.section_type
    ):
        errors.append(
            "Generated question section does not match the target slot."
        )

    key = _normalize_question_text(
        generated.question_text
    )

    for existing in excluded_texts:
        if key == _normalize_question_text(
            existing
        ):
            errors.append(
                "Generated question duplicates an existing question."
            )
            break

        ratio = SequenceMatcher(
            None,
            key,
            _normalize_question_text(
                existing
            ),
        ).ratio()

        if ratio >= 0.92:
            errors.append(
                "Generated question is too similar to an existing question."
            )
            break

    return not errors, errors


def _get_pattern_reference_questions(
    db: Session,
    slot: QuestionSlot,
    question_set: QuestionSet,
    previous_question: Question | None,
    limit: int = 3,
) -> list[str]:
    """Return recent exemplar questions for pattern/style guidance, not content copying."""
    examples: list[str] = []

    if (
        previous_question
        and previous_question.question_text
    ):
        examples.append(
            previous_question.question_text
        )

    attempts = (
        db.query(
            QuestionGenerationAttempt.question_text
        )
        .filter(
            QuestionGenerationAttempt.question_slot_id
            == slot.id,
            QuestionGenerationAttempt.status.in_(
                [
                    "generated",
                    "accepted",
                ]
            ),
            QuestionGenerationAttempt.question_text.is_not(
                None
            ),
        )
        .order_by(
            QuestionGenerationAttempt.attempt_number.desc()
        )
        .limit(
            limit * 2
        )
        .all()
    )

    examples.extend(
        row[0]
        for row in attempts
        if row[0]
    )

    current_slots = (
        db.query(QuestionSlot)
        .join(
            AssessmentSet,
            AssessmentSet.id
            == QuestionSlot.assessment_set_id,
        )
        .filter(
            AssessmentSet.question_set_id
            == question_set.id,
            QuestionSlot.id != slot.id,
            QuestionSlot.section_id
            == slot.section_id,
            QuestionSlot.skill_id
            == slot.skill_id,
            QuestionSlot.difficulty
            == slot.difficulty,
        )
        .order_by(
            QuestionSlot.updated_at.desc(),
            QuestionSlot.id.desc(),
        )
        .limit(
            limit * 2
        )
        .all()
    )

    for item in current_slots:
        question = item.current_question

        if (
            question
            and question.question_text
        ):
            examples.append(
                question.question_text
            )

    unique: list[str] = []
    seen: set[str] = set()

    for item in examples:
        normalized = " ".join(
            str(item).strip().split()
        )

        key = normalized.lower()

        if (
            normalized
            and key not in seen
        ):
            seen.add(
                key
            )
            unique.append(
                normalized
            )

        if len(unique) >= limit:
            break

    return unique


def generate_slot_question(
    db: Session,
    slot_id: int,
    user_id: int,
    manager_prompt: str | None = None,
    generation_strategy: str = "balanced",
    generation_focus: str = "auto",
) -> dict:
    """Generate one durable AI candidate for a slot without replacing its current question."""

    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    if slot.status in {
        "locked",
        "finalized",
    }:
        raise ValueError(
            "This question slot is locked and cannot be regenerated."
        )

    skills = {
        skill.id: skill
        for skill in get_job_skills(
            db,
            question_set.job_id,
        )
    }

    skill = skills.get(
        slot.skill_id
    )

    if skill is None:
        raise ValueError(
            "Target skill is not part of the confirmed job skill scope."
        )

    role_context = _get_job_skill_generation_context(
        db,
        question_set.job_id,
        skill.id,
    )

    previous_question_id = slot.current_question_id

    previous_question = (
        db.get(
            Question,
            previous_question_id,
        )
        if previous_question_id
        else None
    )

    attempt = QuestionGenerationAttempt(
        question_slot_id=slot.id,
        attempt_number=_get_next_attempt_number(
            db,
            slot.id,
        ),
        status="generating",
        skill_id=slot.skill_id,
        difficulty=slot.difficulty,
        section_type=slot.section_type,
        provider=str(
            getattr(
                settings,
                "llm_provider",
                "gemini",
            )
            or "gemini"
        ).strip().lower(),
        request_id=str(
            uuid4()
        ),
        previous_question_id=previous_question_id,
        created_by=user_id,
    )

    db.add(
        attempt
    )

    db.commit()
    db.refresh(
        attempt
    )

    excluded_texts = _get_excluded_question_texts(
        db,
        slot,
        question_set,
    )

    pattern_examples = _get_pattern_reference_questions(
        db,
        slot,
        question_set,
        previous_question,
    )

    try:
        # The LLM service already retries once for malformed/invalid output.
        # Do not wrap it in another three-call retry loop: that made one click
        # potentially execute multiple model calls and left the UI in "Generating"
        # for an unnecessarily long time.
        generated_items = generate_questions_from_skills(
            skills=[
                {
                    "skill_id": skill.id,
                    "skill_name": skill.name,
                    "category": role_context["prompt_skill_category"],
                }
            ],
            number_of_questions=1,
            difficulty=slot.difficulty,
            excluded_question_texts=excluded_texts,
            regeneration_mode=bool(
                previous_question
                or excluded_texts
            ),
            section_type=slot.section_type,
            question_type=_slot_question_type(
                slot
            ),
            reference_question_text=(
                previous_question.question_text
                if previous_question
                else None
            ),
            pattern_reference_question_texts=pattern_examples,
            manager_prompt=manager_prompt,
            generation_strategy=generation_strategy,
            generation_focus=generation_focus,
            experience_required=role_context["experience_required"],
            skill_category=str(role_context["skill_category"] or "technical"),
            job_title=role_context["job_title"],
            job_description=role_context["job_description"],
        )

        if not generated_items:
            raise ValueError(
                "AI returned no question candidate."
            )

        candidate = generated_items[0]

        valid, validation_errors = (
            _validate_candidate_against_slot(
                candidate,
                slot,
                skill,
                excluded_texts,
                skill_category=str(role_context["skill_category"] or "technical"),
                job_title=role_context["job_title"],
                job_description=role_context["job_description"],
            )
        )

        if not valid:
            raise ValueError(
                "AI candidate failed slot validation: "
                + " ".join(
                    validation_errors
                )
            )

        attempt.status = "generated"
        attempt.question_text = candidate.question_text
        attempt.question_type = candidate.question_type
        attempt.section_type = candidate.section_type
        attempt.skill_id = skill.id
        attempt.difficulty = candidate.difficulty
        attempt.options = candidate.options
        attempt.correct_answer = candidate.correct_answer
        attempt.explanation = candidate.explanation
        attempt.validation_status = "passed"
        attempt.validation_errors = None
        attempt.error_message = None
        attempt.completed_at = utc_now()

        db.commit()
        db.refresh(
            attempt
        )

        return {
            "attempt": _attempt_response(
                attempt
            ),
            "slot": _slot_response(
                db,
                slot,
            ),
        }

    except (
        LLMServiceError,
        ValueError,
    ) as exc:
        attempt.status = "failed"
        attempt.validation_status = "failed"
        attempt.validation_errors = [
            str(exc)
        ]
        attempt.error_message = str(
            exc
        )
        attempt.completed_at = utc_now()

        db.commit()

        raise


def _infer_generation_pattern(
    question_text: str | None,
    options: list[str] | None = None,
) -> str:
    """Provide a conservative, deterministic label for authoring filters.

    The previous implementation classified ordinary English words such as
    ``from`` and ``where`` as SQL. That made unrelated questions appear under
    the SQL filter. The classifier now looks for combinations of SQL-specific
    syntax/terms and uses stronger signals for the other authoring patterns.
    """
    text_value = " ".join(
        str(question_text or "")
        .strip()
        .casefold()
        .split()
    )

    option_text = " ".join(
        str(item or "")
        .strip()
        .casefold()
        for item in (
            options or []
        )
    )

    combined = f" {text_value} "

    sql_specific_terms = (
        " sql ",
        " postgresql ",
        " mysql ",
        " sqlite ",
        " oracle sql ",
        " sql query ",
        " sql statement ",
        " insert into ",
        " update ",
        " delete from ",
        " create table ",
        " alter table ",
        " drop table ",
        " truncate table ",
        " group by ",
        " order by ",
        " having ",
        " union ",
        " inner join ",
        " left join ",
        " right join ",
        " full join ",
        " cross join ",
    )

    sql_select_shape = (
        (
            combined.startswith("select ")
            or " select " in combined
        )
        and any(
            token in combined
            for token in (
                " from ",
                " where ",
                " join ",
                " group by ",
                " order by ",
                " having ",
                " limit ",
            )
        )
    )

    if (
        any(
            token in combined
            for token in sql_specific_terms
        )
        or sql_select_shape
    ):
        return "SQL"

    debugging_signals = (
        " debug ",
        " debugging ",
        " bug ",
        " error ",
        " exception ",
        " traceback ",
        " failure ",
        " fails ",
        " failed ",
        " fault ",
        " root cause ",
        " memory leak ",
        " segmentation fault ",
        " out-of-memory ",
        " out of memory ",
        " timeout ",
        " crash ",
        " crashes ",
        " incorrect result ",
        " non-deterministic ",
        " nondeterministic ",
        " not working ",
        " fix the ",
        " how should it be fixed ",
        " how should this be fixed ",
    )

    if any(
        token in combined
        for token in debugging_signals
    ):
        return "Debugging"

    output_signals = (
        "what will this print",
        "what does this print",
        "what will be printed",
        "predict the output",
        "what is the output",
        "what will it return",
        "what does this return",
        "console output",
        "printed output",
    )

    code_signals = (
        "```",
        " def ",
        " async def ",
        " function(",
        " traceback",
        " stack trace",
    )

    if (
        any(
            token in combined
            for token in output_signals
        )
        and any(
            token in combined
            for token in code_signals
        )
    ):
        return "Output prediction"

    code_signals_general = (
        "code snippet",
        "given the following code",
        "following code",
        "read the code",
        "code-based",
        "code based",
        "implement ",
        "implementation",
        " ```",
        " def ",
        " async def ",
        " function(",
    )

    if any(
        token in combined
        for token in code_signals_general
    ):
        return "Code interpretation"

    if any(
        token in combined
        for token in (
            " compare ",
            " comparison ",
            " difference between ",
            " distinguish ",
            " versus ",
            " vs. ",
            " vs ",
        )
    ):
        return "Comparison"

    scenario_signals = (
        " scenario ",
        " scenario-based ",
        " real-world ",
        " production ",
        " suppose ",
        " consider a system ",
        " a developer ",
        " an engineer ",
        " a service ",
        " an application ",
        " a system ",
    )

    decision_signals = (
        " what should ",
        " which approach ",
        " which option ",
        " best action ",
        " best next step ",
        " most appropriate ",
        " how should ",
        " what would you do ",
        " how would you ",
    )

    if (
        any(
            token in combined
            for token in scenario_signals
        )
        and any(
            token in combined
            for token in decision_signals
        )
    ):
        return "Scenario"

    if any(
        token in combined
        for token in (
            " design ",
            " architecture ",
            " trade-off ",
            " tradeoff ",
            " system design ",
        )
    ):
        return "Design / reasoning"

    if any(
        token in combined
        for token in (
            " why ",
            " purpose ",
            " principle ",
            " what is ",
            " which best describes ",
        )
    ):
        return "Concept / principle"

    return "Applied reasoning"


def generate_slot_question_batch(
    db: Session,
    slot_id: int,
    user_id: int,
    count: int = 5,
    manager_prompt: str | None = None,
    generation_strategy: str = "balanced",
    generation_focus: str = "auto",
    progress_callback=None,
) -> dict:
    """Generate and persist a batch of independent AI candidates for one slot.

    The public API accepts up to 50 candidates. Groq generation is kept
    reliable by splitting larger requests into small internal chunks while
    validating the complete batch against the same duplicate/context pool.

    Successful chunks are committed progressively so a later provider
    quota/connection failure cannot roll back candidates that were already
    generated successfully.
    """

    progress_state = {"generated_count": 0}

    def report_progress(stage, message):
        if not callable(progress_callback):
            return
        try:
            progress_callback({
                "stage": stage,
                "message": message,
                "generated_count": progress_state["generated_count"],
                "requested_count": count,
            })
        except Exception:
            # UI reporting must never interrupt question generation.
            pass

    report_progress("planning", "Preparing assessment requirements")
    if (
        not isinstance(count, int)
        or count < 1
        or count > 50
    ):
        raise ValueError(
            "Batch size must be between 1 and 50 questions."
        )

    normalized_strategy = str(
        generation_strategy or "balanced"
    ).strip().lower()

    if normalized_strategy not in {
        "pattern",
        "balanced",
        "current",
    }:
        raise ValueError(
            "Generation strategy must be pattern, balanced, or current."
        )

    normalized_focus = str(
        generation_focus or "auto"
    ).strip().lower()

    if normalized_focus not in {
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
    }:
        raise ValueError(
            "Generation focus must be auto, scenario, comparison, "
            "code, output, debugging, sql, design, or applied."
        )

    normalized_manager_prompt = None

    if manager_prompt is not None:
        normalized_manager_prompt = " ".join(
            str(
                manager_prompt
            ).strip().split()
        )

        if len(
            normalized_manager_prompt
        ) > 1200:
            raise ValueError(
                "Manager generation guidance must be 1200 characters or fewer."
            )

        if not normalized_manager_prompt:
            normalized_manager_prompt = None

    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    if slot.status in {
        "locked",
        "finalized",
    }:
        raise ValueError(
            "This question slot is locked and cannot be generated."
        )

    skills = {
        skill.id: skill
        for skill in get_job_skills(
            db,
            question_set.job_id,
        )
    }

    skill = skills.get(
        slot.skill_id
    )

    if skill is None:
        raise ValueError(
            "Target skill is not part of the confirmed job skill scope."
        )

    role_context = _get_job_skill_generation_context(
        db,
        question_set.job_id,
        skill.id,
    )

    manager_interpretation = None

    if normalized_manager_prompt:
        try:
            manager_interpretation = (
                interpret_manager_prompt(
                    normalized_manager_prompt,
                    slot_difficulty=slot.difficulty,
                    section_type=slot.section_type,
                    question_type=_slot_question_type(
                        slot
                    ),
                    batch_count=count,
                )
            )

        except ManagerPromptServiceError as exc:
            raise LLMServiceError(
                "Manager guidance could not be interpreted: "
                f"{exc}"
            ) from exc

    previous_question_id = slot.current_question_id

    previous_question = (
        db.get(
            Question,
            previous_question_id,
        )
        if previous_question_id
        else None
    )

    excluded_texts = _get_excluded_question_texts(
        db,
        slot,
        question_set,
    )

    pattern_examples = _get_pattern_reference_questions(
        db,
        slot,
        question_set,
        previous_question,
    )

    # Resolve the requested focus before planning so the planner always receives
    # a defined value. The planner may further refine "auto" from manager guidance.
    effective_generation_focus = normalized_focus

    # For multi-question generation, create one semantic plan per candidate before
    # asking the LLM to write the questions. The planner is skill-agnostic and uses
    # the manager guidance plus existing questions to choose distinct targets.
    generation_plans = []

    report_progress("planning", f"Planning {count} question targets")

    if count > 1:
        try:
            generation_plans = plan_question_batch(
                skill_name=skill.name,
                section_type=slot.section_type,
                difficulty=slot.difficulty,
                question_type=_slot_question_type(
                    slot
                ),
                count=count,
                manager_prompt=normalized_manager_prompt,
                generation_focus=effective_generation_focus,
                manager_interpretation=manager_interpretation,
                experience_required=role_context["experience_required"],
                skill_category=str(role_context["skill_category"] or "technical"),
                job_title=role_context["job_title"],
                job_description=role_context["job_description"],
                reference_question_text=(
                    previous_question.question_text
                    if previous_question
                    else None
                ),
                pattern_reference_question_texts=pattern_examples,
                excluded_question_texts=excluded_texts,
            )

        except QuestionGenerationPlannerError as exc:
            raise LLMServiceError(
                "Question planning failed while creating distinct assessment "
                "targets. Planner error: "
                f"{exc}"
            ) from exc

    report_progress("generating", "Preparing question drafts")

    batch_request_id = str(
        uuid4()
    )

    persisted_attempts: list[
        QuestionGenerationAttempt
    ] = []

    accepted_for_validation = list(
        excluded_texts
    )
    recent_batch_question_texts: list[str] = []

    # One generated question is paired with one semantic plan. Without plans we
    # retain the existing batch size.
    chunk_size = (
        1
        if generation_plans
        else min(
            2,
            QUESTION_BATCH_HARD_LIMIT,
        )
    )

    zero_valid_recovery_rounds = 0
    last_validation_errors: list[str] = []
    rejected_count = 0
    provider_error: str | None = None
    max_generation_rounds = max(
        12,
        count * 2,
    )

    try:
        remaining = count
        chunk_number = 0

        while (
            remaining > 0
            and chunk_number < max_generation_rounds
        ):
            chunk_number += 1
            request_count = min(
                chunk_size,
                remaining,
            )

            recovery_mode = (
                zero_valid_recovery_rounds > 0
            )

            recovery_reference_examples = (
                []
                if recovery_mode
                else pattern_examples
            )

            recovery_reference_question = (
                None
                if recovery_mode
                else (
                    previous_question.question_text
                    if previous_question
                    else None
                )
            )

            recovery_prefix = (
                "RECOVERY MODE: Previous model output was rejected because it "
                "repeated or duplicated existing assessment content. Do not use "
                "the reference question wording, structure, scenario, or knowledge "
                "target as content. Create genuinely new content now.\n"
                if recovery_mode
                else ""
            )

            current_generation_plan = (
                generation_plans[
                    chunk_number - 1
                ]
                if (
                    generation_plans
                    and chunk_number <= len(
                        generation_plans
                    )
                )
                else None
            )

            # Once a semantic plan exists, its pattern is the effective generation
            # focus. This keeps the writer aligned with the planner instead of
            # sending an independently selected frontend focus that could conflict
            # with a slot-level hard pattern.
            effective_generation_focus = (
                str(
                    current_generation_plan.pattern
                ).strip().lower()
                if current_generation_plan
                is not None
                else normalized_focus
            )

            try:
                report_progress("generating", f"Generating candidate {progress_state['generated_count'] + 1} of {count}")
                generated_items = (
                    generate_questions_from_skills(
                        skills=[
                            {
                                "skill_id": skill.id,
                                "skill_name": skill.name,
                                "category": role_context["prompt_skill_category"],
                            }
                        ],
                        number_of_questions=request_count,
                        difficulty=slot.difficulty,
                        # Keep the prompt compact, but prioritize the most recent
                        # generated attempts and questions already created in this batch.
                        # Previously the tail of accepted_for_validation was dominated
                        # by question-bank rows, so recent draft candidates often never
                        # reached the model and their stem patterns were repeated.
                        excluded_question_texts=list(dict.fromkeys([
                            *recent_batch_question_texts[-4:],
                            *excluded_texts[:8],
                        ])),
                        regeneration_mode=bool(
                            previous_question
                            or accepted_for_validation
                        ),
                        section_type=slot.section_type,
                        question_type=_slot_question_type(
                            slot
                        ),
                        reference_question_text=(
                            recovery_reference_question
                        ),
                        pattern_reference_question_texts=(
                            recovery_reference_examples
                        ),
                        manager_prompt=(
                            normalized_manager_prompt
                        ),
                        generation_strategy=(
                            normalized_strategy
                        ),
                        generation_focus=(
                            effective_generation_focus
                        ),
                        generation_plan=(
                            current_generation_plan
                        ),
                        experience_required=role_context["experience_required"],
                        skill_category=str(role_context["skill_category"] or "technical"),
                        job_title=role_context["job_title"],
                        job_description=role_context["job_description"],
                        variation_instruction=(
                            recovery_prefix
                            + (
                                build_generation_variation_instruction(
                                    manager_prompt=(
                                        normalized_manager_prompt
                                    ),
                                    generation_focus=(
                                        normalized_focus
                                    ),
                                    variation_start_index=len(
                                        persisted_attempts
                                    ),
                                    variation_count=request_count,
                                    skill_name=skill.name,
                                )
                                if current_generation_plan
                                is None
                                else (
                                    "Use the supplied semantic question plan as "
                                    "the diversity target; do not substitute "
                                    "another target."
                                )
                            )
                        ),
                    )
                )

            except LLMResponseError as exc:
                # Validation/model-response failures are recoverable within the
                # current batch and keep the existing retry/recovery behavior.
                rejected_count += request_count
                last_validation_errors.append(
                    str(exc)
                )
                zero_valid_recovery_rounds += 1
                continue

            except (
                LLMQuotaError,
                LLMConnectionError,
            ) as exc:
                # Provider/transient failures are different from validation
                # failures. Do not roll back candidates already committed by
                # earlier successful chunks.
                provider_error = str(
                    exc
                )

                print(
                    "[QUESTION_GENERATION_PROVIDER_ERROR] "
                    f"{provider_error}",
                    flush=True,
                )

                last_validation_errors.append(
                    provider_error
                )

                break

            report_progress("validating", "Checking drafts against assessment validation rules")
            valid_items_this_chunk = 0
            # Serialize attempt numbering for concurrent jobs on this slot.
            db.query(QuestionSlot).filter(
                QuestionSlot.id == slot.id
            ).with_for_update().one()
            next_attempt_number = _get_next_attempt_number(db, slot.id)

            for candidate in list(generated_items)[:request_count]:
                if candidate.question_text:
                    recent_batch_question_texts.append(
                        candidate.question_text
                    )

                valid, _validation_errors = (
                    _validate_candidate_against_slot(
                        candidate,
                        slot,
                        skill,
                        accepted_for_validation,
                        skill_category=str(role_context["skill_category"] or "technical"),
                        job_title=role_context["job_title"],
                        job_description=role_context["job_description"],
                    )
                )

                if not valid:
                    rejected_count += 1
                    last_validation_errors.extend(
                        _validation_errors
                    )

                    # Keep rejected text out of subsequent generations too.
                    # This prevents a local/model provider from repeatedly
                    # returning the same invalid candidate after a validation
                    # failure.
                    if candidate.question_text:
                        accepted_for_validation.append(
                            candidate.question_text
                        )

                    continue

                attempt_number = next_attempt_number + valid_items_this_chunk

                attempt_index = (
                    len(
                        persisted_attempts
                    )
                    + 1
                )

                attempt = QuestionGenerationAttempt(
                    question_slot_id=slot.id,
                    attempt_number=attempt_number,
                    status="generated",
                    skill_id=skill.id,
                    difficulty=slot.difficulty,
                    section_type=slot.section_type,
                    provider=str(
                        getattr(
                            settings,
                            "llm_provider",
                            "gemini",
                        )
                        or "gemini"
                    ).strip().lower(),
                    request_id=(
                        f"{batch_request_id}:chunk-"
                        f"{chunk_number}:candidate-"
                        f"{attempt_index}"
                    ),
                    previous_question_id=previous_question_id,
                    created_by=user_id,
                    question_text=candidate.question_text,
                    question_type=candidate.question_type,
                    options=candidate.options,
                    correct_answer=candidate.correct_answer,
                    explanation=candidate.explanation,
                    pattern=(
                        _generation_pattern_label(
                            current_generation_plan.pattern
                        )
                        if current_generation_plan
                        is not None
                        else None
                    ),
                    validation_status="passed",
                    validation_errors=None,
                    error_message=None,
                    completed_at=utc_now(),
                )

                db.add(
                    attempt
                )
                db.flush()

                persisted_attempts.append(
                    attempt
                )

                accepted_for_validation.append(
                    candidate.question_text
                )

                valid_items_this_chunk += 1

            # B6: make each successful chunk durable immediately. A later
            # provider failure must not erase candidates from previous chunks.
            if valid_items_this_chunk > 0:
                report_progress("saving", "Saving validated candidates")
                db.commit()
                progress_state["generated_count"] = len(persisted_attempts)
                report_progress("generating", f"Saved {progress_state['generated_count']} of {count}; continuing")

            remaining = (
                count
                - len(
                    persisted_attempts
                )
            )

            # A zero-valid chunk is recoverable. Keep trying until the bounded
            # generation-round budget is exhausted. This is what makes Generate 10
            # mean "keep working toward 10" instead of "stop after three misses".
            if valid_items_this_chunk == 0:
                zero_valid_recovery_rounds += 1
                continue

            zero_valid_recovery_rounds = 0

        # Preserve the final commit for any remaining transaction state.
        db.commit()

        for attempt in persisted_attempts:
            db.refresh(
                attempt
            )

        generated_count = len(
            persisted_attempts
        )

        shortfall = max(
            count - generated_count,
            0,
        )

        reason = "; ".join(
            dict.fromkeys(
                last_validation_errors[:4]
            )
        )

        report_progress("preparing_review", "Preparing saved candidates for human review")
        response = {
            "generation_batch_id": batch_request_id,
            "requested_count": count,
            "generated_count": generated_count,
            "shortfall": shortfall,
            "rejected_count": rejected_count,
            "manager_prompt": normalized_manager_prompt,
            "generation_strategy": normalized_strategy,
            "generation_focus": normalized_focus,
            "attempts": [
                _attempt_response(
                    attempt
                )
                for attempt in persisted_attempts
            ],
            "slot": _slot_response(
                db,
                slot,
            ),
        }

        if provider_error:
            response["warning"] = (
                f"Generated {generated_count} of {count} requested candidates "
                "before generation stopped because the LLM provider could not "
                "continue this batch."
            )

            response["generation_feedback"] = (
                provider_error
            )

        elif shortfall:
            response["warning"] = (
                f"Generated {generated_count} of {count} requested candidates "
                f"after {max_generation_rounds} generation rounds. Only "
                "validated candidates were kept; generate again to continue."
            )

            if reason:
                response["validation_feedback"] = reason

        return response

    except (
        LLMServiceError,
        ValueError,
    ):
        # Genuine application/data errors still roll back the current
        # uncommitted transaction. Previously committed successful chunks
        # remain durable.
        db.rollback()
        raise


def _create_question_from_candidate(
    db: Session,
    question_set: QuestionSet,
    slot: QuestionSlot,
    question_text: str,
    question_type: str,
    options: list[str] | None,
    correct_answer: str | None,
    explanation: str | None,
    source: str,
    created_by: int,
) -> Question:
    if question_type not in {
        "MCQ",
        "FREE_TEXT",
    }:
        raise ValueError(
            "Question type must be MCQ or FREE_TEXT."
        )

    expected_type = _slot_question_type(
        slot
    )

    if question_type != expected_type:
        raise ValueError(
            f"{slot.section_type} slots require question type "
            f"{expected_type}."
        )

    normalized_text = " ".join(
        question_text.strip().split()
    )

    if not normalized_text:
        raise ValueError(
            "Question text cannot be empty."
        )

    if question_type == "MCQ":
        clean_options = [
            " ".join(
                (item or "").strip().split()
            )
            for item in (
                options or []
            )
            if (
                (item or "").strip()
            )
        ]

        if len(clean_options) < 4:
            raise ValueError(
                "MCQ questions must contain at least four options."
            )

        if len(
            {
                item.lower()
                for item in clean_options
            }
        ) != len(clean_options):
            raise ValueError(
                "MCQ options must be unique."
            )

        if (
            not correct_answer
            or correct_answer.lower()
            not in {
                item.lower()
                for item in clean_options
            }
        ):
            raise ValueError(
                "Correct answer must match one of the options."
            )

        options = clean_options

    else:
        options = None
        correct_answer = None

    qbank = (
        db.query(
            QuestionBank
        )
        .filter(
            QuestionBank.job_id
            == question_set.job_id,
            QuestionBank.hiring_year
            == question_set.hiring_year,
        )
        .first()
    )

    if qbank is None:
        qbank = QuestionBank(
            job_id=question_set.job_id,
            hiring_year=question_set.hiring_year,
            name=(
                f"{question_set.name} - "
                f"{question_set.hiring_year} "
                "Question Bank"
            ),
            description=(
                f"Annual question bank for "
                f"{question_set.name}."
            ),
            status="active",
            created_by=created_by,
        )

        db.add(
            qbank
        )
        db.flush()

    # Protect against duplicate or near-duplicate content already used by this job/year.
    existing = (
        db.query(
            Question
        )
        .outerjoin(
            QuestionBank,
            Question.question_bank_id
            == QuestionBank.id,
        )
        .filter(
            Question.skill_id
            == slot.skill_id,
            Question.difficulty
            == slot.difficulty,
            Question.section_type
            == slot.section_type,
            (
                (
                    QuestionBank.job_id
                    == question_set.job_id
                )
                & (
                    QuestionBank.hiring_year
                    <= question_set.hiring_year
                )
            )
            | Question.question_bank_id.is_(None),
        )
        .all()
    )

    normalized = _normalize_question_text(
        normalized_text
    )

    for item in existing:
        other = _normalize_question_text(
            item.question_text
        )

        if (
            normalized == other
            or SequenceMatcher(
                None,
                normalized,
                other,
            ).ratio()
            >= 0.92
        ):
            raise ValueError(
                "A duplicate or near-duplicate question already exists "
                "for this slot context."
            )

    question = Question(
        question_text=normalized_text,
        question_type=question_type,
        section_type=slot.section_type,
        skill_id=slot.skill_id,
        difficulty=slot.difficulty,
        options=options,
        correct_answer=correct_answer,
        question_bank_id=qbank.id,
        status="pending_review",
        source=source,
        explanation=explanation,
        rejection_reason=None,
        created_by=created_by,
        reviewed_by=None,
        reviewed_at=None,
        version=1,
    )

    db.add(
        question
    )
    db.flush()

    db.add(
        QuestionVersion(
            question_id=question.id,
            version=1,
            question_text=question.question_text,
            question_type=question.question_type,
            section_type=question.section_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            source=question.source,
            changed_by=created_by,
        )
    )

    db.flush()

    return question


def accept_generation_attempt(
    db: Session,
    slot_id: int,
    attempt_id: int,
    user_id: int,
) -> dict:
    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    attempt = db.get(
        QuestionGenerationAttempt,
        attempt_id,
    )

    if (
        attempt is None
        or attempt.question_slot_id != slot.id
    ):
        raise ValueError(
            "Generation attempt not found for this slot."
        )

    if attempt.status != "generated":
        raise ValueError(
            "Only a completed AI generation candidate can be accepted."
        )

    previous_question_id = (
        slot.current_question_id
    )

    question = _create_question_from_candidate(
        db=db,
        question_set=question_set,
        slot=slot,
        question_text=attempt.question_text or "",
        question_type=attempt.question_type or "",
        options=attempt.options,
        correct_answer=attempt.correct_answer,
        explanation=attempt.explanation,
        source="ai_generated",
        created_by=user_id,
    )

    attempt.status = "accepted"
    attempt.candidate_question_id = question.id
    attempt.previous_question_id = previous_question_id
    attempt.accepted_by = user_id
    attempt.accepted_at = utc_now()

    slot.current_question_id = question.id
    slot.source_type = "ai_generated"
    slot.status = "filled"

    db.commit()
    db.refresh(
        question
    )

    return {
        "slot": _slot_response(
            db,
            slot,
        ),
        "question": _question_response(
            question,
            db,
        ),
        "attempt": _attempt_response(
            attempt
        ),
    }


def restore_generation_attempt(
    db: Session,
    slot_id: int,
    attempt_id: int,
    user_id: int,
) -> dict:
    slot, _ = _get_slot(
        db,
        slot_id,
        user_id,
    )

    attempt = db.get(
        QuestionGenerationAttempt,
        attempt_id,
    )

    if (
        attempt is None
        or attempt.question_slot_id != slot.id
    ):
        raise ValueError(
            "Generation attempt not found for this slot."
        )

    if not attempt.candidate_question_id:
        raise ValueError(
            "This generation attempt has no persisted question to restore."
        )

    question = db.get(
        Question,
        attempt.candidate_question_id,
    )

    if question is None:
        raise ValueError(
            "The question referenced by this generation attempt "
            "no longer exists."
        )

    previous_question_id = (
        slot.current_question_id
    )

    attempt.previous_question_id = (
        previous_question_id
    )

    attempt.restored_by = user_id
    attempt.restored_at = utc_now()

    slot.current_question_id = question.id
    slot.source_type = question.source
    slot.status = "filled"

    db.commit()
    db.refresh(
        question
    )

    return {
        "slot": _slot_response(
            db,
            slot,
        ),
        "question": _question_response(
            question,
            db,
        ),
        "attempt": _attempt_response(
            attempt
        ),
    }


def change_slot_skill(
    db: Session,
    slot_id: int,
    skill_id: int,
    user_id: int,
) -> dict:
    """Change the authoring skill for an empty slot using a confirmed job skill."""

    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    if slot.current_question_id is not None:
        raise ValueError(
            "The slot skill can only be changed while the slot is empty."
        )

    confirmed_skills = {
        skill.id: skill
        for skill in get_job_skills(
            db,
            question_set.job_id,
        )
    }

    if skill_id not in confirmed_skills:
        raise ValueError(
            "Selected skill is not part of the confirmed job skills for this assessment."
        )

    if skill_id == slot.skill_id:
        return {
            "slot": _slot_response(
                db,
                slot,
            )
        }

    occupied_numbers = {
        int(row[0])
        for row in (
            db.query(
                QuestionSlot.slot_number
            )
            .filter(
                QuestionSlot.assessment_set_id
                == slot.assessment_set_id,
                QuestionSlot.section_id
                == slot.section_id,
                QuestionSlot.skill_id
                == skill_id,
                QuestionSlot.difficulty
                == slot.difficulty,
            )
            .all()
        )
    }

    # The durable uniqueness key contains skill_id + slot_number. If the
    # target skill already has Q1, move this authoring position to the next
    # free ordinal rather than failing with an opaque integrity error.
    next_number = 1

    while next_number in occupied_numbers:
        next_number += 1

    slot.skill_id = skill_id
    slot.slot_number = next_number

    db.commit()

    return {
        "slot": _slot_response(
            db,
            slot,
        )
    }


def change_slot_question_type(
    db: Session,
    slot_id: int,
    question_type: str,
    user_id: int,
) -> dict:
    """Set MCQ/FREE_TEXT preference for an empty authoring slot."""

    slot, _ = _get_slot(
        db,
        slot_id,
        user_id,
    )

    normalized = str(
        question_type or ""
    ).strip().upper()

    if normalized not in VALID_QUESTION_TYPES:
        raise ValueError(
            "Question type must be MCQ or FREE_TEXT."
        )

    if slot.current_question_id is not None:
        raise ValueError(
            "Question type can only be changed while the slot is empty."
        )

    slot.preferred_question_type = normalized

    db.commit()

    return {
        "slot": _slot_response(
            db,
            slot,
        )
    }


def get_question_bank_questions(
    db: Session,
    slot_id: int,
    user_id: int,
    limit: int = 100,
) -> list[dict]:
    """Return questions matching the slot that are both question-approved and from an approved question set in this job/year bank."""

    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    hiring_year = question_set.hiring_year

    if hiring_year is None:
        return []

    rows = db.execute(
        text(
            """
            SELECT
                q.id,
                q.question_text,
                q.question_type,
                q.section_type,
                q.skill_id,
                q.difficulty,
                q.options,
                q.correct_answer,
                q.explanation,
                q.status,
                q.source,
                qb.hiring_year AS source_year,
                confirmed_source.label AS confirmed_set_label,
                confirmed_source.variant_number AS confirmed_set_variant,
                COALESCE(q.manager_rating, 0) AS manager_rating,
                COALESCE(q.reviewer_rating, 0) AS reviewer_rating
            FROM questions q
            JOIN question_banks qb ON qb.id = q.question_bank_id
            JOIN LATERAL (
                SELECT
                    source_set.label,
                    source_set.variant_number
                FROM question_slots source_slot
                JOIN assessment_sets source_set
                  ON source_set.id = source_slot.assessment_set_id
                JOIN question_sets source_blueprint
                  ON source_blueprint.id = source_set.question_set_id
                WHERE source_slot.current_question_id = q.id
                  AND source_set.status = 'approved'
                  AND source_blueprint.job_id = :job_id
                  AND source_blueprint.hiring_year = :hiring_year
                ORDER BY source_set.variant_number ASC
                LIMIT 1
            ) confirmed_source ON TRUE
            WHERE qb.job_id = :job_id
              AND qb.hiring_year = :hiring_year
              AND q.skill_id = :skill_id
              AND q.difficulty = :difficulty
              AND q.section_type = :section_type
              AND q.question_type = :question_type
              AND q.status = 'approved'
            ORDER BY
                (
                    COALESCE(q.reviewer_rating, 0) * 2
                    + COALESCE(q.manager_rating, 0)
                ) DESC,
                q.id DESC
            LIMIT :limit
            """
        ),
        {
            "job_id": question_set.job_id,
            "hiring_year": hiring_year,
            "skill_id": slot.skill_id,
            "difficulty": slot.difficulty,
            "section_type": slot.section_type,
            "question_type": _slot_question_type(
                slot
            ),
            "limit": min(
                max(
                    int(limit),
                    1,
                ),
                100,
            ),
        },
    ).mappings().all()

    return [
        dict(row)
        for row in rows
    ]


def use_existing_question(
    db: Session,
    slot_id: int,
    question_id: int,
    user_id: int,
) -> dict:
    """Assign only an exact-context question from an approved question set without cloning its content."""

    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    allowed = db.execute(
        text(
            """
            SELECT q.id
            FROM questions q
            JOIN question_banks qb ON qb.id = q.question_bank_id
            WHERE q.id = :question_id
              AND qb.job_id = :job_id
              AND qb.hiring_year = :hiring_year
              AND q.skill_id = :skill_id
              AND q.difficulty = :difficulty
              AND q.section_type = :section_type
              AND q.question_type = :question_type
              AND q.status = 'approved'
              AND EXISTS (
                  SELECT 1
                  FROM question_slots source_slot
                  JOIN assessment_sets source_set
                    ON source_set.id = source_slot.assessment_set_id
                  JOIN question_sets source_blueprint
                    ON source_blueprint.id = source_set.question_set_id
                  WHERE source_slot.current_question_id = q.id
                    AND source_set.status = 'approved'
                    AND source_blueprint.job_id = :job_id
                    AND source_blueprint.hiring_year = :hiring_year
              )
            LIMIT 1
            """
        ),
        {
            "question_id": question_id,
            "job_id": question_set.job_id,
            "hiring_year": question_set.hiring_year,
            "skill_id": slot.skill_id,
            "difficulty": slot.difficulty,
            "section_type": slot.section_type,
            "question_type": _slot_question_type(
                slot
            ),
        },
    ).first()

    if allowed is None:
        raise ValueError(
            "This question is not from an approved question set in the current question bank, "
            "or it does not match the slot's skill, difficulty, section, and type."
        )

    duplicate_use = db.execute(
        text(
            """
            SELECT qs.id
            FROM question_slots qs
            JOIN assessment_sets aset
              ON aset.id = qs.assessment_set_id
            WHERE aset.question_set_id = :question_set_id
              AND qs.current_question_id = :question_id
              AND qs.id <> :slot_id
            LIMIT 1
            """
        ),
        {
            "question_set_id": question_set.id,
            "question_id": question_id,
            "slot_id": slot.id,
        },
    ).first()

    if duplicate_use is not None:
        raise ValueError(
            "This question is already used in another slot of "
            "the current assessment."
        )

    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise ValueError(
            "Question not found."
        )

    previous_question_id = (
        slot.current_question_id
    )

    slot.current_question_id = question.id
    slot.source_type = "question_bank"
    slot.status = "filled"

    db.commit()
    db.refresh(
        question
    )

    return {
        "slot": _slot_response(
            db,
            slot,
        ),
        "question": _question_response(
            question,
            db,
        ),
        "previous_question_id": previous_question_id,
    }


def create_manual_question(
    db: Session,
    slot_id: int,
    payload: dict,
    user_id: int,
) -> dict:
    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    question = _create_question_from_candidate(
        db=db,
        question_set=question_set,
        slot=slot,
        question_text=payload["question_text"],
        question_type=payload["question_type"],
        options=payload.get("options"),
        correct_answer=payload.get("correct_answer"),
        explanation=payload.get("explanation"),
        source="manual",
        created_by=user_id,
    )

    slot.current_question_id = question.id
    slot.source_type = "manual"
    slot.status = "filled"

    db.commit()
    db.refresh(
        question
    )

    return {
        "slot": _slot_response(
            db,
            slot,
        ),
        "question": _question_response(
            question
        ),
    }


def get_previous_questions(
    db: Session,
    slot_id: int,
    user_id: int,
    limit: int = 50,
) -> list[dict]:
    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    if question_set.hiring_year is None:
        return []

    # The ORM Text-join is intentionally avoided below in favor of a small
    # SQL query because older model snapshots do not expose all assessment
    # relationships consistently.
    raw_rows = db.execute(
        text(
            """
            SELECT DISTINCT
                q.id,
                q.question_text,
                q.question_type,
                q.section_type,
                q.skill_id,
                q.difficulty,
                q.options,
                q.correct_answer,
                q.explanation,
                q.status,
                q.source,
                qb.hiring_year AS source_year,
                a.id AS assessment_id,
                a.title AS assessment_title,
                a.variant_number,
                COALESCE(q.manager_rating, 0) AS manager_rating,
                COALESCE(q.reviewer_rating, 0) AS reviewer_rating
            FROM questions q
            JOIN question_banks qb
              ON qb.id = q.question_bank_id
            JOIN assessment_questions aq
              ON aq.question_id = q.id
            JOIN assessments a
              ON a.id = aq.assessment_id
            WHERE qb.job_id = :job_id
              AND qb.hiring_year < :hiring_year
              AND q.skill_id = :skill_id
              AND q.difficulty = :difficulty
              AND q.section_type = :section_type
              AND q.question_type = :question_type
              AND q.status = 'approved'
              AND (
                  a.review_status = 'approved'
                  OR a.status = 'published'
              )
            ORDER BY
              (
                  COALESCE(q.reviewer_rating, 0) * 2
                  + COALESCE(q.manager_rating, 0)
              ) DESC,
              qb.hiring_year DESC,
              q.id DESC
            LIMIT :limit
            """
        ),
        {
            "job_id": question_set.job_id,
            "hiring_year": question_set.hiring_year,
            "skill_id": slot.skill_id,
            "difficulty": slot.difficulty,
            "section_type": slot.section_type,
            "question_type": _slot_question_type(
                slot
            ),
            "limit": min(
                max(
                    int(limit),
                    1,
                ),
                100,
            ),
        },
    ).mappings().all()

    return [
        dict(row)
        for row in raw_rows
    ]


def use_previous_question(
    db: Session,
    slot_id: int,
    question_id: int,
    user_id: int,
) -> dict:
    slot, question_set = _get_slot(
        db,
        slot_id,
        user_id,
    )

    allowed = db.execute(
        text(
            """
            SELECT 1
            FROM questions q
            JOIN question_banks qb
              ON qb.id = q.question_bank_id
            JOIN assessment_questions aq
              ON aq.question_id = q.id
            JOIN assessments a
              ON a.id = aq.assessment_id
            WHERE q.id = :question_id
              AND qb.job_id = :job_id
              AND qb.hiring_year < :hiring_year
              AND q.skill_id = :skill_id
              AND q.difficulty = :difficulty
              AND q.section_type = :section_type
              AND q.question_type = :question_type
              AND q.status = 'approved'
              AND (
                  a.review_status = 'approved'
                  OR a.status = 'published'
              )
            LIMIT 1
            """
        ),
        {
            "question_id": question_id,
            "job_id": question_set.job_id,
            "hiring_year": question_set.hiring_year,
            "skill_id": slot.skill_id,
            "difficulty": slot.difficulty,
            "section_type": slot.section_type,
            "question_type": _slot_question_type(
                slot
            ),
        },
    ).first()

    if allowed is None:
        raise ValueError(
            "This question is not an eligible finalized historical "
            "question for the target slot."
        )

    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise ValueError(
            "Question not found."
        )

    duplicate_use = db.execute(
        text(
            """
            SELECT qs.id
            FROM question_slots qs
            JOIN assessment_sets aset
              ON aset.id = qs.assessment_set_id
            WHERE aset.question_set_id = :question_set_id
              AND qs.current_question_id = :question_id
              AND qs.id <> :slot_id
            LIMIT 1
            """
        ),
        {
            "question_set_id": question_set.id,
            "question_id": question.id,
            "slot_id": slot.id,
        },
    ).first()

    if duplicate_use is not None:
        raise ValueError(
            "This historical question is already used in another slot "
            "of the current assessment."
        )

    previous_question_id = (
        slot.current_question_id
    )

    slot.current_question_id = question.id
    slot.source_type = "historical"
    slot.status = "filled"

    db.commit()
    db.refresh(
        question
    )

    return {
        "slot": _slot_response(
            db,
            slot,
        ),
        "question": _question_response(
            question
        ),
        "previous_question_id": previous_question_id,
    }


def _ensure_question_edit_access(
    db: Session,
    question_id: int,
    user_id: int,
) -> tuple[
    Question,
    QuestionSlot,
    QuestionSet,
]:
    row = (
        db.query(
            QuestionSlot
        )
        .join(
            AssessmentSet,
            AssessmentSet.id
            == QuestionSlot.assessment_set_id,
        )
        .join(
            QuestionSet,
            QuestionSet.id
            == AssessmentSet.question_set_id,
        )
        .filter(
            QuestionSlot.current_question_id
            == question_id,
        )
        .all()
    )

    for slot in row:
        try:
            _require_manager_access(
                db,
                db.get(
                    QuestionSet,
                    slot.assessment_set.question_set_id,
                ),
                user_id,
            )
        except Exception:
            continue

        question = db.get(
            Question,
            question_id,
        )

        if question is None:
            break

        return (
            question,
            slot,
            db.get(
                QuestionSet,
                slot.assessment_set.question_set_id,
            ),
        )

    raise ValueError(
        "You are not authorized to edit this assessment question."
    )


def _assert_no_duplicate_for_edit(
    db: Session,
    question_set: QuestionSet,
    slot: QuestionSlot,
    question_id: int,
    question_text: str,
) -> None:
    normalized = _normalize_question_text(
        question_text
    )

    if not normalized:
        return

    rows = (
        db.query(
            Question
        )
        .outerjoin(
            QuestionBank,
            Question.question_bank_id
            == QuestionBank.id,
        )
        .filter(
            Question.id != question_id,
            Question.skill_id == slot.skill_id,
            Question.difficulty == slot.difficulty,
            Question.section_type == slot.section_type,
            (
                (
                    (
                        QuestionBank.job_id
                        == question_set.job_id
                    )
                    & (
                        QuestionBank.hiring_year
                        <= question_set.hiring_year
                    )
                )
                | Question.question_bank_id.is_(None)
            ),
        )
        .all()
    )

    for item in rows:
        other = _normalize_question_text(
            item.question_text
        )

        if normalized == other:
            raise ValueError(
                "A duplicate question already exists for this slot context."
            )

        if (
            SequenceMatcher(
                None,
                normalized,
                other,
            ).ratio()
            >= 0.92
        ):
            raise ValueError(
                "A near-duplicate question already exists for this slot context."
            )


def update_authoring_question(
    db: Session,
    question_id: int,
    payload: dict,
    user_id: int,
) -> dict:
    question, slot, question_set = (
        _ensure_question_edit_access(
            db,
            question_id,
            user_id,
        )
    )

    question_type = str(
        payload["question_type"]
    ).strip().upper()

    expected_type = _slot_question_type(
        slot
    )

    if question_type != expected_type:
        raise ValueError(
            f"{slot.section_type} slots require question type "
            f"{expected_type}."
        )

    question_text = " ".join(
        str(
            payload["question_text"]
        ).strip().split()
    )

    if not question_text:
        raise ValueError(
            "Question text cannot be empty."
        )

    options = payload.get(
        "options"
    ) or []

    correct_answer = payload.get(
        "correct_answer"
    )

    explanation = payload.get(
        "explanation"
    )

    if question_type == "MCQ":
        options = [
            " ".join(
                str(item)
                .strip()
                .split()
            )
            for item in options
            if str(item).strip()
        ]

        if len(options) < 4:
            raise ValueError(
                "MCQ questions must contain at least four options."
            )

        if len(
            {
                item.lower()
                for item in options
            }
        ) != len(options):
            raise ValueError(
                "MCQ options must be unique."
            )

        if (
            not correct_answer
            or str(correct_answer).lower()
            not in {
                item.lower()
                for item in options
            }
        ):
            raise ValueError(
                "Correct answer must match one of the options."
            )

    else:
        options = None
        correct_answer = None

    _assert_no_duplicate_for_edit(
        db=db,
        question_set=question_set,
        slot=slot,
        question_id=question_id,
        question_text=question_text,
    )

    # Historical questions are immutable source content. Editing one creates a
    # new current-year question rather than modifying last year's record.
    if slot.source_type == "historical":
        old_question_id = (
            slot.current_question_id
        )

        new_question = _create_question_from_candidate(
            db=db,
            question_set=question_set,
            slot=slot,
            question_text=question_text,
            question_type=question_type,
            options=options,
            correct_answer=correct_answer,
            explanation=explanation,
            source="manual",
            created_by=user_id,
        )

        slot.current_question_id = (
            new_question.id
        )
        slot.source_type = "manual"
        slot.status = "filled"

        db.commit()
        db.refresh(
            new_question
        )

        return {
            "question": _question_response(
                new_question,
                db,
            ),
            "slot": _slot_response(
                db,
                slot,
            ),
            "forked_from_question_id": old_question_id,
        }

    next_version = int(
        question.version or 1
    ) + 1

    question.question_text = question_text
    question.question_type = question_type
    question.options = options
    question.correct_answer = correct_answer
    question.explanation = explanation
    question.version = next_version
    question.status = "pending_review"
    question.reviewed_by = None
    question.reviewed_at = None
    question.rejection_reason = None

    db.add(
        QuestionVersion(
            question_id=question.id,
            version=next_version,
            question_text=question.question_text,
            question_type=question.question_type,
            section_type=question.section_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            source=question.source,
            changed_by=user_id,
        )
    )

    db.commit()
    db.refresh(
        question
    )

    return {
        "question": _question_response(
            question,
            db,
        ),
        "slot": _slot_response(
            db,
            slot,
        ),
    }
