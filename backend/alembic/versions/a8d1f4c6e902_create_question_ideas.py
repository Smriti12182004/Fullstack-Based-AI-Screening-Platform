"""Create the manager question ideas table."""

from alembic import op
import sqlalchemy as sa


revision = "a8d1f4c6e902"
down_revision = "f9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "question_ideas",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=200), nullable=True),
        sa.Column("skill_name", sa.String(length=200), nullable=True),
        sa.Column(
            "question_type",
            sa.String(length=30),
            nullable=False,
            server_default="FREE_TEXT",
        ),
        sa.Column("difficulty", sa.String(length=20), nullable=True),
        sa.Column("expected_answer", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "tags",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "status",
            sa.String(length=30),
            nullable=False,
            server_default="idea",
        ),
        sa.Column(
            "created_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_index(
        "ix_question_ideas_created_by",
        "question_ideas",
        ["created_by"],
    )
    op.create_index(
        "ix_question_ideas_status",
        "question_ideas",
        ["status"],
    )
    op.create_index(
        "ix_question_ideas_topic",
        "question_ideas",
        ["topic"],
    )


def downgrade() -> None:
    op.drop_index("ix_question_ideas_topic", table_name="question_ideas")
    op.drop_index("ix_question_ideas_status", table_name="question_ideas")
    op.drop_index("ix_question_ideas_created_by", table_name="question_ideas")
    op.drop_table("question_ideas")
