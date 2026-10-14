
from datetime import datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.section import Section


class SectionSkill(Base):
    __tablename__ = "section_skills"

    __table_args__ = (
        UniqueConstraint(
            "section_id",
            "skill_id",
            name="uq_section_skill",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    section_id: Mapped[int] = mapped_column(
        ForeignKey("sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    skill_id: Mapped[int] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Retained because existing application services use this field.
    question_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    easy_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    medium_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    hard_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
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

    section: Mapped["Section"] = relationship(
        "Section",
        back_populates="section_skills",
    )
