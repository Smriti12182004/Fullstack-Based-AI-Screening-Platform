from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    Job,
    JobAssessmentAccess,
    JobSkill,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
    Skill,
)


class QuestionSetServiceError(Exception):
    """Base exception for question-set service failures."""


# Evalyn creates exactly two assessment sets from one blueprint:
# Set A and Set B. Existing question sets keep their stored value so
# previously created three-variant question sets remain compatible.
DEFAULT_VARIANT_COUNT = 2


# Every new QuestionSet starts with the three semantic assessment sections.
# They are intentionally created without skill allocations or question counts;
# the Assessment Manager configures those next.
INITIAL_SECTION_DEFINITIONS = (
    {
        "name": "Core Fundamentals",
        "section_type": "conceptual",
        "difficulty": "easy",
        "display_order": 1,
    },
    {
        "name": "Implementation & Applied Reasoning",
        "section_type": "implementation",
        "difficulty": "medium",
        "display_order": 2,
    },
    {
        "name": "Evaluation & Open Response",
        "section_type": "free_text",
        "difficulty": "hard",
        "display_order": 3,
    },
)


def create_question_set(
    db: Session,
    job_id: int,
    hiring_year: int,
    hiring_cycle: str | None,
    name: str | None,
    description: str | None,
    created_by: int,
    variant_count: int = DEFAULT_VARIANT_COUNT,
) -> QuestionSet:
    """
    Create one assessment blueprint for a specific job and hiring year.

    A QuestionSet represents the common blueprint. Its two assessment sets
    are created later from this blueprint, rather than creating independent
    QuestionSet records.

    New blueprints support exactly two assessment sets:
    Set A (variant 1) and Set B (variant 2).

    New QuestionSets are also initialized with:
    - one QuestionSetConfiguration row;
    - three semantic assessment sections.

    The sections start empty so the Assessment Manager can configure the
    skills and per-difficulty question counts next.
    """

    job = db.get(
        Job,
        job_id,
    )

    if job is None:
        raise QuestionSetServiceError(
            "Job not found."
        )

    if variant_count != DEFAULT_VARIANT_COUNT:
        raise QuestionSetServiceError(
            "Evalyn supports exactly 2 assessment sets: Set A and Set B."
        )

    normalized_cycle = (
        hiring_cycle.strip()
        if hiring_cycle is not None
        else None
    )

    normalized_description = (
        description.strip()
        if description is not None
        else None
    )

    if name is not None:
        normalized_name = name.strip()
    else:
        normalized_name = (
            f"{job.title} — "
            f"{hiring_year} Assessment"
        )

    if not normalized_name:
        raise QuestionSetServiceError(
            "Question set name cannot be empty."
        )

    # Prevent multiple blueprints for the same job/year unless the
    # existing implementation intentionally changes this rule later.
    existing = (
        db.query(QuestionSet)
        .filter(
            QuestionSet.job_id == job_id,
            QuestionSet.hiring_year == hiring_year,
        )
        .first()
    )

    if existing is not None:
        raise QuestionSetServiceError(
            "A question set already exists for this job and hiring year."
        )

    question_set = QuestionSet(
        job_id=job_id,
        name=normalized_name,
        description=normalized_description,
        hiring_year=hiring_year,
        hiring_cycle=normalized_cycle,
        # Explicitly store 2 for every newly-created blueprint. This keeps
        # older rows with variant_count=3 untouched and backward-compatible.
        variant_count=DEFAULT_VARIANT_COUNT,
        status="draft",
        version=1,
        created_by=created_by,
    )

    try:
        db.add(question_set)
        db.flush()

        # Initialize the one-to-one assessment configuration record.
        #
        # total_questions starts at 0 because no section skill allocations
        # have been configured yet. The Assessment Manager will save the
        # actual total after configuring the section blueprint.
        #
        # Duration defaults to 60 minutes so the new configuration is usable
        # immediately in the frontend and can still be edited before final
        # assessment configuration.
        configuration = QuestionSetConfiguration(
            question_set_id=question_set.id,
            total_questions=0,
            duration_minutes=60,
            candidate_instructions=None,
        )
        db.add(configuration)

        # Initialize the three semantic sections used by AssessmentConfig.jsx.
        # No SectionSkill rows are created here because those are selected and
        # allocated by the Assessment Manager after the QuestionSet is created.
        for definition in INITIAL_SECTION_DEFINITIONS:
            db.add(
                Section(
                    question_set_id=question_set.id,
                    name=definition["name"],
                    section_type=definition["section_type"],
                    difficulty=definition["difficulty"],
                    display_order=definition["display_order"],
                    is_locked=False,
                )
            )

        # Keep QuestionSet creation atomic. If configuration or section
        # initialization fails, the QuestionSet itself is rolled back too.
        db.commit()

        db.refresh(question_set)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionSetServiceError(
            "Unable to create question set."
        ) from exc

    return question_set


def get_question_sets(
    db: Session,
    job_id: int | None = None,
    hiring_year: int | None = None,
) -> list[QuestionSet]:
    """
    Return question-set blueprints ordered from newest to oldest.
    """

    query = db.query(
        QuestionSet
    )

    if job_id is not None:
        query = query.filter(
            QuestionSet.job_id == job_id
        )

    if hiring_year is not None:
        query = query.filter(
            QuestionSet.hiring_year == hiring_year
        )

    return (
        query
        .order_by(
            QuestionSet.hiring_year.desc(),
            QuestionSet.created_at.desc(),
            QuestionSet.id.desc(),
        )
        .all()
    )


def get_accessible_job_skills(
    db: Session,
    question_set_id: int,
    user_id: int,
) -> list[Skill]:
    """
    Return the skills belonging to the job associated with a question set.

    Access is limited to users who have JobAssessmentAccess for the
    question set's job.
    """

    question_set = db.get(
        QuestionSet,
        question_set_id,
    )

    if question_set is None:
        raise QuestionSetServiceError(
            "Question set not found."
        )

    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == question_set.job_id,
            JobAssessmentAccess.user_id == user_id,
        )
        .first()
    )

    if access is None:
        raise QuestionSetServiceError(
            "You are not authorized to access this question set."
        )

    return (
        db.query(Skill)
        .join(
            JobSkill,
            JobSkill.skill_id == Skill.id,
        )
        .filter(
            JobSkill.job_id == question_set.job_id,
        )
        .order_by(
            Skill.name.asc(),
        )
        .all()
    )


def get_question_set(
    db: Session,
    question_set_id: int,
) -> QuestionSet | None:
    return db.get(
        QuestionSet,
        question_set_id,
    )


def submit_question_set_for_review(
    db: Session,
    question_set_id: int,
) -> QuestionSet:
    """
    Move a draft/rejected question set into the reviewer workflow.
    """

    question_set = get_question_set(
        db=db,
        question_set_id=question_set_id,
    )

    if question_set is None:
        raise QuestionSetServiceError(
            "Question set not found."
        )

    if question_set.status not in {
        "draft",
        "rejected",
    }:
        raise QuestionSetServiceError(
            "Only draft or rejected question sets can be submitted "
            "for review."
        )

    question_set.status = "submitted_for_review"
    question_set.reviewed_by = None
    question_set.reviewed_at = None
    question_set.rejection_reason = None

    try:
        db.commit()
        db.refresh(
            question_set
        )

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionSetServiceError(
            "Unable to submit question set for review."
        ) from exc

    return question_set