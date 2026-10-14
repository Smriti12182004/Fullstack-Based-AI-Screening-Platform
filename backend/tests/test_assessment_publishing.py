"""S5-01 assessment publishing service tests."""

from uuid import uuid4

from app.db.session import SessionLocal
from app.models import (
    Assessment,
    Job,
    User,
)
from app.services.assessment_publishing_service import (
    AssessmentPublishingServiceError,
    publish_assessment,
)


def test_ready_assessment_can_be_published():
    """A ready assessment can transition to published."""

    db = SessionLocal()

    recruiter = None
    assessment = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None, (
            "This test requires an existing recruiter user."
        )

        job = Job(
            title=f"S5-01 Publishing Test Job {uuid4().hex[:8]}",
            description="Assessment publishing service test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        assessment = Assessment(
            job_id=job.id,
            title=f"S5-01 Assessment {uuid4().hex[:8]}",
            status="ready",
        )

        db.add(assessment)
        db.commit()
        db.refresh(assessment)

        published = publish_assessment(
            db=db,
            assessment_id=assessment.id,
        )

        assert published.id == assessment.id
        assert published.status == "published"

        persisted = db.get(
            Assessment,
            assessment.id,
        )

        assert persisted is not None
        assert persisted.status == "published"

        print()
        print("PUBLISHED ASSESSMENT ID:", assessment.id)
        print("ASSESSMENT STATUS:", persisted.status)
        print("ASSESSMENT PUBLISHING SERVICE TEST PASSED")

    finally:
        if assessment is not None:
            db.query(Assessment).filter(
                Assessment.id == assessment.id
            ).delete(
                synchronize_session=False
            )

            job_id = assessment.job_id

            db.query(Job).filter(
                Job.id == job_id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_non_ready_assessment_cannot_be_published():
    """Only ready assessments can be published."""

    db = SessionLocal()

    assessment = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None, (
            "This test requires an existing recruiter user."
        )

        job = Job(
            title=f"S5-01 Invalid Status Job {uuid4().hex[:8]}",
            description="Invalid publishing status test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        assessment = Assessment(
            job_id=job.id,
            title=f"S5-01 Draft Assessment {uuid4().hex[:8]}",
            status="draft",
        )

        db.add(assessment)
        db.commit()
        db.refresh(assessment)

        try:
            publish_assessment(
                db=db,
                assessment_id=assessment.id,
            )
            raise AssertionError(
                "Draft assessment should not be publishable."
            )

        except AssessmentPublishingServiceError as exc:
            assert str(exc) == (
                "Only ready assessments can be published."
            )

        persisted = db.get(
            Assessment,
            assessment.id,
        )

        assert persisted is not None
        assert persisted.status == "draft"

    finally:
        if assessment is not None:
            job_id = assessment.job_id

            db.query(Assessment).filter(
                Assessment.id == assessment.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job_id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()