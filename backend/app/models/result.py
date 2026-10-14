
from datetime import datetime
from typing import Any

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column


class Result(Base):
    """Persist overall, section-wise, skill-wise, and question-level scores."""

    __tablename__ = "results"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("attempts.id"),
        nullable=False,
        index=True,
    )

    # Final percentage; keep None when grading needs manual review.
    score: Mapped[float | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )

    earned_points: Mapped[float | None] = mapped_column(
        Numeric(7, 2),
        nullable=True,
    )

    max_points: Mapped[float | None] = mapped_column(
        Numeric(7, 2),
        nullable=True,
    )

    section_scores: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    skill_scores: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    question_scores: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    feedback: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    grading_job_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    graded_at: Mapped[datetime | None] = mapped_column(
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
