from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)

from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role, require_role
from app.db.session import get_db

from app.models import (
    Job,
    JobAssessmentAccess,
    JobSkill,
    JobSkillReview,
    Question,
    QuestionBank,
    QuestionSet,
    Skill,
    User,
)

from app.schemas.question import (
    QuestionCreate,
    QuestionResponse,
)

from app.schemas.question_set import (
    QuestionSetCreate,
    QuestionSetResponse,
)

from app.services.question_service import (
    QuestionServiceError,
    create_question,
)

from app.services.question_set_service import (
    QuestionSetServiceError,
    create_question_set,
    get_accessible_job_skills,
    get_question_set,
    get_question_sets,
    submit_question_set_for_review,
)


router = APIRouter(
    prefix="/question-sets",
    tags=["Question Sets"],
)


def _get_manager_question_set_access(
    db: Session,
    question_set: QuestionSet,
    user_id: int,
) -> bool:
    """
    Check whether the current Assessment Manager has access
    to the job associated with the question set.
    """

    access = (
        db.query(
            JobAssessmentAccess
        )
        .filter(
            JobAssessmentAccess.job_id
            == question_set.job_id,
            JobAssessmentAccess.user_id
            == user_id,
        )
        .first()
    )

    return access is not None


def _get_or_create_annual_question_bank(
    db: Session,
    question_set: QuestionSet,
    created_by: int,
) -> QuestionBank:
    """
    Return the annual QuestionBank for the question set.

    The QuestionBank is unique by job + hiring year.
    """

    if question_set.hiring_year is None:
        raise QuestionSetServiceError(
            "Question set hiring year is not configured."
        )

    question_bank = (
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

    if question_bank is not None:
        return question_bank

    job_title = (
        question_set.job.title
        if question_set.job is not None
        else f"Job {question_set.job_id}"
    )

    question_bank = QuestionBank(
        job_id=question_set.job_id,
        hiring_year=question_set.hiring_year,
        name=(
            f"{job_title} - "
            f"{question_set.hiring_year} Question Bank"
        ),
        description=(
            f"Annual question bank for "
            f"{job_title}."
        ),
        status="active",
        created_by=created_by,
    )

    db.add(question_bank)

    try:
        db.flush()
    except Exception as exc:
        db.rollback()

        raise QuestionSetServiceError(
            "Unable to create the annual question bank."
        ) from exc

    return question_bank


# ============================================================
# ASSIGNED JOBS
# ============================================================

@router.get(
    "/assigned-jobs",
)
def get_assigned_jobs_endpoint(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    """
    Return jobs explicitly assigned to the current
    Assessment Manager.
    """

    rows = (
        db.query(Job)
        .join(
            JobAssessmentAccess,
            JobAssessmentAccess.job_id == Job.id,
        )
        .filter(
            JobAssessmentAccess.user_id
            == current_user["user_id"]
        )
        .order_by(
            Job.created_at.desc(),
            Job.id.desc(),
        )
        .all()
    )

    results = []

    for job in rows:
        skill_rows = (
            db.query(Skill)
            .join(
                JobSkill,
                JobSkill.skill_id == Skill.id,
            )
            .filter(
                JobSkill.job_id == job.id,
            )
            .order_by(
                Skill.name.asc(),
                Skill.id.asc(),
            )
            .all()
        )

        skill_review = (
            db.query(JobSkillReview)
            .filter(
                JobSkillReview.job_id == job.id,
            )
            .first()
        )

        results.append(
            {
                "id": job.id,
                "title": job.title,
                "description": job.description,
                "created_at": job.created_at,
                "created_by": job.created_by,
                "skill_review_status": (
                    skill_review.status
                    if skill_review is not None
                    else "pending"
                ),
                "skills": [
                    {
                        "id": skill.id,
                        "name": skill.name,
                    }
                    for skill in skill_rows
                ],
            }
        )

    return results


# ============================================================
# CREATE QUESTION SET
# ============================================================

@router.post(
    "",
    response_model=QuestionSetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_question_set_endpoint(
    question_set: QuestionSetCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role(
            "assessment_manager"
        )
    ),
):
    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    access = (
        db.query(
            JobAssessmentAccess
        )
        .filter(
            JobAssessmentAccess.job_id
            == question_set.job_id,
            JobAssessmentAccess.user_id
            == current_user["user_id"],
        )
        .first()
    )

    if access is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to create a question set "
                "for this job."
            ),
        )

    try:
        created_question_set = create_question_set(
            db=db,
            job_id=question_set.job_id,
            hiring_year=question_set.hiring_year,
            hiring_cycle=question_set.hiring_cycle,
            name=question_set.name,
            description=question_set.description,
            created_by=current_user["user_id"],
            variant_count=question_set.variant_count,
        )

        # Ensure the annual Question Bank exists immediately
        # when the manager creates the Question Set.
        _get_or_create_annual_question_bank(
            db=db,
            question_set=created_question_set,
            created_by=current_user["user_id"],
        )

        db.commit()
        db.refresh(created_question_set)

        return created_question_set

    except QuestionSetServiceError as exc:
        db.rollback()

        message = str(exc)

        if message == "Job not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


# ============================================================
# LIST QUESTION SETS
# ============================================================

@router.get(
    "",
    response_model=list[QuestionSetResponse],
)
def get_question_sets_endpoint(
    job_id: int | None = Query(
        default=None,
        gt=0,
    ),
    hiring_year: int | None = Query(
        default=None,
        ge=2020,
        le=2100,
    ),
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role(
            "assessment_manager"
        )
    ),
):
    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    query_sets = get_question_sets(
        db=db,
        job_id=job_id,
        hiring_year=hiring_year,
    )

    allowed_job_ids = {
        row.job_id
        for row in (
            db.query(
                JobAssessmentAccess
            )
            .filter(
                JobAssessmentAccess.user_id
                == current_user["user_id"]
            )
            .all()
        )
    }

    query_sets = [
        question_set
        for question_set in query_sets
        if question_set.job_id in allowed_job_ids
    ]

    return query_sets


# ============================================================
# QUESTION SET QUESTIONS
# ============================================================

@router.get(
    "/{question_set_id}/questions",
    response_model=list[QuestionResponse],
)
def get_question_set_questions_endpoint(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role(
            "assessment_manager"
        )
    ),
):
    """
    Return all questions belonging to the annual Question Bank
    associated with this Question Set.
    """

    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    question_set = get_question_set(
        db=db,
        question_set_id=question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found",
        )

    if not _get_manager_question_set_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to access questions "
                "for this question set."
            ),
        )

    if question_set.hiring_year is None:
        return []

    question_bank = (
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

    if question_bank is None:
        return []

    return (
        db.query(
            Question
        )
        .filter(
            Question.question_bank_id
            == question_bank.id,
        )
        .order_by(
            Question.difficulty.asc(),
            Question.id.asc(),
        )
        .all()
    )


# ============================================================
# ADD QUESTION TO QUESTION SET
# ============================================================

@router.post(
    "/{question_set_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_question_for_question_set_endpoint(
    question_set_id: int,
    question: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role(
            "assessment_manager"
        )
    ),
):
    """
    Create a manual question directly inside the annual
    question bank associated with the selected Question Set.
    """

    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    question_set = get_question_set(
        db=db,
        question_set_id=question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found",
        )

    if not _get_manager_question_set_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to add questions "
                "to this question set."
            ),
        )

    if question_set.status not in {
        "draft",
        "rejected",
    }:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Questions can only be added while the question set "
                "is in draft or rejected state."
            ),
        )

    try:
        question_bank = _get_or_create_annual_question_bank(
            db=db,
            question_set=question_set,
            created_by=current_user["user_id"],
        )

        created_question = create_question(
            db=db,
            question_text=question.question_text,
            question_type=question.question_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            created_by=current_user["user_id"],
            question_bank_id=question_bank.id,
        )

        return created_question

    except QuestionServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    except QuestionSetServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


# ============================================================
# QUESTION SET SKILLS
# ============================================================

@router.get(
    "/{question_set_id}/skills",
)
def get_question_set_skills_endpoint(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "assessment_manager",
            "assessment_reviewer",
        )
    ),
):
    """
    Return the confirmed skills belonging to the job
    associated with this Question Set.
    """

    question_set = get_question_set(
        db=db,
        question_set_id=question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found",
        )

    if not _get_manager_question_set_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to access "
                "skills for this question set."
            ),
        )

    try:
        skills = get_accessible_job_skills(
            db=db,
            question_set_id=question_set_id,
            user_id=current_user["user_id"],
        )

        return [
            {
                "id": skill.id,
                "name": skill.name,
            }
            for skill in skills
        ]

    except QuestionSetServiceError as exc:
        message = str(exc)

        if message == "Question set not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


# ============================================================
# SUBMIT QUESTION SET FOR REVIEW
# ============================================================

@router.post(
    "/{question_set_id}/submit-review",
    response_model=QuestionSetResponse,
)
def submit_question_set_for_review_endpoint(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role(
            "assessment_manager"
        )
    ),
):
    """
    Explicit Assessment Manager handoff to the independent reviewer.
    """

    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    question_set = get_question_set(
        db=db,
        question_set_id=question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found",
        )

    if not _get_manager_question_set_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to submit this question set "
                "for review."
            ),
        )

    try:
        return submit_question_set_for_review(
            db=db,
            question_set_id=question_set_id,
        )

    except QuestionSetServiceError as exc:
        message = str(exc)

        if message == "Question set not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


# ============================================================
# GET SINGLE QUESTION SET
# ============================================================

@router.get(
    "/{question_set_id}",
    response_model=QuestionSetResponse,
)
def get_question_set_endpoint(
    question_set_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role(
            "assessment_manager"
        )
    ),
):
    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    question_set = get_question_set(
        db=db,
        question_set_id=question_set_id,
    )

    if question_set is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found",
        )

    if not _get_manager_question_set_access(
        db=db,
        question_set=question_set,
        user_id=current_user["user_id"],
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to access this question set."
            ),
        )

    return question_set