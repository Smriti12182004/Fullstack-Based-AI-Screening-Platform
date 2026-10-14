"""Add durable assessment sets, question slots, AI attempts and ratings.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-09-29
"""

from alembic import op
import sqlalchemy as sa


revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assessment_sets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "question_set_id",
            sa.Integer(),
            sa.ForeignKey("question_sets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("variant_number", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "question_set_id",
            "variant_number",
            name="uq_assessment_set_question_set_variant",
        ),
        sa.CheckConstraint(
            "variant_number BETWEEN 1 AND 2",
            name="ck_assessment_set_variant_number_two",
        ),
    )
    op.create_index("ix_assessment_sets_question_set_id", "assessment_sets", ["question_set_id"])
    op.create_index("ix_assessment_sets_status", "assessment_sets", ["status"])

    op.create_table(
        "question_slots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "assessment_set_id",
            sa.Integer(),
            sa.ForeignKey("assessment_sets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "section_id",
            sa.Integer(),
            sa.ForeignKey("sections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "skill_id",
            sa.Integer(),
            sa.ForeignKey("skills.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("section_type", sa.String(length=30), nullable=False),
        sa.Column("difficulty", sa.String(length=20), nullable=False),
        sa.Column("slot_number", sa.Integer(), nullable=False),
        sa.Column(
            "current_question_id",
            sa.Integer(),
            sa.ForeignKey("questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_type", sa.String(length=30), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="empty"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "assessment_set_id",
            "section_id",
            "skill_id",
            "difficulty",
            "slot_number",
            name="uq_question_slot_exact_position",
        ),
        sa.CheckConstraint(
            "section_type IN ('conceptual', 'implementation', 'free_text')",
            name="ck_question_slot_section_type",
        ),
        sa.CheckConstraint(
            "difficulty IN ('easy', 'medium', 'hard')",
            name="ck_question_slot_difficulty",
        ),
        sa.CheckConstraint(
            "slot_number > 0",
            name="ck_question_slot_number_positive",
        ),
    )
    op.create_index("ix_question_slots_assessment_set_id", "question_slots", ["assessment_set_id"])
    op.create_index("ix_question_slots_section_id", "question_slots", ["section_id"])
    op.create_index("ix_question_slots_skill_id", "question_slots", ["skill_id"])
    op.create_index("ix_question_slots_current_question_id", "question_slots", ["current_question_id"])
    op.create_index("ix_question_slots_status", "question_slots", ["status"])

    op.create_table(
        "question_generation_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "question_slot_id",
            sa.Integer(),
            sa.ForeignKey("question_slots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="generating"),
        sa.Column("question_text", sa.Text(), nullable=True),
        sa.Column("question_type", sa.String(length=50), nullable=True),
        sa.Column("section_type", sa.String(length=30), nullable=True),
        sa.Column(
            "skill_id",
            sa.Integer(),
            sa.ForeignKey("skills.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("difficulty", sa.String(length=20), nullable=True),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("correct_answer", sa.String(length=255), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("model_name", sa.String(length=100), nullable=True),
        sa.Column("request_id", sa.String(length=100), nullable=True),
        sa.Column("validation_status", sa.String(length=30), nullable=True),
        sa.Column("validation_errors", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "candidate_question_id",
            sa.Integer(),
            sa.ForeignKey("questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "previous_question_id",
            sa.Integer(),
            sa.ForeignKey("questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "accepted_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "restored_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("restored_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "question_slot_id",
            "attempt_number",
            name="uq_question_generation_attempt_slot_number",
        ),
    )
    op.create_index("ix_qga_question_slot_id", "question_generation_attempts", ["question_slot_id"])
    op.create_index("ix_qga_status", "question_generation_attempts", ["status"])
    op.create_index("ix_qga_request_id", "question_generation_attempts", ["request_id"])

    op.add_column(
        "questions",
        sa.Column("manager_rating", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "questions",
        sa.Column("reviewer_rating", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        "ck_questions_manager_rating",
        "questions",
        "manager_rating IS NULL OR manager_rating BETWEEN 1 AND 3",
    )
    op.create_check_constraint(
        "ck_questions_reviewer_rating",
        "questions",
        "reviewer_rating IS NULL OR reviewer_rating BETWEEN 1 AND 3",
    )


def downgrade() -> None:
    op.drop_constraint("ck_questions_reviewer_rating", "questions", type_="check")
    op.drop_constraint("ck_questions_manager_rating", "questions", type_="check")
    op.drop_column("questions", "reviewer_rating")
    op.drop_column("questions", "manager_rating")

    op.drop_index("ix_qga_request_id", table_name="question_generation_attempts")
    op.drop_index("ix_qga_status", table_name="question_generation_attempts")
    op.drop_index("ix_qga_question_slot_id", table_name="question_generation_attempts")
    op.drop_table("question_generation_attempts")

    op.drop_index("ix_question_slots_status", table_name="question_slots")
    op.drop_index("ix_question_slots_current_question_id", table_name="question_slots")
    op.drop_index("ix_question_slots_skill_id", table_name="question_slots")
    op.drop_index("ix_question_slots_section_id", table_name="question_slots")
    op.drop_index("ix_question_slots_assessment_set_id", table_name="question_slots")
    op.drop_table("question_slots")

    op.drop_index("ix_assessment_sets_status", table_name="assessment_sets")
    op.drop_index("ix_assessment_sets_question_set_id", table_name="assessment_sets")
    op.drop_table("assessment_sets")
