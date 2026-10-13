from datetime import datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import (
    DateTime,
    ForeignKey,
    JSON,
    String,
    Text,
    UniqueConstraint,
)

from sqlalchemy.orm import Mapped, mapped_column, relationship


if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.skill import Skill
    from app.models.user import User


class QuestionVersion(Base):
    __tablename__ = "question_versions"

    __table_args__ = (
        UniqueConstraint(
            "question_id",
            "version",
            name="uq_question_version",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    question_id: Mapped[int] = mapped_column(
        ForeignKey(
            "questions.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    version: Mapped[int] = mapped_column(
        nullable=False,
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

    source: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    changed_by: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="SET NULL",
        ),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    question: Mapped["Question"] = relationship(
        "Question",
        back_populates="versions",
    )

    skill: Mapped["Skill"] = relationship(
        "Skill",
    )

    changer: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[changed_by],
    )