from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class JobSkill(Base):
    """Association between a job and a skill, including recruiter decisions."""

    __tablename__ = "job_skills"

    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        primary_key=True,
    )

    skill_id: Mapped[int] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Classification belongs to the job-skill relationship, not the global
    # Skill record, because the same skill can have a different requirement
    # in different job descriptions.
    category: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="technical",
        server_default="technical",
    )

    is_mandatory: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )