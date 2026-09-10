from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models import Job, User
from app.schemas.job import JobCreate, JobResponse

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
            detail="Unsupported file type. Only TXT and PDF files are supported.",
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


@router.get(
    "",
    response_model=list[JobResponse],
)
def get_jobs(db: Session = Depends(get_db)):
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