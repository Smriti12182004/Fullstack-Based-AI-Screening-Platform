from datetime import datetime



from sqlalchemy import bindparam, text

from sqlalchemy.exc import SQLAlchemyError

from sqlalchemy.orm import Session



from app.db.timestamps import utc_now

from app.models import (

    Assessment,

    AssessmentQuestion,

    AssessmentSet,

    JobAssessmentAccess,

    Question,

    QuestionSet,

    QuestionSetConfiguration,

    QuestionSlot,

    Section,

    Skill,

    User,

)





class AssessmentReviewQueueItemData:

    """

    Lightweight service-layer representation of a legacy assembled

    Assessment review queue item.

    """



    def __init__(

        self,

        id: int,

        job_id: int,

        question_set_id: int | None,

        variant_number: int | None,

        title: str,

        status: str,

        review_status: str,

        created_at: datetime,

        question_count: int,

    ):

        self.id = id

        self.job_id = job_id

        self.question_set_id = question_set_id

        self.variant_number = variant_number

        self.title = title

        self.status = status

        self.review_status = review_status

        self.created_at = created_at

        self.question_count = question_count





class AssessmentSetReviewVariantData:
    """Reviewer-facing summary for one assessment-set variant."""

    def __init__(
        self,
        id: int,
        variant_number: int,
        label: str,
        status: str,
        question_count: int,
        pending_review_count: int,
        approved_count: int,
        is_openable: bool,
        lock_reason: str | None,
    ):
        self.id = id
        self.variant_number = variant_number
        self.label = label
        self.status = status
        self.question_count = question_count
        self.pending_review_count = pending_review_count
        self.approved_count = approved_count
        self.is_openable = is_openable
        self.lock_reason = lock_reason


class AssessmentSetReviewQueueItemData:
    """Reviewer-facing submitted set plus sibling Set A/Set B status."""

    def __init__(
        self,
        id: int,
        job_id: int,
        job_title: str,
        question_set_id: int,
        variant_number: int,
        title: str,
        label: str,
        status: str,
        created_at: datetime,
        question_count: int,
        pending_review_count: int,
        approved_count: int,
        assessment_sets: list[AssessmentSetReviewVariantData],
    ):
        self.id = id
        self.job_id = job_id
        self.job_title = job_title
        self.question_set_id = question_set_id
        self.variant_number = variant_number
        self.title = title
        self.label = label
        self.status = status
        self.created_at = created_at
        self.question_count = question_count
        self.pending_review_count = pending_review_count
        self.approved_count = approved_count
        self.assessment_sets = assessment_sets


class AssessmentReviewServiceError(Exception):

    """Base exception for assessment review failures."""





DEFAULT_REVIEW_CHECKLIST = {

    "question_quality": False,

    "answer_keys_verified": False,

    "skill_mapping_verified": False,

    "difficulty_verified": False,

    "blueprint_compliance": False,

    "duplicate_check": False,

    "candidate_instructions_verified": False,

}





def _normalize_checklist(

    checklist: dict | None,

) -> dict:

    """

    Return a stable checklist shape even when older assessments

    do not yet have checklist data.

    """

    normalized = dict(DEFAULT_REVIEW_CHECKLIST)



    if checklist:

        for key in normalized:

            if key in checklist:

                normalized[key] = bool(checklist[key])



    return normalized





# ---------------------------------------------------------------------------

# LEGACY ASSESSMENT REVIEW WORKFLOW

# ---------------------------------------------------------------------------





def get_review_queue(

    db: Session,

) -> list[AssessmentReviewQueueItemData]:

    """

    Return all assembled legacy Assessments waiting for reviewer action.



    This function intentionally remains unchanged in behavior because the

    assembled Assessment workflow is still used by the later publishing /

    candidate-delivery lifecycle.

    """

    assessments = (

        db.query(Assessment)

        .filter(

            Assessment.status == "ready",

            Assessment.review_status == "pending",

        )

        .order_by(

            Assessment.created_at.asc(),

            Assessment.variant_number.asc(),

            Assessment.id.asc(),

        )

        .all()

    )



    return [

        AssessmentReviewQueueItemData(

            id=assessment.id,

            job_id=assessment.job_id,

            question_set_id=assessment.question_set_id,

            variant_number=assessment.variant_number,

            title=assessment.title,

            status=assessment.status,

            review_status=assessment.review_status,

            created_at=assessment.created_at,

            question_count=len(

                assessment.assessment_questions

            ),

        )

        for assessment in assessments

    ]





def get_assessment_review_package(

    db: Session,

    assessment_id: int,

) -> dict:

    """

    Return the complete reviewer package for a legacy assembled Assessment.



    Reviewers intentionally receive the answer key and explanation.

    These fields must never be exposed by the candidate delivery API.

    """

    assessment = db.get(

        Assessment,

        assessment_id,

    )



    if assessment is None:

        raise AssessmentReviewServiceError(

            "Assessment not found."

        )



    assessment_questions = (

        db.query(AssessmentQuestion)

        .filter(

            AssessmentQuestion.assessment_id == assessment.id,

        )

        .order_by(

            AssessmentQuestion.display_order.asc(),

        )

        .all()

    )



    configuration = None



    if assessment.question_set_id is not None:

        configuration = (

            db.query(QuestionSetConfiguration)

            .filter(

                QuestionSetConfiguration.question_set_id

                == assessment.question_set_id,

            )

            .first()

        )



    configuration_data = None



    if configuration is not None:

        configuration_data = {

            "total_questions": configuration.total_questions,

            "duration_minutes": configuration.duration_minutes,

            "candidate_instructions": (

                configuration.candidate_instructions

            ),

        }



    return {

        "assessment_id": assessment.id,

        "job_id": assessment.job_id,

        "question_set_id": assessment.question_set_id,

        "variant_number": assessment.variant_number,

        "title": assessment.title,

        "status": assessment.status,

        "review_status": assessment.review_status,

        "reviewer_id": assessment.reviewer_id,

        "reviewed_at": assessment.reviewed_at,

        "review_comment": assessment.review_comment,

        "review_checklist": _normalize_checklist(

            assessment.review_checklist

        ),

        "configuration": configuration_data,

        "questions": assessment_questions,

    }





def _get_pending_assessment(

    db: Session,

    assessment_id: int,

) -> Assessment:

    """

    Load an Assessment that is eligible for a first review decision.

    """

    assessment = db.get(

        Assessment,

        assessment_id,

    )



    if assessment is None:

        raise AssessmentReviewServiceError(

            "Assessment not found."

        )



    if assessment.status != "ready":

        raise AssessmentReviewServiceError(

            "Only ready assessments can be reviewed."

        )



    if assessment.review_status != "pending":

        raise AssessmentReviewServiceError(

            "This assessment has already been reviewed."

        )



    return assessment





def approve_assessment(

    db: Session,

    assessment_id: int,

    reviewer_id: int,

    comment: str | None = None,

    checklist: dict | None = None,

) -> Assessment:

    """

    Approve an assembled Assessment for the publishing stage.

    """

    assessment = _get_pending_assessment(

        db=db,

        assessment_id=assessment_id,

    )



    normalized_comment = (

        comment.strip()

        if comment is not None

        else None

    )



    if normalized_comment == "":

        normalized_comment = None



    assessment.review_status = "approved"

    assessment.reviewer_id = reviewer_id

    assessment.reviewed_at = utc_now()

    assessment.review_comment = normalized_comment

    assessment.review_checklist = _normalize_checklist(

        checklist

    )



    try:

        db.commit()

        db.refresh(assessment)



    except SQLAlchemyError as exc:

        db.rollback()



        raise AssessmentReviewServiceError(

            "Unable to approve assessment."

        ) from exc



    return assessment





def reject_assessment(

    db: Session,

    assessment_id: int,

    reviewer_id: int,

    comment: str | None = None,

    checklist: dict | None = None,

) -> Assessment:

    """

    Reject an assembled Assessment and record the review reason.

    """

    normalized_comment = (

        comment.strip()

        if comment is not None

        else ""

    )



    if not normalized_comment:

        raise AssessmentReviewServiceError(

            "A rejection reason is required."

        )



    assessment = _get_pending_assessment(

        db=db,

        assessment_id=assessment_id,

    )



    assessment.review_status = "rejected"

    assessment.reviewer_id = reviewer_id

    assessment.reviewed_at = utc_now()

    assessment.review_comment = normalized_comment

    assessment.review_checklist = _normalize_checklist(

        checklist

    )



    try:

        db.commit()

        db.refresh(assessment)



    except SQLAlchemyError as exc:

        db.rollback()



        raise AssessmentReviewServiceError(

            "Unable to reject assessment."

        ) from exc



    return assessment





def publish_assessment(

    db: Session,

    assessment_id: int,

) -> Assessment:

    """

    Publish an Assessment only after the independent reviewer

    has approved it.



    Publishing requirements:

    - assessment must exist

    - assessment must be in ready state

    - reviewer approval must be present

    - assessment must contain at least one question

    """

    assessment = db.get(

        Assessment,

        assessment_id,

    )



    if assessment is None:

        raise AssessmentReviewServiceError(

            "Assessment not found."

        )



    if assessment.status != "ready":

        raise AssessmentReviewServiceError(

            "Only ready assessments can be published."

        )



    if assessment.review_status != "approved":

        raise AssessmentReviewServiceError(

            "Assessment must be approved by a reviewer before publishing."

        )



    question_count = (

        db.query(AssessmentQuestion)

        .filter(

            AssessmentQuestion.assessment_id == assessment.id,

        )

        .count()

    )



    if question_count == 0:

        raise AssessmentReviewServiceError(

            "Assessment must contain at least one question before publishing."

        )



    assessment.status = "published"



    try:

        db.commit()

        db.refresh(assessment)



    except SQLAlchemyError as exc:

        db.rollback()



        raise AssessmentReviewServiceError(

            "Unable to publish assessment."

        ) from exc



    return assessment





# ---------------------------------------------------------------------------

# ASSESSMENT SET REVIEW WORKFLOW

# ---------------------------------------------------------------------------





def _get_assigned_assessment_reviewer(

    db: Session,

    job_id: int,

) -> int:

    """

    Resolve the single assessment reviewer assigned to a job.



    JobAssessmentAccess does not contain a role column. Therefore the

    reviewer is identified by:

      - JobAssessmentAccess.job_id

      - JobAssessmentAccess.user_id

      - User.role == "assessment_reviewer"



    Submission already requires exactly one such reviewer. We enforce the

    same invariant here so reviewer access cannot silently become ambiguous.

    """

    rows = (

        db.query(

            User.id,

        )

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

        raise AssessmentReviewServiceError(

            "No Assessment Reviewer is assigned to this job."

        )



    if len(rows) > 1:

        raise AssessmentReviewServiceError(

            "Multiple Assessment Reviewers are assigned to this job. "

            "Assign exactly one reviewer before reviewing the set."

        )



    return int(rows[0][0])





def _get_assessment_set_with_job(

    db: Session,

    assessment_set_id: int,

) -> tuple[AssessmentSet, QuestionSet]:

    """

    Load one AssessmentSet together with its parent QuestionSet.

    """

    assessment_set = db.get(

        AssessmentSet,

        assessment_set_id,

    )



    if assessment_set is None:

        raise AssessmentReviewServiceError(

            "Assessment set not found."

        )



    question_set = db.get(

        QuestionSet,

        assessment_set.question_set_id,

    )



    if question_set is None:

        raise AssessmentReviewServiceError(

            "Parent QuestionSet not found."

        )



    return assessment_set, question_set





def _ensure_assessment_set_reviewer_access(

    db: Session,

    assessment_set: AssessmentSet,

    question_set: QuestionSet,

    reviewer_id: int,

) -> None:

    """

    Ensure the current reviewer is the single reviewer assigned to the

    AssessmentSet's job.

    """

    assigned_reviewer_id = _get_assigned_assessment_reviewer(

        db,

        question_set.job_id,

    )



    if int(assigned_reviewer_id) != int(reviewer_id):

        raise AssessmentReviewServiceError(

            "You are not the assigned reviewer for this assessment set."

        )





def _assessment_set_slots(

    db: Session,

    assessment_set_id: int,

) -> list[QuestionSlot]:

    """

    Return AssessmentSet slots in stable blueprint order.

    """

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





def _assessment_set_review_summary(

    slots: list[QuestionSlot],

) -> dict:

    """

    Calculate reviewer-facing status counts directly from the current

    questions assigned to the set's durable slots.

    """

    total = len(slots)



    filled = sum(

        1

        for slot in slots

        if slot.current_question_id is not None

    )



    pending_review = sum(

        1

        for slot in slots

        if (

            slot.current_question_id is not None

            and slot.current_question is not None

            and str(slot.current_question.status or "").strip().lower()

            == "pending_review"

        )

    )



    approved = sum(

        1

        for slot in slots

        if (

            slot.current_question_id is not None

            and slot.current_question is not None

            and str(slot.current_question.status or "").strip().lower()

            == "approved"

        )

    )



    rejected = sum(

        1

        for slot in slots

        if (

            slot.current_question_id is not None

            and slot.current_question is not None

            and str(slot.current_question.status or "").strip().lower()

            == "rejected"

        )

    )



    return {

        "total_slots": total,

        "filled_slots": filled,

        "remaining_slots": max(total - filled, 0),

        "pending_review": pending_review,

        "approved": approved,

        "rejected": rejected,

    }





def get_assessment_set_review_queue(
    db: Session,
    reviewer_id: int,
) -> list[AssessmentSetReviewQueueItemData]:
    """
    Return submitted AssessmentSets assigned to the current reviewer.

    The top-level queue remains actionable-only so existing queue semantics
    are preserved. Every submitted item also carries the status of all
    sibling assessment-set variants belonging to the same QuestionSet so the
    reviewer can see Set A and Set B together.
    """
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
            AssessmentSet.status == "submitted_for_review",
            JobAssessmentAccess.user_id == reviewer_id,
            User.role == "assessment_reviewer",
        )
        .order_by(
            AssessmentSet.created_at.asc(),
            AssessmentSet.variant_number.asc(),
            AssessmentSet.id.asc(),
        )
        .all()
    )

    result = []
    variant_cache: dict[int, list[AssessmentSetReviewVariantData]] = {}

    for assessment_set, question_set in rows:
        variants = variant_cache.get(question_set.id)

        if variants is None:
            sibling_sets = (
                db.query(AssessmentSet)
                .filter(AssessmentSet.question_set_id == question_set.id)
                .order_by(
                    AssessmentSet.variant_number.asc(),
                    AssessmentSet.id.asc(),
                )
                .all()
            )

            variants = []

            for sibling_set in sibling_sets:
                sibling_slots = _assessment_set_slots(
                    db,
                    sibling_set.id,
                )
                sibling_summary = _assessment_set_review_summary(
                    sibling_slots,
                )
                sibling_status = str(
                    sibling_set.status or "draft"
                ).strip().lower()
                is_openable = sibling_status == "submitted_for_review"

                if is_openable:
                    lock_reason = None
                elif sibling_status == "draft":
                    lock_reason = (
                        "The Assessment Manager has not submitted this set for review yet."
                    )
                elif sibling_status == "rejected":
                    lock_reason = (
                        "This set was rejected and must be revised before it can be reviewed again."
                    )
                elif sibling_status == "approved":
                    lock_reason = "This set has already been approved."
                else:
                    lock_reason = (
                        "This set is not currently available for reviewer action."
                    )

                variants.append(
                    AssessmentSetReviewVariantData(
                        id=sibling_set.id,
                        variant_number=sibling_set.variant_number,
                        label=sibling_set.label,
                        status=sibling_set.status,
                        question_count=sibling_summary["filled_slots"],
                        pending_review_count=sibling_summary["pending_review"],
                        approved_count=sibling_summary["approved"],
                        is_openable=is_openable,
                        lock_reason=lock_reason,
                    )
                )

            variant_cache[question_set.id] = variants

        slots = _assessment_set_slots(
            db,
            assessment_set.id,
        )

        summary = _assessment_set_review_summary(
            slots,
        )

        job = getattr(question_set, "job", None)
        job_title = (
            job.title
            if job is not None and getattr(job, "title", None)
            else f"Job {question_set.job_id}"
        )

        result.append(
            AssessmentSetReviewQueueItemData(
                id=assessment_set.id,
                job_id=question_set.job_id,
                job_title=job_title,
                question_set_id=question_set.id,
                variant_number=assessment_set.variant_number,
                title=(
                    f"{question_set.name} — "
                    f"Set {assessment_set.label}"
                ),
                label=assessment_set.label,
                status=assessment_set.status,
                created_at=assessment_set.created_at,
                question_count=summary["filled_slots"],
                pending_review_count=summary["pending_review"],
                approved_count=summary["approved"],
                assessment_sets=variants,
            )
        )

    return result


def _load_rating_map(

    db: Session,

    question_ids: list[int],

) -> dict[int, dict]:

    """

    Load manager/reviewer ratings for the questions shown in the

    AssessmentSet review package.



    Ratings are stored on the questions table but are not represented as

    SQLAlchemy model attributes in the current Question model.

    """

    if not question_ids:

        return {}



    rating_query = text(

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

        rating_query,

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





def _assessment_set_question_response(

    slot: QuestionSlot,

    section_map: dict[int, Section],

    skill_map: dict[int, Skill],

    rating_map: dict[int, dict],

) -> dict:

    """

    Build the reviewer-facing representation of one current slot question.

    """

    question = slot.current_question



    if question is None:

        return {

            "slot_id": slot.id,

            "section_id": slot.section_id,

            "section_name": (

                section_map.get(slot.section_id).name

                if slot.section_id in section_map

                else None

            ),

            "skill_id": slot.skill_id,

            "skill_name": (

                skill_map.get(slot.skill_id).name

                if slot.skill_id in skill_map

                else None

            ),

            "section_type": slot.section_type,

            "difficulty": slot.difficulty,

            "slot_number": slot.slot_number,

            "preferred_question_type": slot.preferred_question_type,

            "question_id": None,

            "question_text": None,

            "question_type": slot.preferred_question_type,

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



    ratings = rating_map.get(

        int(question.id),

        {

            "manager_rating": None,

            "reviewer_rating": None,

        },

    )



    section = section_map.get(slot.section_id)

    skill = skill_map.get(slot.skill_id)



    return {

        "slot_id": slot.id,

        "section_id": slot.section_id,

        "section_name": section.name if section else None,

        "skill_id": slot.skill_id,

        "skill_name": skill.name if skill else None,

        "section_type": slot.section_type,

        "difficulty": slot.difficulty,

        "slot_number": slot.slot_number,

        "preferred_question_type": slot.preferred_question_type,

        "question_id": question.id,

        "question_text": question.question_text,

        "question_type": question.question_type,

        "options": question.options or [],

        "correct_answer": question.correct_answer,

        "explanation": question.explanation,

        "status": question.status,

        "source": question.source,

        "version": question.version,

        "manager_rating": ratings["manager_rating"],

        "reviewer_rating": ratings["reviewer_rating"],

        "rejection_reason": question.rejection_reason,

        "created_at": question.created_at,

        "updated_at": question.updated_at,

    }





def get_assessment_set_review_package(

    db: Session,

    assessment_set_id: int,

    reviewer_id: int,

) -> dict:

    """

    Return the complete reviewer package for one submitted AssessmentSet.



    The package is built from the durable AssessmentSet -> QuestionSlot ->

    current Question structure rather than from the assembled Assessment

    snapshot used by the legacy workflow.

    """

    assessment_set, question_set = _get_assessment_set_with_job(

        db,

        assessment_set_id,

    )



    _ensure_assessment_set_reviewer_access(

        db,

        assessment_set,

        question_set,

        reviewer_id,

    )



    if assessment_set.status != "submitted_for_review":

        raise AssessmentReviewServiceError(

            "Only assessment sets submitted for review can be opened from "

            "the reviewer queue."

        )



    slots = _assessment_set_slots(

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



    section_map = {

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



    skill_map = {

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

        int(slot.current_question_id)

        for slot in slots

        if slot.current_question_id is not None

    ]



    rating_map = _load_rating_map(

        db,

        question_ids,

    )



    questions = [

        _assessment_set_question_response(

            slot=slot,

            section_map=section_map,

            skill_map=skill_map,

            rating_map=rating_map,

        )

        for slot in slots

    ]



    configuration = (

        db.query(QuestionSetConfiguration)

        .filter(

            QuestionSetConfiguration.question_set_id

            == question_set.id,

        )

        .first()

    )



    configuration_data = None



    if configuration is not None:

        configuration_data = {

            "total_questions": configuration.total_questions,

            "duration_minutes": configuration.duration_minutes,

            "candidate_instructions": (

                configuration.candidate_instructions

            ),

        }



    job = getattr(question_set, "job", None)

    hr_user = (
        db.query(User)
        .filter(
            User.id == (assessment_set.sent_to_hr_user_id or job.created_by),
            User.role == "recruiter",
        )
        .first()
        if job is not None
        else None
    )
    hr_contact_data = (
        {
            "id": hr_user.id,
            "name": hr_user.full_name or hr_user.username,
            "email": hr_user.email,
        }
        if hr_user is not None
        else None
    )

    summary = _assessment_set_review_summary(
        slots,
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

        "review_status": "pending",

        "reviewer_id": reviewer_id,

        "reviewed_at": None,
        "hr_contact": hr_contact_data,

        "review_comment": None,

        "review_checklist": _normalize_checklist(None),

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