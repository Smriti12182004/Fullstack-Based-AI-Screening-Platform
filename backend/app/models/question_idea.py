from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.timestamps import utc_now


class QuestionIdea(Base):
    """A manager's saved question idea, separate from approved questions."""

    __tablename__ = "question_ideas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    question_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    topic: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        index=True,
    )

    skill_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    question_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="FREE_TEXT",
        server_default="FREE_TEXT",
    )

    difficulty: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    expected_answer: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    tags: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        server_default="[]",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="idea",
        server_default="idea",
        index=True,
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
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
