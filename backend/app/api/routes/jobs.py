from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models import Job, User
from app.schemas.job import (
    JobCreate,
    JobResponse,
    SkillExtractionResponseSchema,
    SkillReviewConfirmResponseSchema,
    SkillReviewResponseSchema,
    SkillReviewUpdateSchema,
)
from app.services.llm_service import LLMServiceError
from app.services.skill_review_service import (
    SkillReviewError,
    confirm_job_skill_review,
    get_job_skills,
    get_or_create_review,
    update_job_skills,
)
from app.services.skill_service import extract_and_save_job_skills


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)


@router.post(
    "",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_job(
    job: JobCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    new_job = Job(
        title=job.title,
        description=job.description,
        created_by=current_user["user_id"],
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    return new_job


@router.post(
    "/upload",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_job_description(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    allowed_types = {
        "text/plain",
        "application/pdf",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported file type. "
                "Only TXT and PDF files are supported."
            ),
        )

    content = file.file.read()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if file.content_type == "text/plain":
        description = content.decode("utf-8", errors="ignore").strip()
    else:
        try:
            reader = PdfReader(BytesIO(content))
            description = "\n".join(
                page.extract_text() or ""
                for page in reader.pages
            ).strip()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to extract text from the uploaded PDF.",
            )

    if len(description) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Job description must contain at least 20 characters.",
        )

    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    title = (
        file.filename.rsplit(".", 1)[0]
        if file.filename
        else "Uploaded Job"
    )

    new_job = Job(
        title=title[:255],
        description=description,
        created_by=current_user["user_id"],
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    return new_job


@router.post(
    "/{job_id}/skills/extract",
    response_model=SkillExtractionResponseSchema,
)
def extract_job_skills(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    if job.created_by != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to extract skills for this job.",
        )

    try:
        skills = extract_and_save_job_skills(db, job)

        # Every fresh extraction must be reviewed again.
        review = get_or_create_review(db, job.id)
        review.status = "pending"
        review.reviewed_by = None
        review.reviewed_at = None
        db.commit()

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    except LLMServiceError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Skill extraction service is currently unavailable.",
        )

    return SkillExtractionResponseSchema(
        job_id=job.id,
        skills=[
            {
                "name": skill.name,
                "category": skill.category,
            }
            for skill in skills
        ],
    )


@router.get(
    "/{job_id}/skills/review",
    response_model=SkillReviewResponseSchema,
)
def get_skill_review(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    if job.created_by != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to review skills for this job.",
        )

    review = get_or_create_review(db, job.id)
    skills = get_job_skills(db, job.id)

    return SkillReviewResponseSchema(
        job_id=job.id,
        status=review.status,
        skills=[
            {"name": skill.name}
            for skill in skills
        ],
        reviewed_by=review.reviewed_by,
        reviewed_at=review.reviewed_at,
    )


@router.put(
    "/{job_id}/skills/review",
    response_model=SkillReviewResponseSchema,
)
def update_skill_review(
    job_id: int,
    review_data: SkillReviewUpdateSchema,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    if job.created_by != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to edit skills for this job.",
        )

    try:
        update_job_skills(
            db=db,
            job=job,
            skill_names=[
                skill.name
                for skill in review_data.skills
            ],
            reviewer_id=current_user["user_id"],
        )
    except SkillReviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    review = get_or_create_review(db, job.id)
    skills = get_job_skills(db, job.id)

    return SkillReviewResponseSchema(
        job_id=job.id,
        status=review.status,
        skills=[
            {"name": skill.name}
            for skill in skills
        ],
        reviewed_by=review.reviewed_by,
        reviewed_at=review.reviewed_at,
    )


@router.post(
    "/{job_id}/skills/review/confirm",
    response_model=SkillReviewConfirmResponseSchema,
)
def confirm_skill_review(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    if job.created_by != current_user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to confirm skills for this job.",
        )

    try:
        review = confirm_job_skill_review(
            db=db,
            job_id=job.id,
            reviewer_id=current_user["user_id"],
        )
    except SkillReviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    skills = get_job_skills(db, job.id)

    return SkillReviewConfirmResponseSchema(
        job_id=job.id,
        status="confirmed",
        skills=[
            {"name": skill.name}
            for skill in skills
        ],
        reviewed_by=review.reviewed_by,
        reviewed_at=review.reviewed_at,
    )


@router.get(
    "",
    response_model=list[JobResponse],
)
def get_jobs(
    db: Session = Depends(get_db),
):
    return db.query(Job).all()


@router.get(
    "/{job_id}",
    response_model=JobResponse,
)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return job