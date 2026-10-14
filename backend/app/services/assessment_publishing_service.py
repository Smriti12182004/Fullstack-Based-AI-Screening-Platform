from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Assessment


class AssessmentPublishingServiceError(Exception):
    """Base exception for assessment publishing failures."""


def publish_assessment(
    db: Session,
    assessment_id: int,
) -> Assessment:
    """
    Publish an assembled assessment.

    Rules:
    - Assessment must exist.
    - Only an assessment in ready state can be published.
    - Publishing changes the assessment status to published.
    """

    assessment = db.get(Assessment, assessment_id)

    if assessment is None:
        raise AssessmentPublishingServiceError(
            "Assessment not found."
        )

    if assessment.status != "ready":
        raise AssessmentPublishingServiceError(
            "Only ready assessments can be published."
        )

    try:
        assessment.status = "published"

        db.commit()
        db.refresh(assessment)

    except SQLAlchemyError as exc:
        db.rollback()
        raise AssessmentPublishingServiceError(
            "Unable to publish assessment."
        ) from exc

    return assessment