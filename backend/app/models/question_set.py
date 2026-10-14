from datetime import datetime, timezone
from typing import TYPE_CHECKING

from app.db.timestamps import utc_now
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.assessment import Assessment
    from app.models.job import Job
    from app.models.section import Section
    from app.models.user import User
    from app.models.question_set_configuration import QuestionSetConfiguration


class QuestionSet(Base):
    __tablename__ = "question_sets"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    job_id: Mapped[int] = mapped_column(
        ForeignKey(
            "jobs.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ---------------------------------------------------------
    # Hiring process metadata
    # ---------------------------------------------------------

    # Example: 2026
    hiring_year: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        default=lambda: datetime.now(timezone.utc).year,
        index=True,
    )

    # Example: "Backend Developer - Campus Hiring"
    hiring_cycle: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # One blueprint produces exactly two new assessment sets:
    # Set A and Set B. Existing database rows may still contain 3.
    variant_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=2,
        server_default="2",
    )

    # ---------------------------------------------------------
    # Lifecycle
    # ---------------------------------------------------------

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="draft",
        index=True,
    )

    version: Mapped[int] = mapped_column(
        nullable=False,
        default=1,
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
        index=True,
    )

    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
        ),
        nullable=True,
        index=True,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    rejection_reason: Mapped[str | None] = mapped_column(
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

    # ---------------------------------------------------------
    # Relationships
    # ---------------------------------------------------------

    job: Mapped["Job"] = relationship(
        "Job",
        back_populates="question_sets",
    )

    sections: Mapped[list["Section"]] = relationship(
        "Section",
        back_populates="question_set",
        cascade="all, delete-orphan",
    )

    configuration: Mapped[
        "QuestionSetConfiguration | None"
    ] = relationship(
        "QuestionSetConfiguration",
        back_populates="question_set",
        uselist=False,
        cascade="all, delete-orphan",
    )

    assessments: Mapped[list["Assessment"]] = relationship(
        "Assessment",
        back_populates="question_set",
        cascade="all, delete-orphan",
    )

    creator: Mapped["User"] = relationship(
        "User",
        foreign_keys=[created_by],
    )

    reviewer: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[reviewed_by],
    )
