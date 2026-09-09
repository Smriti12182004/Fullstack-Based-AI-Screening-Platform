from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

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
def create_job(job: JobCreate, db: Session = Depends(get_db)):
    user = db.get(User, job.created_by)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    new_job = Job(
        title=job.title,
        description=job.description,
        created_by=job.created_by,
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
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return job