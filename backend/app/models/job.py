from datetime import datetime
from typing import TYPE_CHECKING

from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.question_set import QuestionSet
    from app.models.skill import Skill


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    experience_required: Mapped[str | None] = mapped_column(
    String(100),
    nullable=True,
)

    skills: Mapped[list["Skill"]] = relationship(
        secondary="job_skills",
        back_populates="jobs",
    )

    question_sets: Mapped[list["QuestionSet"]] = relationship(
        "QuestionSet",
        back_populates="job",
        cascade="all, delete-orphan",
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )