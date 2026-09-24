from datetime import datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.assessment import Assessment
    from app.models.question import Question


class AssessmentQuestion(Base):
    __tablename__ = "assessment_questions"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "question_id",
            name="uq_assessment_question",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    display_order: Mapped[int] = mapped_column(
        nullable=False,
    )

    # Immutable snapshot of the question content used
    # in this finalized assessment.
    question_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    question_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    skill_id: Mapped[int] = mapped_column(
        ForeignKey("skills.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    difficulty: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    options: Mapped[list[str] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    correct_answer: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    explanation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    assessment: Mapped["Assessment"] = relationship(
        "Assessment",
        back_populates="assessment_questions",
    )

    question: Mapped["Question"] = relationship(
        "Question",
    )