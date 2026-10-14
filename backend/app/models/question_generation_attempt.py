from datetime import datetime
from typing import TYPE_CHECKING

from app.db.base import Base
from app.db.timestamps import utc_now

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.question import Question
    from app.models.question_slot import QuestionSlot
    from app.models.user import User


class QuestionGenerationAttempt(Base):
    """Durable AI candidate/history record. Never overwrite prior attempts."""

    __tablename__ = "question_generation_attempts"

    __table_args__ = (
        UniqueConstraint(
            "question_slot_id",
            "attempt_number",
            name="uq_question_generation_attempt_slot_number",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    question_slot_id: Mapped[int] = mapped_column(
        ForeignKey("question_slots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="generating",
        server_default="generating",
        index=True,
    )

    question_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    section_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    skill_id: Mapped[int | None] = mapped_column(
        ForeignKey("skills.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    options: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    correct_answer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Authoritative generation-plan pattern.
    # Examples: "Code interpretation", "Debugging", "Scenario",
    # "Output prediction", "Comparison", "SQL", etc.
    pattern: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    validation_status: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )
    validation_errors: Mapped[list[str] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    candidate_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    previous_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("questions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    accepted_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    restored_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    restored_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    slot: Mapped["QuestionSlot"] = relationship("QuestionSlot")
    candidate_question: Mapped["Question | None"] = relationship(
        "Question",
        foreign_keys=[candidate_question_id],
    )
    previous_question: Mapped["Question | None"] = relationship(
        "Question",
        foreign_keys=[previous_question_id],
    )
    creator: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[created_by],
    )