from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import Job, JobSkill, Skill
from app.services.llm_service import (
    SkillExtractionResponse,
    extract_skills_from_jd,
    normalize_extracted_skills,
)


_NON_TECHNICAL_EXTRACTION_CATEGORIES = {
    "professional skill",
    "soft skill",
    "communication",
    "leadership",
    "teamwork",
    "other",
}


def _review_category_from_extraction(category: str | None) -> str:
    """Map the detailed extraction taxonomy to the review UI's two categories."""
    normalized = " ".join(str(category or "").strip().lower().split())
    return (
        "non_technical"
        if normalized in _NON_TECHNICAL_EXTRACTION_CATEGORIES
        else "technical"
    )


def extract_and_save_job_skills(
    db: Session,
    job: Job,
) -> SkillExtractionResponse:
    """
    Extract skills and experience from the job description,
    normalize the extracted data, synchronize the job's stored
    skill links, and persist the extracted experience.
    """

    extraction = extract_skills_from_jd(job.description)
    normalized = normalize_extracted_skills(extraction)

    try:
        current_skill_names = {
            extracted_skill.name
            for extracted_skill in normalized.skills
        }

        current_links = (
            db.query(JobSkill)
            .filter(JobSkill.job_id == job.id)
            .all()
        )

        for link in current_links:
            skill = db.get(Skill, link.skill_id)

            if skill is None or skill.name not in current_skill_names:
                db.delete(link)

        for extracted_skill in normalized.skills:
            skill = (
                db.query(Skill)
                .filter(Skill.name == extracted_skill.name)
                .first()
            )

            if skill is None:
                skill = Skill(
                    name=extracted_skill.name,
                )
                db.add(skill)
                db.flush()

            existing_link = (
                db.query(JobSkill)
                .filter(
                    JobSkill.job_id == job.id,
                    JobSkill.skill_id == skill.id,
                )
                .first()
            )

            if existing_link is None:
                extracted_category = _review_category_from_extraction(
                    getattr(extracted_skill, "category", None)
                )
                db.add(
                    JobSkill(
                        job_id=job.id,
                        skill_id=skill.id,
                        category=extracted_category,
                        is_mandatory=True,
                    )
                )
            # If the link already exists, preserve the recruiter-selected
            # category and mandatory/optional value during re-extraction.

        # Persist the experience extracted from the JD.
        job.experience_required = normalized.experience_required

        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise

    return normalized