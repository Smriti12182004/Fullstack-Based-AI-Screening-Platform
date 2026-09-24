from datetime import datetime
from typing import TYPE_CHECKING

from app.db.timestamps import utc_now
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.question_section import QuestionSection
    from app.models.question_set import QuestionSet
    from app.models.skill import Skill


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    question_set_id: Mapped[int] = mapped_column(
        ForeignKey("question_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    skill_id: Mapped[int] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    display_order: Mapped[int] = mapped_column(
        nullable=False,
    )

    easy_count: Mapped[int] = mapped_column(
        nullable=False,
        default=0,
    )

    medium_count: Mapped[int] = mapped_column(
        nullable=False,
        default=0,
    )

    hard_count: Mapped[int] = mapped_column(
        nullable=False,
        default=0,
    )

    is_locked: Mapped[bool] = mapped_column(
        nullable=False,
        default=False,
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

    question_set: Mapped["QuestionSet"] = relationship(
        "QuestionSet",
        back_populates="sections",
    )

    skill: Mapped["Skill"] = relationship(
        "Skill",
    )

    question_sections: Mapped[list["QuestionSection"]] = relationship(
        "QuestionSection",
        back_populates="section",
        cascade="all, delete-orphan",
    )