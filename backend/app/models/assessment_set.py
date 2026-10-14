from datetime import datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.question_set import QuestionSet


class AssessmentSet(Base):
    """One concrete assessment set generated from a shared QuestionSet blueprint."""

    __tablename__ = "assessment_sets"

    __table_args__ = (
        UniqueConstraint(
            "question_set_id",
            "variant_number",
            name="uq_assessment_set_question_set_variant",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    question_set_id: Mapped[int] = mapped_column(
        ForeignKey("question_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    variant_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    label: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="draft",
        server_default="draft",
        index=True,
    )

    reviewer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    review_comment: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    review_checklist: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        server_default="{}",
    )

    # ------------------------------------------------------------------
    # HR HANDOFF
    # ------------------------------------------------------------------

    sent_to_hr_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    sent_to_hr_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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

    question_set: Mapped["QuestionSet"] = relationship("QuestionSet")

    slots = relationship(
        "QuestionSlot",
        back_populates="assessment_set",
        cascade="all, delete-orphan",
        order_by="QuestionSlot.id",
    )