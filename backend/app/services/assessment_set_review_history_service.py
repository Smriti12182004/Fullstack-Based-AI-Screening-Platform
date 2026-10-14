"""Reviewer history service for completed AssessmentSet decisions."""

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.models import (
    AssessmentSet,
    JobAssessmentAccess,
    QuestionSet,
    QuestionSetConfiguration,
    QuestionSlot,
    Section,
    Skill,
    User,
)


class AssessmentSetReviewHistoryServiceError(Exception):
    """Raised when reviewer history cannot be loaded."""


def _get_assigned_reviewer_id(
    db: Session,
    job_id: int,
) -> int:
    rows = (
        db.query(User.id)
        .join(
            JobAssessmentAccess,
            JobAssessmentAccess.user_id == User.id,
        )
        .filter(
            JobAssessmentAccess.job_id == job_id,
            User.role == "assessment_reviewer",
        )
        .order_by(
            JobAssessmentAccess.created_at.asc(),
            User.id.asc(),
        )
        .all()
    )

    if not rows:
        raise AssessmentSetReviewHistoryServiceError(
            "No assessment reviewer is assigned to this job."
        )

    if len(rows) > 1:
        raise AssessmentSetReviewHistoryServiceError(
            "Multiple assessment reviewers are assigned to this job."
        )

    return int(rows[0][0])


def _get_set(
    db: Session,
    assessment_set_id: int,
    reviewer_id: int,
) -> tuple[AssessmentSet, QuestionSet]:
    assessment_set = db.get(
        AssessmentSet,
        assessment_set_id,
    )

    if assessment_set is None:
        raise AssessmentSetReviewHistoryServiceError(
            "Assessment set not found."
        )

    question_set = db.get(
        QuestionSet,
        assessment_set.question_set_id,
    )

    if question_set is None:
        raise AssessmentSetReviewHistoryServiceError(
            "Parent QuestionSet not found."
        )

    assigned_reviewer_id = _get_assigned_reviewer_id(
        db,
        question_set.job_id,
    )

    if assigned_reviewer_id != int(reviewer_id):
        raise AssessmentSetReviewHistoryServiceError(
            "You are not the assigned reviewer for this assessment set."
        )

    return assessment_set, question_set


def _get_slots(
    db: Session,
    assessment_set_id: int,
) -> list[QuestionSlot]:
    return (
        db.query(QuestionSlot)
        .filter(
            QuestionSlot.assessment_set_id == assessment_set_id,
        )
        .order_by(
            QuestionSlot.section_id.asc(),
            QuestionSlot.skill_id.asc(),
            QuestionSlot.difficulty.asc(),
            QuestionSlot.slot_number.asc(),
        )
        .all()
    )


def _summary(
    slots: list[QuestionSlot],
) -> dict:
    total = len(slots)

    filled = sum(
        1
        for slot in slots
        if slot.current_question_id is not None
    )

    pending = sum(
        1
        for slot in slots
        if (
            slot.current_question is not None
            and str(slot.current_question.status or "").lower()
            == "pending_review"
        )
    )

    approved = sum(
        1
        for slot in slots
        if (
            slot.current_question is not None
            and str(slot.current_question.status or "").lower()
            == "approved"
        )
    )

    rejected = sum(
        1
        for slot in slots
        if (
            slot.current_question is not None
            and str(slot.current_question.status or "").lower()
            == "rejected"
        )
    )

    return {
        "total_slots": total,
        "filled_slots": filled,
        "remaining_slots": max(total - filled, 0),
        "pending_review": pending,
        "approved": approved,
        "rejected": rejected,
    }


def _ratings(
    db: Session,
    question_ids: list[int],
) -> dict[int, dict]:
    if not question_ids:
        return {}

    statement = text(
        """
        SELECT
            id,
            manager_rating,
            reviewer_rating
        FROM questions
        WHERE id IN :question_ids
        """
    ).bindparams(
        bindparam(
            "question_ids",
            expanding=True,
        )
    )

    rows = db.execute(
        statement,
        {
            "question_ids": question_ids,
        },
    ).mappings().all()

    return {
        int(row["id"]): {
            "manager_rating": row["manager_rating"],
            "reviewer_rating": row["reviewer_rating"],
        }
        for row in rows
    }


def _question_response(
    slot: QuestionSlot,
    sections: dict[int, Section],
    skills: dict[int, Skill],
    ratings: dict[int, dict],
) -> dict:
    question = slot.current_question

    section = sections.get(
        slot.section_id
    )

    skill = skills.get(
        slot.skill_id
    )

    if question is None:
        return {
            "slot_id": slot.id,
            "section_id": slot.section_id,
            "section_name": (
                section.name
                if section
                else None
            ),
            "skill_id": slot.skill_id,
            "skill_name": (
                skill.name
                if skill
                else None
            ),
            "section_type": slot.section_type,
            "difficulty": slot.difficulty,
            "slot_number": slot.slot_number,
            "preferred_question_type": (
                slot.preferred_question_type
            ),
            "question_id": None,
            "question_text": None,
            "question_type": (
                slot.preferred_question_type
            ),
            "options": None,
            "correct_answer": None,
            "explanation": None,
            "status": "empty",
            "source": slot.source_type,
            "version": None,
            "manager_rating": None,
            "reviewer_rating": None,
            "rejection_reason": None,
            "created_at": None,
            "updated_at": None,
        }

    rating = ratings.get(
        int(question.id),
        {},
    )

    return {
        "slot_id": slot.id,
        "section_id": slot.section_id,
        "section_name": (
            section.name
            if section
            else None
        ),
        "skill_id": slot.skill_id,
        "skill_name": (
            skill.name
            if skill
            else None
        ),
        "section_type": slot.section_type,
        "difficulty": slot.difficulty,
        "slot_number": slot.slot_number,
        "preferred_question_type": (
            slot.preferred_question_type
        ),
        "question_id": question.id,
        "question_text": question.question_text,
        "question_type": question.question_type,
        "options": question.options or [],
        "correct_answer": question.correct_answer,
        "explanation": question.explanation,
        "status": question.status,
        "source": question.source,
        "version": question.version,
        "manager_rating": rating.get(
            "manager_rating"
        ),
        "reviewer_rating": rating.get(
            "reviewer_rating"
        ),
        "rejection_reason": question.rejection_reason,
        "created_at": question.created_at,
        "updated_at": question.updated_at,
    }


def _variant_response(
    db: Session,
    assessment_set: AssessmentSet,
) -> dict:
    slots = _get_slots(
        db,
        assessment_set.id,
    )

    summary = _summary(
        slots
    )

    normalized_status = str(
        assessment_set.status or "draft"
    ).strip().lower()

    if normalized_status in {
        "approved",
        "rejected",
    }:
        is_openable = True
        lock_reason = None

    elif normalized_status == "draft":
        is_openable = False
        lock_reason = (
            "The Assessment Manager has not submitted this set for review yet."
        )

    elif normalized_status == "submitted_for_review":
        is_openable = False
        lock_reason = (
            "This set is still awaiting reviewer completion."
        )

    else:
        is_openable = False
        lock_reason = (
            "This set is not currently available in review history."
        )

    return {
        "id": assessment_set.id,
        "variant_number": assessment_set.variant_number,
        "label": assessment_set.label,
        "status": assessment_set.status,
        "question_count": summary["filled_slots"],
        "pending_review_count": summary["pending_review"],
        "approved_count": summary["approved"],
        "is_openable": is_openable,
        "lock_reason": lock_reason,
    }


def get_completed_review_queue(
    db: Session,
    reviewer_id: int,
) -> list[dict]:
    """Return approved/rejected AssessmentSets previously reviewed by a reviewer."""
    rows = (
        db.query(
            AssessmentSet,
            QuestionSet,
        )
        .join(
            QuestionSet,
            QuestionSet.id == AssessmentSet.question_set_id,
        )
        .join(
            JobAssessmentAccess,
            JobAssessmentAccess.job_id == QuestionSet.job_id,
        )
        .join(
            User,
            User.id == JobAssessmentAccess.user_id,
        )
        .filter(
            AssessmentSet.status.in_(
                (
                    "approved",
                    "rejected",
                )
            ),
            JobAssessmentAccess.user_id == reviewer_id,
            User.role == "assessment_reviewer",
        )
        .order_by(
            AssessmentSet.reviewed_at.desc().nullslast(),
            AssessmentSet.id.desc(),
        )
        .all()
    )

    result = []

    for assessment_set, question_set in rows:
        sibling_sets = (
            db.query(AssessmentSet)
            .filter(
                AssessmentSet.question_set_id
                == question_set.id,
            )
            .order_by(
                AssessmentSet.variant_number.asc(),
                AssessmentSet.id.asc(),
            )
            .all()
        )

        variants = [
            _variant_response(
                db,
                variant,
            )
            for variant in sibling_sets
        ]

        slots = _get_slots(
            db,
            assessment_set.id,
        )

        summary = _summary(
            slots
        )

        job = getattr(
            question_set,
            "job",
            None,
        )

        result.append(
            {
                "id": assessment_set.id,
                "job_id": question_set.job_id,
                "job_title": (
                    job.title
                    if job is not None
                    and getattr(
                        job,
                        "title",
                        None,
                    )
                    else f"Job {question_set.job_id}"
                ),
                "question_set_id": question_set.id,
                "variant_number": (
                    assessment_set.variant_number
                ),
                "title": (
                    f"{question_set.name} — "
                    f"Set {assessment_set.label}"
                ),
                "label": assessment_set.label,
                "status": assessment_set.status,
                "created_at": assessment_set.created_at,
                "question_count": summary[
                    "filled_slots"
                ],
                "pending_review_count": summary[
                    "pending_review"
                ],
                "approved_count": summary[
                    "approved"
                ],
                "assessment_sets": variants,
            }
        )

    return result


def get_completed_review_package(
    db: Session,
    assessment_set_id: int,
    reviewer_id: int,
) -> dict:
    """Return the full read-only package for one completed review."""
    assessment_set, question_set = _get_set(
        db,
        assessment_set_id,
        reviewer_id,
    )

    normalized_status = str(
        assessment_set.status or ""
    ).strip().lower()

    if normalized_status not in {
        "approved",
        "rejected",
    }:
        raise AssessmentSetReviewHistoryServiceError(
            "Only completed assessment-set reviews canbe opened from review history."
        )

    slots = _get_slots(
        db,
        assessment_set.id,
    )

    section_ids = sorted(
        {
            slot.section_id
            for slot in slots
            if slot.section_id is not None
        }
    )

    skill_ids = sorted(
        {
            slot.skill_id
            for slot in slots
            if slot.skill_id is not None
        }
    )

    sections = {
        section.id: section
        for section in (
            db.query(Section)
            .filter(
                Section.id.in_(section_ids)
            )
            .all()
            if section_ids
            else []
        )
    }

    skills = {
        skill.id: skill
        for skill in (
            db.query(Skill)
            .filter(
                Skill.id.in_(skill_ids)
            )
            .all()
            if skill_ids
            else []
        )
    }

    question_ids = [
        int(
            slot.current_question_id
        )
        for slot in slots
        if slot.current_question_id is not None
    ]

    ratings = _ratings(
        db,
        question_ids,
    )

    questions = [
        _question_response(
            slot,
            sections,
            skills,
            ratings,
        )
        for slot in slots
    ]

    configuration = (
        db.query(
            QuestionSetConfiguration
        )
        .filter(
            QuestionSetConfiguration.question_set_id
            == question_set.id
        )
        .first()
    )

    configuration_data = None

    if configuration is not None:
        configuration_data = {
            "total_questions": (
                configuration.total_questions
            ),
            "duration_minutes": (
                configuration.duration_minutes
            ),
            "candidate_instructions": (
                configuration.candidate_instructions
            ),
        }

    job = getattr(
        question_set,
        "job",
        None,
    )

    summary = _summary(
        slots
    )

    return {
        "assessment_set_id": assessment_set.id,
        "job_id": question_set.job_id,
        "question_set_id": question_set.id,
        "variant_number": assessment_set.variant_number,
        "label": assessment_set.label,
        "title": (
            f"{question_set.name} — "
            f"Set {assessment_set.label}"
        ),
        "status": assessment_set.status,
        "review_status": assessment_set.status,
        "reviewer_id": assessment_set.reviewer_id,
        "reviewed_at": assessment_set.reviewed_at,

        # Persisted HR handoff metadata.
        # This is what the frontend uses after refreshing the completed review.
        "sent_to_hr": assessment_set.sent_to_hr_at is not None,
        "sent_to_hr_by": assessment_set.sent_to_hr_by,
        "sent_to_hr_at": assessment_set.sent_to_hr_at,

        "review_comment": assessment_set.review_comment,
        "review_checklist": (
            assessment_set.review_checklist
            or {}
        ),
        "job": (
            {
                "id": job.id,
                "title": job.title,
                "description": job.description,
            }
            if job is not None
            else None
        ),
        "question_set": {
            "id": question_set.id,
            "name": question_set.name,
            "description": question_set.description,
            "hiring_year": question_set.hiring_year,
            "hiring_cycle": question_set.hiring_cycle,
            "variant_count": question_set.variant_count,
            "status": question_set.status,
        },
        "configuration": configuration_data,
        "summary": summary,
        "questions": questions,
        "slots": questions,
    }


__all__ = [
    "AssessmentSetReviewHistoryServiceError",
    "get_completed_review_queue",
    "get_completed_review_package",
]