from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.timestamps import utc_now


if TYPE_CHECKING:
    from app.models.assessment import Assessment
    from app.models.user import User


class AssessmentAssignment(Base):
    __tablename__ = "assessment_assignments"

    __table_args__ = (
        UniqueConstraint(
            "assessment_id",
            "candidate_id",
            name="uq_assessment_assignment_candidate",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    assessment_id: Mapped[int] = mapped_column(
        ForeignKey(
            "assessments.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    candidate_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    assigned_by: Mapped[int] = mapped_column(
    ForeignKey(
        "users.id",
        ondelete="RESTRICT",
    ),
    nullable=False,
    index=True,
)

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="assigned",
    )

    opens_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    closes_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
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

    assessment: Mapped["Assessment"] = relationship(
        "Assessment",
    )

    candidate: Mapped["User"] = relationship(
        "User",
        foreign_keys=[candidate_id],
    )

    assigner: Mapped["User"] = relationship(
        "User",
        foreign_keys=[assigned_by],
    )