from datetime import datetime
from typing import TYPE_CHECKING

from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.question_set import QuestionSet


class QuestionSetConfiguration(Base):
    __tablename__ = "question_set_configurations"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    question_set_id: Mapped[int] = mapped_column(
        ForeignKey("question_sets.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    total_questions: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    duration_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    candidate_instructions: Mapped[str | None] = mapped_column(
        Text,
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

    question_set: Mapped["QuestionSet"] = relationship(
        "QuestionSet",
        back_populates="configuration",
    )