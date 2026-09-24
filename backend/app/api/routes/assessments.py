from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models import (
    Assessment,
    AssessmentQuestion,
    Attempt,
    JobAssessmentAccess,
    QuestionSet,
)
from app.schemas.assessment import (
    AssessmentAssemblyRequest,
    AssessmentResponse,
)
from app.services.assessment_service import (
    AssessmentServiceError,
    assemble_assessment,
)


router = APIRouter(
    prefix="/assessments",
    tags=["Assessments"],
)


@router.post(
    "/assemble",
    response_model=AssessmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assemble_assessment_endpoint(
    request: AssessmentAssemblyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    question_set = db.get(
        QuestionSet,
        request.question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found",
        )

    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == question_set.job_id,
            JobAssessmentAccess.user_id == current_user["user_id"],
        )
        .first()
    )

    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to assemble an assessment "
                "for this job."
            ),
        )

    try:
        assessment = assemble_assessment(
            db=db,
            question_set_id=request.question_set_id,
            title=request.title,
        )
    except AssessmentServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return assessment


@router.get("")
def get_candidate_assessments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    rows = (
        db.query(Attempt, Assessment)
        .join(
            Assessment,
            Attempt.assessment_id == Assessment.id,
        )
        .filter(
            Attempt.candidate_id == current_user["user_id"]
        )
        .order_by(
            Assessment.created_at.desc(),
            Attempt.started_at.desc(),
        )
        .all()
    )

    # Keep only the latest attempt for each assessment.
    latest_by_assessment = {}

    for attempt, assessment in rows:
        if assessment.id not in latest_by_assessment:
            latest_by_assessment[assessment.id] = {
                "assessment_id": assessment.id,
                "job_id": assessment.job_id,
                "title": assessment.title,
                "assessment_status": assessment.status,
                "attempt_id": attempt.id,
                "attempt_status": attempt.status,
                "started_at": attempt.started_at,
                "submitted_at": attempt.submitted_at,
            }

    return list(latest_by_assessment.values())


@router.get("/{assessment_id}")
def get_assessment_for_candidate(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("candidate")),
):
    assessment = (
        db.query(Assessment)
        .filter(
            Assessment.id == assessment_id
        )
        .first()
    )

    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    assigned_attempt = (
        db.query(Attempt)
        .filter(
            Attempt.assessment_id == assessment_id,
            Attempt.candidate_id == current_user["user_id"],
        )
        .order_by(
            Attempt.started_at.desc()
        )
        .first()
    )

    if assigned_attempt is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment not assigned to this candidate",
        )

    assessment_questions = (
        db.query(AssessmentQuestion)
        .filter(
            AssessmentQuestion.assessment_id == assessment.id
        )
        .order_by(
            AssessmentQuestion.display_order
        )
        .all()
    )

    questions = [
        {
            "id": item.id,
            "question_id": item.question_id,
            "display_order": item.display_order,
            "question_text": item.question_text,
            "question_type": item.question_type,
            "skill_id": item.skill_id,
            "difficulty": item.difficulty,
            "options": item.options,
        }
        for item in assessment_questions
    ]

    return {
        "assessment_id": assessment.id,
        "job_id": assessment.job_id,
        "title": assessment.title,
        "status": assessment.status,
        "attempt_id": assigned_attempt.id,
        "questions": questions,
    }