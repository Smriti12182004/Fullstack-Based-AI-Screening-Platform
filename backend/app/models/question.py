from datetime import datetime

from typing import TYPE_CHECKING

from app.db.timestamps import utc_now

from sqlalchemy import (
    DateTime,
    ForeignKey,
    JSON,
    String,
    Text,
)

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


if TYPE_CHECKING:
    from app.models.question_section import QuestionSection
    from app.models.question_version import QuestionVersion


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    question_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    question_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    skill_id: Mapped[int] = mapped_column(
        ForeignKey(
            "skills.id",
            ondelete="RESTRICT",
        ),
        nullable=False,
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

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="approved",
        index=True,
    )

    source: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="manual",
        index=True,
    )

    explanation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ---------------------------------------------------------
    # Question ownership and review audit
    # ---------------------------------------------------------

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ---------------------------------------------------------
    # Question content version
    # ---------------------------------------------------------

    version: Mapped[int] = mapped_column(
        nullable=False,
        default=1,
        server_default="1",
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

    question_sections: Mapped[list["QuestionSection"]] = relationship(
        "QuestionSection",
        back_populates="question",
    )

    versions: Mapped[list["QuestionVersion"]] = relationship(
        "QuestionVersion",
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionVersion.version",
    )