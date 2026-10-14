from datetime import datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


if TYPE_CHECKING:
    from app.models.question_section import QuestionSection
    from app.models.question_set import QuestionSet
    from app.models.section_skill import SectionSkill


class Section(Base):
    __tablename__ = "sections"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    question_set_id: Mapped[int] = mapped_column(
        ForeignKey(
            "question_sets.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # Semantic section purpose.
    # Supported values:
    #   conceptual
    #   implementation
    #   free_text
    section_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="conceptual",
        server_default="conceptual",
        index=True,
    )

    # Legacy compatibility field. The real per-skill distribution
    # lives on SectionSkill.easy_count / medium_count / hard_count.
    difficulty: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    display_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    is_locked: Mapped[bool] = mapped_column(
        Boolean,
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

    section_skills: Mapped[list["SectionSkill"]] = relationship(
        "SectionSkill",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="SectionSkill.id",
    )

    question_sections: Mapped[list["QuestionSection"]] = relationship(
        "QuestionSection",
        back_populates="section",
        cascade="all, delete-orphan",
    )
