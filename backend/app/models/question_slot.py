from datetime import datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.assessment_set import AssessmentSet
    from app.models.question import Question


class QuestionSlot(Base):
    """Durable position for one exact section/skill/difficulty question."""

    __tablename__ = "question_slots"

    __table_args__ = (
        UniqueConstraint(
            "assessment_set_id",
            "section_id",
            "skill_id",
            "difficulty",
            "slot_number",
            name="uq_question_slot_exact_position",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    assessment_set_id: Mapped[int] = mapped_column(
        ForeignKey("assessment_sets.id", ondelete="CASCADE"),
        nullable=False,
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

    section_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
    )

    difficulty: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    slot_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    preferred_question_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="MCQ",
        server_default="MCQ",
        index=True,
    )

    current_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    source_type: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="empty",
        server_default="empty",
        index=True,
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

    assessment_set: Mapped["AssessmentSet"] = relationship(
        "AssessmentSet",
        back_populates="slots",
    )

    current_question: Mapped["Question | None"] = relationship("Question")
