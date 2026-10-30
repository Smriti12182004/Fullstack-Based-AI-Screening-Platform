from app.models.assessment import Assessment
from app.models.assessment_assignment import AssessmentAssignment
from app.models.attempt import Attempt
from app.models.job_skill_review import JobSkillReview
from app.models.question_set import QuestionSet
from app.models.result import Result


PENDING = "pending"
IN_PROGRESS = "in_progress"
COMPLETED = "completed"


def get_job_workflow_status(db, job_id: int) -> str:
    """
    Calculate workflow status using persisted assessment and scoring data.

    Completed requires every assessment for the job to be published,
    every assessment to have candidate assignments, every assigned
    candidate's latest attempt to be submitted, and every corresponding
    result to have finalized scoring.
    """
    review = db.get(JobSkillReview, job_id)

    has_question_set = (
        db.query(QuestionSet.id)
        .filter(QuestionSet.job_id == job_id)
        .first()
        is not None
    )

    assessments = (
        db.query(Assessment)
        .filter(Assessment.job_id == job_id)
        .order_by(Assessment.id.asc())
        .all()
    )

    skills_confirmed = (
        review is not None
        and str(review.status or "").strip().lower() == "confirmed"
    )

    if not skills_confirmed and not has_question_set and not assessments:
        return PENDING

    if not assessments:
        return IN_PROGRESS

    for assessment in assessments:
        if str(assessment.status or "").strip().lower() != "published":
            return IN_PROGRESS

        assignments = (
            db.query(AssessmentAssignment)
            .filter(
                AssessmentAssignment.assessment_id == assessment.id
            )
            .all()
        )

        if not assignments:
            return IN_PROGRESS

        for assignment in assignments:
            attempt = (
                db.query(Attempt)
                .filter(
                    Attempt.assessment_id == assessment.id,
                    Attempt.candidate_id == assignment.candidate_id,
                )
                .order_by(Attempt.id.desc())
                .first()
            )

            if (
                attempt is None
                or str(attempt.status or "").strip().lower() != "submitted"
                or attempt.submitted_at is None
            ):
                return IN_PROGRESS

            result = (
                db.query(Result)
                .filter(Result.attempt_id == attempt.id)
                .order_by(Result.id.desc())
                .first()
            )

            if (
                result is None
                or str(result.status or "").strip().lower() != "completed"
                or result.score is None
            ):
                return IN_PROGRESS

    return COMPLETED
