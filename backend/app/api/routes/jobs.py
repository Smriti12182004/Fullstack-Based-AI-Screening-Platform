import logging
from io import BytesIO

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from pypdf import PdfReader
from starlette.responses import Response
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role, require_role
from app.db.session import get_db
from app.models import Job, JobAssessmentAccess, User
from app.schemas.job import (
    BulkJobDeleteRequest,
    BulkJobDeleteResponse,
    JobCreate,
    JobDescriptionGenerationRequest,
    JobDescriptionGenerationResponse,
    JobResponse,
    SkillExtractionResponseSchema,
    SkillReviewConfirmResponseSchema,
    SkillReviewResponseSchema,
    SkillReviewUpdateSchema,
)
from app.services.llm_service import (
    LLMServiceError,
    count_words,
    generate_job_description,
)
from app.services.skill_review_service import (
    SkillReviewError,
    confirm_job_skill_review,
    get_job_skill_review_items,
    get_or_create_review,
    update_job_skills,
)
from app.services.skill_service import extract_and_save_job_skills


logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"],
)


def _get_assigned_manager_access(
    db: Session,
    job_id: int,
    user_id: int,
):
    """Return manager access for a job when it is assigned to them."""
    return (
        db.query(JobAssessmentAccess)
        .filter(
            JobAssessmentAccess.job_id == job_id,
            JobAssessmentAccess.user_id == user_id,
        )
        .first()
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
    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    new_job = Job(
        title=job.title,
        description=job.description,
        experience_required=job.experience_required,
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
        description = content.decode(
            "utf-8",
            errors="ignore",
        ).strip()
    else:
        try:
            reader = PdfReader(
                BytesIO(content)
            )

            description = "\n".join(
                page.extract_text() or ""
                for page in reader.pages
            ).strip()

        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Unable to extract text from "
                    "the uploaded PDF."
                ),
            ) from exc

    if len(description) < 20:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Job description must contain at least "
                "20 characters."
            ),
        )

    original_document_data = (
        content
        if file.content_type == "application/pdf"
        else None
    )

    original_document_filename = (
        file.filename
        if file.content_type == "application/pdf"
        else None
    )

    original_document_content_type = (
        file.content_type
        if file.content_type == "application/pdf"
        else None
    )

    user = db.get(
        User,
        current_user["user_id"],
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    title = (
        file.filename.rsplit(
            ".",
            1,
        )[0]
        if file.filename
        else "Uploaded Job"
    )

    new_job = Job(
        title=title[:255],
        description=description,
        experience_required=None,
        original_document_data=original_document_data,
        original_document_filename=original_document_filename,
        original_document_content_type=original_document_content_type,
        created_by=current_user["user_id"],
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    return new_job


@router.post(
    "/generate-description",
    response_model=JobDescriptionGenerationResponse,
)
def generate_job_description_endpoint(
    request: JobDescriptionGenerationRequest,
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    try:
        description = generate_job_description(
            title=request.title,
            skills=request.skills,
            experience_required=request.experience_required,
            max_words=request.max_words,
            output_format=request.output_format,
            additional_instructions=request.additional_instructions,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    except LLMServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Job description generation service is "
                "currently unavailable."
            ),
        ) from exc

    return JobDescriptionGenerationResponse(
        title=request.title,
        description=description,
        word_count=count_words(description),
    )


@router.post(
    "/{job_id}/skills/extract",
    response_model=SkillExtractionResponseSchema,
    response_model_exclude_defaults=True,
)
def extract_job_skills(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "recruiter",
            "assessment_manager",
        )
    ),
):
    job = db.get(
        Job,
        job_id,
    )

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    role = current_user.get("role")
    user_id = current_user["user_id"]

    if role == "recruiter":

        if job.created_by != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not allowed to extract skills "
                    "for this job."
                ),
            )

    elif role == "assessment_manager":

        access = _get_assigned_manager_access(
            db=db,
            job_id=job_id,
            user_id=user_id,
        )

        if access is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You can only extract skills for jobs "
                    "shared with you by HR."
                ),
            )

        review = get_or_create_review(
            db,
            job.id,
        )

        if review.status == "confirmed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "HR has already confirmed the skills for this job. "
                    "Use the confirmed skills instead of re-extracting them."
                ),
            )

    try:
        extraction = extract_and_save_job_skills(
            db,
            job,
        )

        review = get_or_create_review(
            db,
            job.id,
        )

        review.status = "pending"
        review.reviewed_by = None
        review.reviewed_at = None

        db.commit()

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    except LLMServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Skill extraction service is currently "
                "unavailable."
            ),
        ) from exc

    persisted_skill_metadata = {
        item["name"].strip().lower(): item
        for item in get_job_skill_review_items(db, job.id)
    }

    return SkillExtractionResponseSchema(
        job_id=job.id,
        skills=[
            {
                "name": skill.name,
                "category": skill.category,
                "review_category": persisted_skill_metadata.get(
                    skill.name.strip().lower(), {}
                ).get("category", "technical"),
                "is_mandatory": persisted_skill_metadata.get(
                    skill.name.strip().lower(), {}
                ).get("is_mandatory", True),
            }
            for skill in extraction.skills
        ],
        experience_required=extraction.experience_required,
    )


@router.get(
    "/{job_id}/skills/review",
    response_model=SkillReviewResponseSchema,
)
def get_skill_review(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    job = db.get(
        Job,
        job_id,
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
                "You are not allowed to review skills "
                "for this job."
            ),
        )

    review = get_or_create_review(
        db,
        job.id,
    )

    skill_items = get_job_skill_review_items(
        db,
        job.id,
    )

    return SkillReviewResponseSchema(
        job_id=job.id,
        status=review.status,
        skills=skill_items,
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
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    job = db.get(
        Job,
        job_id,
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
                "You are not allowed to edit skills "
                "for this job."
            ),
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
            skill_metadata=[
                skill.model_dump()
                for skill in review_data.skills
            ],
        )

    except SkillReviewError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    review = get_or_create_review(
        db,
        job.id,
    )

    skill_items = get_job_skill_review_items(
        db,
        job.id,
    )

    return SkillReviewResponseSchema(
        job_id=job.id,
        status=review.status,
        skills=skill_items,
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
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    job = db.get(
        Job,
        job_id,
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
                "You are not allowed to confirm skills "
                "for this job."
            ),
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

    skill_items = get_job_skill_review_items(
        db,
        job.id,
    )

    return SkillReviewConfirmResponseSchema(
        job_id=job.id,
        status="confirmed",
        skills=skill_items,
        reviewed_by=review.reviewed_by,
        reviewed_at=review.reviewed_at,
    )


@router.get(
    "",
    response_model=list[JobResponse],
)
def get_jobs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
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

    return (
        db.query(Job)
        .filter(
            Job.created_by == current_user["user_id"]
        )
        .order_by(
            Job.created_at.desc()
        )
        .all()
    )


@router.delete(
    "/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    """Delete a recruiter-owned job.

    The delete is intentionally ownership-scoped. SQLAlchemy/database
    cascade rules remove job-owned related records where configured.
    If a dependent assessment still blocks the delete, return a conflict
    instead of leaving the transaction partially applied.
    """

    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == current_user["user_id"],
        )
        .first()
    )

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    try:
        db.delete(job)
        db.commit()

    except IntegrityError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This job cannot be deleted because it is already "
                "linked to assessment data. Remove or archive the "
                "dependent assessment first."
            ),
        ) from exc

    except SQLAlchemyError as exc:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete the job.",
        ) from exc

    return None


@router.post(
    "/bulk-delete",
    response_model=BulkJobDeleteResponse,
)
def bulk_delete_jobs(
    request: BulkJobDeleteRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
    ),
):
    """Delete up to 100 recruiter-owned jobs with per-job results.

    Jobs are committed independently, so one blocked job does not undo
    successful deletions in the same request. Missing and unowned IDs are
    deliberately reported identically.
    """

    job_ids = list(dict.fromkeys(request.job_ids))
    deleted_ids: list[int] = []
    failures: list[dict[str, str | int]] = []

    for job_id in job_ids:
        try:
            job = (
                db.query(Job)
                .filter(
                    Job.id == job_id,
                    Job.created_by == current_user["user_id"],
                )
                .first()
            )
        except SQLAlchemyError:
            db.rollback()
            logger.exception(
                "Bulk job deletion lookup failed for job_id=%s",
                job_id,
            )
            failures.append({
                "job_id": job_id,
                "reason": "error",
                "detail": "A database error prevented this job from being checked.",
            })
            continue

        if job is None:
            failures.append({
                "job_id": job_id,
                "reason": "not_found",
                "detail": "Job not found or you do not have permission to delete it.",
            })
            continue

        try:
            db.delete(job)
            db.commit()
            deleted_ids.append(job_id)

        except IntegrityError:
            db.rollback()
            logger.info(
                "Bulk job deletion blocked by dependent records for job_id=%s",
                job_id,
            )
            failures.append({
                "job_id": job_id,
                "reason": "blocked",
                "detail": (
                    "This job is linked to assessment or other dependent data. "
                    "That data must be handled before the job can be deleted."
                ),
            })

        except SQLAlchemyError:
            db.rollback()
            logger.exception(
                "Bulk job deletion failed for job_id=%s",
                job_id,
            )
            failures.append({
                "job_id": job_id,
                "reason": "error",
                "detail": "A database error prevented this job from being deleted.",
            })

    return BulkJobDeleteResponse(
        requested_count=len(job_ids),
        deleted_ids=deleted_ids,
        failures=failures,
    )


@router.get(
    "/{job_id}/original-document",
)
def get_original_job_document(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "recruiter",
            "assessment_manager",
        )
    ),
):
    """Return the original uploaded PDF for an authorized job user."""

    job = db.get(
        Job,
        job_id,
    )

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    role = current_user.get("role")
    user_id = current_user["user_id"]

    if role == "recruiter":

        if job.created_by != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "You are not allowed to access "
                    "this job document."
                ),
            )

    elif role == "assessment_manager":

        access = _get_assigned_manager_access(
            db=db,
            job_id=job_id,
            user_id=user_id,
        )

        if access is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "This job is not assigned to you."
                ),
            )

    if not job.original_document_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No original PDF is stored for this job."
            ),
        )

    filename = (
        job.original_document_filename
        or "original-job-description.pdf"
    ).replace(
        '"',
        "",
    )

    return Response(
        content=job.original_document_data,
        media_type=(
            job.original_document_content_type
            or "application/pdf"
        ),
        headers={
            "Content-Disposition": (
                f'inline; filename="{filename}"'
            ),
            "Cache-Control": "private, no-store",
        },
    )


@router.get(
    "/{job_id}",
    response_model=JobResponse,
)
def get_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("recruiter")
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

    job = (
        db.query(Job)
        .filter(
            Job.id == job_id,
            Job.created_by == current_user["user_id"],
        )
        .first()
    )

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return job