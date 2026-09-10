from datetime import datetime

from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id"),
        nullable=False,
    )

    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="started",
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    submitted_at: Mapped[datetime | None] = mapped_column(
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
