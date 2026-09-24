from datetime import datetime
from typing import TYPE_CHECKING

from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.job import Job
    from app.models.user import User


class JobAssessmentAccess(Base):
    __tablename__ = "job_assessment_access"

    __table_args__ = (
        UniqueConstraint(
            "job_id",
            "user_id",
            name="uq_job_assessment_access_job_user",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    job_id: Mapped[int] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    assigned_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    job: Mapped["Job"] = relationship(
        "Job",
        foreign_keys=[job_id],
    )

    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
    )

    assigner: Mapped["User"] = relationship(
        "User",
        foreign_keys=[assigned_by],
    )