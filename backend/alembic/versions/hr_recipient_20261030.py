"""Persist the selected HR recipient for assessment handoffs."""

from alembic import op
import sqlalchemy as sa

revision = "hr_recipient_20261030"
down_revision = "b9c0d1e2f3a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "assessment_sets",
        sa.Column("sent_to_hr_user_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_assessment_sets_sent_to_hr_user_id",
        "assessment_sets",
        ["sent_to_hr_user_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_assessment_sets_sent_to_hr_user_id_users",
        "assessment_sets",
        "users",
        ["sent_to_hr_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Keep the original job owner for previously completed handoffs.
    op.execute(sa.text("""
        UPDATE assessment_sets AS aset
        SET sent_to_hr_user_id = (
            SELECT jobs.created_by
            FROM question_sets
            JOIN jobs ON jobs.id = question_sets.job_id
            JOIN users ON users.id = jobs.created_by
            WHERE question_sets.id = aset.question_set_id
              AND users.role = 'recruiter'
        )
        WHERE aset.sent_to_hr_at IS NOT NULL
          AND aset.sent_to_hr_user_id IS NULL
    """))


def downgrade() -> None:
    op.drop_constraint(
        "fk_assessment_sets_sent_to_hr_user_id_users",
        "assessment_sets",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_assessment_sets_sent_to_hr_user_id",
        table_name="assessment_sets",
    )
    op.drop_column("assessment_sets", "sent_to_hr_user_id")
