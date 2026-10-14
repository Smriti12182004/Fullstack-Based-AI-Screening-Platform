from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)

from sqlalchemy.orm import Session

from app.core.dependencies import (
    require_any_role,
    require_role,
)

from app.db.session import get_db

from app.models import (
    Job,
    JobAssessmentAccess,
    QuestionBank,
    User,
)

from app.schemas.question_bank import (
    QuestionBankCreate,
    QuestionBankResponse,
)

from app.services.question_bank_service import (
    QuestionBankServiceError,
    create_question_bank,
    get_question_bank,
    get_question_banks,
)


router = APIRouter(
    prefix="/question-banks",
    tags=["Question Banks"],
)


def _manager_has_job_access(
    db: Session,
    job_id: int,
    user_id: int,
) -> bool:
    access = (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == job_id,
            JobAssessmentAccess.user_id == user_id,
        )
        .first()
    )

    return access is not None


@router.get(
    "",
    response_model=list[QuestionBankResponse],
)
def list_question_banks_endpoint(
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
        require_any_role(
            "recruiter",
            "assessment_manager",
            "assessment_reviewer",
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

    # ========================================================
    # ASSESSMENT REVIEWER
    # ========================================================
    #
    # Reviewer has read-only access to all question banks.
    #
    if current_user["role"] == "assessment_reviewer":
        return get_question_banks(
            db=db,
            job_id=job_id,
            hiring_year=hiring_year,
        )

    # ========================================================
    # RECRUITER / HR
    # ========================================================
    #
    # HR can view question banks belonging to jobs created by
    # that recruiter.
    #
    # HR remains read-only. No create/update/delete operation
    # is exposed through this role.
    #
    if current_user["role"] == "recruiter":

        accessible_banks = (
            db.query(QuestionBank)
            .join(
                Job,
                Job.id == QuestionBank.job_id,
            )
            .filter(
                Job.created_by
                == current_user["user_id"],
            )
        )

        if job_id is not None:
            accessible_banks = accessible_banks.filter(
                QuestionBank.job_id == job_id
            )

        if hiring_year is not None:
            accessible_banks = accessible_banks.filter(
                QuestionBank.hiring_year
                == hiring_year
            )

        return (
            accessible_banks
            .order_by(
                QuestionBank.hiring_year.desc(),
                QuestionBank.created_at.desc(),
                QuestionBank.id.desc(),
            )
            .all()
        )

    # ========================================================
    # ASSESSMENT MANAGER
    # ========================================================
    #
    # Manager can only see banks belonging to jobs explicitly
    # assigned to them.
    #
    accessible_banks = (
        db.query(QuestionBank)
        .join(
            JobAssessmentAccess,
            JobAssessmentAccess.job_id
            == QuestionBank.job_id,
        )
        .filter(
            JobAssessmentAccess.user_id
            == current_user["user_id"],
        )
    )

    if job_id is not None:
        accessible_banks = accessible_banks.filter(
            QuestionBank.job_id == job_id
        )

    if hiring_year is not None:
        accessible_banks = accessible_banks.filter(
            QuestionBank.hiring_year
            == hiring_year
        )

    return (
        accessible_banks
        .order_by(
            QuestionBank.hiring_year.desc(),
            QuestionBank.created_at.desc(),
            QuestionBank.id.desc(),
        )
        .all()
    )


@router.post(
    "",
    response_model=QuestionBankResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_question_bank_endpoint(
    request: QuestionBankCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
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

    if not _manager_has_job_access(
        db=db,
        job_id=request.job_id,
        user_id=current_user["user_id"],
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to manage "
                "the question bank for this job."
            ),
        )

    try:
        return create_question_bank(
            db=db,
            job_id=request.job_id,
            hiring_year=request.hiring_year,
            name=request.name,
            description=request.description,
            created_by=current_user["user_id"],
        )

    except QuestionBankServiceError as exc:
        message = str(exc)

        if message in {
            "Job not found.",
            "Question bank not found.",
        }:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=message,
        ) from exc


@router.get(
    "/{question_bank_id}",
    response_model=QuestionBankResponse,
)
def get_question_bank_endpoint(
    question_bank_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "recruiter",
            "assessment_manager",
            "assessment_reviewer",
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

    try:
        bank = get_question_bank(
            db=db,
            question_bank_id=question_bank_id,
        )

    except QuestionBankServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # ========================================================
    # ASSESSMENT REVIEWER
    # ========================================================
    #
    # Reviewer can read any question bank.
    #
    if current_user["role"] == "assessment_reviewer":
        return bank

    # ========================================================
    # RECRUITER / HR
    # ========================================================
    #
    # HR may only read banks belonging to jobs that HR owns.
    #
    if current_user["role"] == "recruiter":

        job = db.get(
            Job,
            bank.job_id,
        )

        if job is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job not found",
            )

        if job.created_by != current_user["user_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not authorized to access "
                    "this question bank."
                ),
            )

        return bank

    # ========================================================
    # ASSESSMENT MANAGER
    # ========================================================
    #
    # Manager may only read a bank when its job has been shared
    # with that manager.
    #
    if not _manager_has_job_access(
        db=db,
        job_id=bank.job_id,
        user_id=current_user["user_id"],
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You are not authorized to access "
                "this question bank."
            ),
        )

    return bank