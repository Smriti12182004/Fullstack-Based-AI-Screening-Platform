"""add year specific question banks

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-09-27 19:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b7c8d9e0f1a2"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "question_banks",
        sa.Column(
            "id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "job_id",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "hiring_year",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "name",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(length=30),
            nullable=False,
            server_default="active",
        ),
        sa.Column(
            "created_by",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["jobs.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_id",
            "hiring_year",
            name="uq_question_bank_job_year",
        ),
    )

    op.create_index(
        "ix_question_banks_id",
        "question_banks",
        ["id"],
        unique=False,
    )

    op.create_index(
        "ix_question_banks_job_id",
        "question_banks",
        ["job_id"],
        unique=False,
    )

    op.create_index(
        "ix_question_banks_hiring_year",
        "question_banks",
        ["hiring_year"],
        unique=False,
    )

    op.create_index(
        "ix_question_banks_status",
        "question_banks",
        ["status"],
        unique=False,
    )

    op.create_index(
        "ix_question_banks_created_by",
        "question_banks",
        ["created_by"],
        unique=False,
    )

    op.add_column(
        "questions",
        sa.Column(
            "question_bank_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_questions_question_bank_id",
        "questions",
        ["question_bank_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_questions_question_bank_id",
        "questions",
        "question_banks",
        ["question_bank_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_questions_question_bank_id",
        "questions",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_questions_question_bank_id",
        table_name="questions",
    )

    op.drop_column(
        "questions",
        "question_bank_id",
    )

    op.drop_index(
        "ix_question_banks_created_by",
        table_name="question_banks",
    )

    op.drop_index(
        "ix_question_banks_status",
        table_name="question_banks",
    )

    op.drop_index(
        "ix_question_banks_hiring_year",
        table_name="question_banks",
    )

    op.drop_index(
        "ix_question_banks_job_id",
        table_name="question_banks",
    )

    op.drop_index(
        "ix_question_banks_id",
        table_name="question_banks",
    )

    op.drop_table(
        "question_banks",
    )