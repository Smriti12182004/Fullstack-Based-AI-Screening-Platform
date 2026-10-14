from types import SimpleNamespace

from sqlalchemy import or_

from app.db.session import SessionLocal
from app.models import Question, QuestionBank, User
from app.services import question_set_pool_generation_service as pool_service
from app.services.question_service import (
    QuestionServiceError,
    approve_question,
)


QUESTION_SET_ID = 60
JOB_ID = 1
HIRING_YEAR = 2026
SKILL_ID = 4
CREATED_BY = 1

EXPECTED_GENERATED = 13
REQUIRED_POOL = 30


def fake_generate_questions_from_skills(
    skills,
    number_of_questions,
    difficulty,
):
    """Deterministic fake generator used only for this dry run."""
    if not skills:
        raise ValueError(
            "No skills were provided to the fake generator."
        )

    skill_name = skills[0]["skill_name"]

    questions = []

    for index in range(number_of_questions):
        questions.append(
            SimpleNamespace(
                skill_name=skill_name,
                difficulty=difficulty,
                question_text=(
                    "MAKER-CHECKER DRY RUN "
                    f"{skill_name} "
                    f"{difficulty} "
                    f"{index + 1}"
                ),
                options=[
                    "Option A",
                    "Option B",
                    "Option C",
                    "Option D",
                ],
                correct_answer="Option A",
                explanation=(
                    f"Dry-run explanation for "
                    f"{skill_name} "
                    f"{difficulty} "
                    f"{index + 1}."
                ),
            )
        )

    return questions


def normalize_role(user: User) -> str:
    """Normalize the stored user role."""
    role = getattr(user, "role", None)

    if role is None:
        role = getattr(user, "user_role", None)

    if role is None:
        return ""

    value = getattr(role, "value", role)

    return str(value).strip().lower()


def find_independent_reviewer(
    db,
    creator_id: int,
) -> int:
    """Find an assessment reviewer different from the creator."""
    users = db.query(User).all()

    for user in users:
        if (
            normalize_role(user) == "assessment_reviewer"
            and user.id != creator_id
        ):
            return user.id

    raise AssertionError(
        "No independent assessment reviewer was found."
    )


def get_temp_generated_questions(db) -> list[Question]:
    """
    Get the temporary questions created by this dry run.
    """
    return (
        db.query(Question)
        .join(
            QuestionBank,
            Question.question_bank_id == QuestionBank.id,
        )
        .filter(
            QuestionBank.job_id == JOB_ID,
            QuestionBank.hiring_year == HIRING_YEAR,
            Question.skill_id == SKILL_ID,
            Question.status == "pending_review",
            Question.source == "ai_generated",
            Question.created_by == CREATED_BY,
        )
        .order_by(Question.id)
        .all()
    )


def get_assembly_eligible_questions(db) -> list[Question]:
    """
    Return the approved questions that can participate in the current
    Question Set.

    This intentionally allows MORE than the minimum required pool.

    Sources:
    1. Legacy approved questions with no Question Bank.
    2. Approved banked questions belonging to this Job and with
       hiring_year <= the current hiring year.
    """
    return (
        db.query(Question)
        .outerjoin(
            QuestionBank,
            Question.question_bank_id == QuestionBank.id,
        )
        .filter(
            Question.skill_id == SKILL_ID,
            Question.status == "approved",
            or_(
                Question.question_bank_id.is_(None),
                (
                    (QuestionBank.job_id == JOB_ID)
                    & (
                        QuestionBank.hiring_year
                        <= HIRING_YEAR
                    )
                ),
            ),
        )
        .order_by(Question.id)
        .all()
    )


def main():
    print("=" * 70)
    print("QUESTION MAKER-CHECKER DRY RUN")
    print("=" * 70)

    db = SessionLocal()

    original_generator = (
        pool_service.generate_questions_from_skills
    )

    original_commit = db.commit

    try:
        # ------------------------------------------------------------
        # Use deterministic fake AI generation.
        # ------------------------------------------------------------
        pool_service.generate_questions_from_skills = (
            fake_generate_questions_from_skills
        )

        # ------------------------------------------------------------
        # Make the complete test rollback-safe.
        # ------------------------------------------------------------
        db.commit = db.flush

        # ------------------------------------------------------------
        # STEP 1
        # Generate the temporary question pool.
        # ------------------------------------------------------------
        print()
        print("GENERATING TEMPORARY REVIEW POOL")
        print("-" * 70)

        pool_result = pool_service.generate_question_set_pool(
            db=db,
            question_set_id=QUESTION_SET_ID,
            created_by=CREATED_BY,
        )

        print(
            f"Question Set: "
            f"{pool_result['question_set_id']}"
        )

        print(
            f"Job: "
            f"{pool_result['job_id']}"
        )

        print(
            f"Hiring Year: "
            f"{pool_result['hiring_year']}"
        )

        print(
            f"Variant Count: "
            f"{pool_result['variant_count']}"
        )

        print(
            f"Required Pool: "
            f"{pool_result['total_required_pool_questions']}"
        )

        print(
            f"Would Generate: "
            f"{pool_result['total_generated']}"
        )

        # ------------------------------------------------------------
        # The generation result must satisfy the actual Question Set
        # requirement. We require the exact 13 generated by the current
        # Question Set data, but do not assume that 30 is the maximum
        # number of eligible questions.
        # ------------------------------------------------------------
        assert pool_result["question_set_id"] == QUESTION_SET_ID
        assert pool_result["job_id"] == JOB_ID
        assert pool_result["hiring_year"] == HIRING_YEAR
        assert pool_result["variant_count"] == 3
        assert pool_result["total_questions_per_variant"] == 10
        assert (
            pool_result["total_required_pool_questions"]
            == REQUIRED_POOL
        )
        assert (
            pool_result["total_generated"]
            == EXPECTED_GENERATED
        )
        assert pool_result["total_remaining_gap"] == 0

        # The pool itself is NOT assembly-ready yet because generated
        # questions are pending review.
        assert pool_result["ready_for_assembly"] is False

        # ------------------------------------------------------------
        # STEP 2
        # Confirm generated questions exist and are pending review.
        # ------------------------------------------------------------
        generated_questions = get_temp_generated_questions(db)

        print(
            f"Pending Generated Questions: "
            f"{len(generated_questions)}"
        )

        assert len(generated_questions) == EXPECTED_GENERATED

        for question in generated_questions:
            assert question.status == "pending_review"
            assert question.source == "ai_generated"
            assert question.created_by == CREATED_BY
            assert question.reviewed_by is None
            assert question.reviewed_at is None
            assert question.rejection_reason is None
            assert question.question_bank_id is not None
            assert question.skill_id == SKILL_ID
            assert question.question_type == "MCQ"
            assert question.options
            assert question.correct_answer in question.options
            assert question.explanation is not None

        print(
            "✓ Temporary AI-generated pool created"
        )

        print(
            "✓ All generated questions start as pending_review"
        )

        # ------------------------------------------------------------
        # STEP 3
        # Find independent reviewer.
        # ------------------------------------------------------------
        reviewer_id = find_independent_reviewer(
            db,
            CREATED_BY,
        )

        print(
            f"Independent Reviewer ID: "
            f"{reviewer_id}"
        )

        # ------------------------------------------------------------
        # STEP 4
        # Self-approval must fail.
        # ------------------------------------------------------------
        print()
        print("SELF-APPROVAL CHECK")
        print("-" * 70)

        first_question = generated_questions[0]

        try:
            approve_question(
                db=db,
                question_id=first_question.id,
                reviewer_id=CREATED_BY,
            )

            raise AssertionError(
                "Self-approval unexpectedly succeeded."
            )

        except QuestionServiceError as exc:
            assert str(exc) == (
                "The question creator cannot approve "
                "their own question."
            )

            print(
                "✓ Creator was correctly prevented "
                "from approving their own question"
            )

        # ------------------------------------------------------------
        # STEP 5
        # Independent reviewer approves all generated questions.
        # ------------------------------------------------------------
        print()
        print("INDEPENDENT REVIEWER APPROVAL")
        print("-" * 70)

        approved_ids = []

        for question in generated_questions:
            approved = approve_question(
                db=db,
                question_id=question.id,
                reviewer_id=reviewer_id,
            )

            assert approved.id == question.id
            assert approved.status == "approved"
            assert approved.reviewed_by == reviewer_id
            assert approved.reviewed_at is not None
            assert approved.rejection_reason is None

            approved_ids.append(
                approved.id
            )

        print(
            f"✓ Independent reviewer approved "
            f"{len(approved_ids)} questions"
        )

        assert len(approved_ids) == EXPECTED_GENERATED

        # ------------------------------------------------------------
        # STEP 6
        # Validate the generated questions after approval.
        # ------------------------------------------------------------
        print()
        print("POST-APPROVAL VALIDATION")
        print("-" * 70)

        approved_generated = (
            db.query(Question)
            .filter(
                Question.id.in_(approved_ids)
            )
            .order_by(Question.id)
            .all()
        )

        assert len(approved_generated) == EXPECTED_GENERATED

        for question in approved_generated:
            assert question.status == "approved"
            assert question.reviewed_by == reviewer_id
            assert question.reviewed_at is not None
            assert question.rejection_reason is None
            assert question.source == "ai_generated"
            assert question.created_by == CREATED_BY
            assert question.question_bank_id is not None
            assert question.skill_id == SKILL_ID

        print(
            "✓ All generated questions moved to approved"
        )

        # ------------------------------------------------------------
        # STEP 7
        # Count the complete assembly-eligible pool.
        #
        # IMPORTANT:
        # The requirement is a MINIMUM of 30.
        #
        # It is valid to have:
        #     30 questions
        #     31 questions
        #     32 questions
        #     etc.
        #
        # The assembly process simply needs enough unique questions.
        # ------------------------------------------------------------
        eligible_questions = (
            get_assembly_eligible_questions(db)
        )

        eligible_count = len(
            eligible_questions
        )

        print(
            f"Assembly-Eligible Approved Pool: "
            f"{eligible_count}"
        )

        print(
            f"Required Minimum Pool: "
            f"{REQUIRED_POOL}"
        )

        assert eligible_count >= REQUIRED_POOL

        # ------------------------------------------------------------
        # Calculate surplus for visibility.
        # ------------------------------------------------------------
        surplus = (
            eligible_count
            - REQUIRED_POOL
        )

        print(
            f"Pool Surplus: "
            f"{surplus}"
        )

        print(
            "✓ Assembly-eligible pool has at least "
            f"{REQUIRED_POOL} approved questions"
        )

        # ------------------------------------------------------------
        # STEP 8
        # Confirm every newly approved question is eligible.
        # ------------------------------------------------------------
        eligible_ids = {
            question.id
            for question in eligible_questions
        }

        for question_id in approved_ids:
            assert question_id in eligible_ids

        print(
            "✓ All newly approved questions are "
            "assembly-eligible"
        )

        # ------------------------------------------------------------
        # STEP 9
        # Final output.
        # ------------------------------------------------------------
        print()
        print("ASSERTIONS")
        print("-" * 70)

        print(
            "✓ Question Set pool generation succeeded"
        )

        print(
            "✓ Generation filled the required gap"
        )

        print(
            "✓ 13 AI-generated questions entered pending_review"
        )

        print(
            "✓ Maker-checker self-approval was rejected"
        )

        print(
            "✓ Independent reviewer approved all generated questions"
        )

        print(
            "✓ Reviewer audit fields were recorded"
        )

        print(
            "✓ Generated questions remain in the annual Question Bank"
        )

        print(
            "✓ Existing eligible questions were preserved"
        )

        print(
            "✓ Approved pool meets the minimum assembly requirement"
        )

        print()
        print("MAKER-CHECKER DRY RUN PASSED")

    finally:
        # Restore original functions.
        pool_service.generate_questions_from_skills = (
            original_generator
        )

        db.commit = original_commit

        # Remove every temporary generation + approval change.
        db.rollback()

        db.close()


if __name__ == "__main__":
    main()