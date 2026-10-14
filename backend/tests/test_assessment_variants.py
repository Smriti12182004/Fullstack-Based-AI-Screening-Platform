"""Assessment variant assembly tests."""

from uuid import uuid4

from app.db.session import SessionLocal
from app.models import (
    Assessment,
    AssessmentQuestion,
    Job,
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
    SectionSkill,
    Skill,
    JobSkill,
    User,
)
from app.services.assessment_service import (
    AssessmentServiceError,
    assemble_assessment,
)


def test_three_variants_use_different_questions():
    """
    Three variants created from the same blueprint must contain
    different questions while preserving the same blueprint.
    """

    db = SessionLocal()

    job = None
    skill = None
    question_set = None
    questions = []

    try:
        recruiter = (
            db.query(User)
            .filter(
                User.role == "recruiter"
            )
            .first()
        )

        assert recruiter is not None

        job = Job(
            title=f"Variant Test Job {uuid4().hex[:8]}",
            description="Three-variant assessment test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        skill = Skill(
            name=f"variant-test-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.flush()

        db.add(
            JobSkill(
                job_id=job.id,
                skill_id=skill.id,
            )
        )
        db.flush()

        question_set = QuestionSet(
            job_id=job.id,
            name=f"Variant Test Set {uuid4().hex[:8]}",
            description="Three assessment variant test.",
            status="draft",
            version=1,
            created_by=recruiter.id,
            variant_count=2,
        )

        db.add(question_set)
        db.flush()

        easy_section = Section(
            question_set_id=question_set.id,
            name="Easy Section",
            difficulty="easy",
            display_order=1,
            is_locked=False,
        )

        medium_section = Section(
            question_set_id=question_set.id,
            name="Medium Section",
            difficulty="medium",
            display_order=2,
            is_locked=False,
        )

        db.add(easy_section)
        db.add(medium_section)
        db.flush()

        db.add(
            SectionSkill(
                section_id=easy_section.id,
                skill_id=skill.id,
                question_count=1,
            )
        )

        db.add(
            SectionSkill(
                section_id=medium_section.id,
                skill_id=skill.id,
                question_count=1,
            )
        )

        db.add(
            QuestionSetConfiguration(
                question_set_id=question_set.id,
                total_questions=2,
                duration_minutes=30,
                candidate_instructions="Answer all questions.",
            )
        )

        # Three easy + three medium questions.
        for difficulty in ("easy", "medium"):
            for index in range(3):
                question = Question(
                    question_text=(
                        f"{difficulty} variant question "
                        f"{index + 1} "
                        f"{uuid4().hex[:8]}"
                    ),
                    question_type="MCQ",
                    skill_id=skill.id,
                    difficulty=difficulty,
                    options=["A", "B", "C", "D"],
                    correct_answer="A",
                    status="approved",
                    source="manual",
                )

                db.add(question)
                questions.append(question)

        db.commit()

        # -----------------------------------------------------
        # Assemble Variant 1.
        # -----------------------------------------------------

        variant_1 = assemble_assessment(
            db=db,
            question_set_id=question_set.id,
            title="Backend Developer Assessment - Variant 1",
        )

        assert variant_1.variant_number == 1

        # -----------------------------------------------------
        # Assemble Variant 2.
        # -----------------------------------------------------

        variant_2 = assemble_assessment(
            db=db,
            question_set_id=question_set.id,
            title="Backend Developer Assessment - Variant 2",
        )

        assert variant_2.variant_number == 2

        # -----------------------------------------------------
        # Verify every variant has 2 questions.
        # -----------------------------------------------------

        variant_question_ids = {}

        for variant in (
            variant_1,
            variant_2,
        ):
            rows = (
                db.query(AssessmentQuestion)
                .filter(
                    AssessmentQuestion.assessment_id
                    == variant.id
                )
                .order_by(
                    AssessmentQuestion.display_order
                )
                .all()
            )

            assert len(rows) == 2

            variant_question_ids[
                variant.variant_number
            ] = {
                row.question_id
                for row in rows
            }

        # -----------------------------------------------------
        # Verify same blueprint.
        # -----------------------------------------------------

        for question_ids in variant_question_ids.values():
            assert len(question_ids) == 2

        # -----------------------------------------------------
        # Verify no question reuse between variants.
        # -----------------------------------------------------

        assert (
            variant_question_ids[1].isdisjoint(
                variant_question_ids[2]
            )
        )

        # All four questions should have been consumed.
        assert len(
            set().union(
                *variant_question_ids.values()
            )
        ) == 4

        # -----------------------------------------------------
        # Variant 3 must be rejected.
        # -----------------------------------------------------

        try:
            assemble_assessment(
                db=db,
                question_set_id=question_set.id,
                title="Backend Developer Assessment - Variant 3",
            )

            raise AssertionError(
                "Variant 3 should not be created."
            )

        except AssessmentServiceError as exc:
            assert str(exc) == (
                "All 2 assessment variants have already been "
                f"created for question set {question_set.id}."
            )

    finally:
        if question_set is not None:
            assessment_ids = [
                assessment.id
                for assessment in (
                    db.query(Assessment)
                    .filter(
                        Assessment.question_set_id
                        == question_set.id
                    )
                    .all()
                )
            ]

            if assessment_ids:
                db.query(AssessmentQuestion).filter(
                    AssessmentQuestion.assessment_id.in_(
                        assessment_ids
                    )
                ).delete(
                    synchronize_session=False
                )

                db.query(Assessment).filter(
                    Assessment.id.in_(
                        assessment_ids
                    )
                ).delete(
                    synchronize_session=False
                )

            db.query(
                QuestionSetConfiguration
            ).filter(
                QuestionSetConfiguration.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            section_ids = [
                section.id
                for section in (
                    db.query(Section)
                    .filter(
                        Section.question_set_id
                        == question_set.id
                    )
                    .all()
                )
            ]

            if section_ids:
                db.query(SectionSkill).filter(
                    SectionSkill.section_id.in_(
                        section_ids
                    )
                ).delete(
                    synchronize_session=False
                )

            db.query(Section).filter(
                Section.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            db.query(QuestionSet).filter(
                QuestionSet.id == question_set.id
            ).delete(
                synchronize_session=False
            )

        for question in questions:
            if question.id is not None:
                db.query(Question).filter(
                    Question.id == question.id
                ).delete(
                    synchronize_session=False
                )

        if job is not None:
            db.query(Job).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()