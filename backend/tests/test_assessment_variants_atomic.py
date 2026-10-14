"""Atomic assessment variant assembly tests."""

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
    assemble_assessment_variants,
)


def test_variant_batch_creation_is_atomic_when_inventory_is_insufficient():
    """
    When the question pool cannot satisfy all three variants,
    no variant should be persisted.
    """

    db = SessionLocal()

    job = None
    skill = None
    question_set = None
    questions = []

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None

        job = Job(
            title=f"Atomic Variant Job {uuid4().hex[:8]}",
            description="Atomic variant assembly test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        skill = Skill(
            name=f"atomic-variant-skill-{uuid4().hex[:8]}",
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
            name=f"Atomic Variant Set {uuid4().hex[:8]}",
            description="Atomic three-variant test.",
            status="draft",
            version=1,
            created_by=recruiter.id,
            variant_count=2,
        )

        db.add(question_set)
        db.flush()

        section = Section(
            question_set_id=question_set.id,
            name="Easy",
            difficulty="easy",
            display_order=1,
            is_locked=False,
        )

        db.add(section)
        db.flush()

        db.add(
            SectionSkill(
                section_id=section.id,
                skill_id=skill.id,
                question_count=2,
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

        # Only three questions exist.
        # Two variants require four questions.
        for number in range(3):
            question = Question(
                question_text=(
                    f"Atomic question {number + 1} "
                    f"{uuid4().hex[:8]}"
                ),
                question_type="MCQ",
                skill_id=skill.id,
                difficulty="easy",
                options=["A", "B", "C", "D"],
                correct_answer="A",
                status="approved",
                source="manual",
            )

            db.add(question)
            questions.append(question)

        db.commit()

        try:
            assemble_assessment_variants(
                db=db,
                question_set_id=question_set.id,
                title="Atomic Backend Assessment",
            )

            raise AssertionError(
                "Two variants should fail when only three "
                "questions are available."
            )

        except AssessmentServiceError as exc:
            assert "only 1 are available" in str(exc)

        persisted_assessments = (
            db.query(Assessment)
            .filter(
                Assessment.question_set_id
                == question_set.id
            )
            .all()
        )

        assert persisted_assessments == []

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
                db.query(
                    AssessmentQuestion
                ).filter(
                    AssessmentQuestion.assessment_id.in_(
                        assessment_ids
                    )
                ).delete(
                    synchronize_session=False
                )

                db.query(
                    Assessment
                ).filter(
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
                db.query(
                    SectionSkill
                ).filter(
                    SectionSkill.section_id.in_(
                        section_ids
                    )
                ).delete(
                    synchronize_session=False
                )

            db.query(
                Section
            ).filter(
                Section.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            db.query(
                QuestionSet
            ).filter(
                QuestionSet.id == question_set.id
            ).delete(
                synchronize_session=False
            )

        for question in questions:
            if question.id is not None:
                db.query(
                    Question
                ).filter(
                    Question.id == question.id
                ).delete(
                    synchronize_session=False
                )

        if job is not None:
            db.query(
                Job
            ).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        if skill is not None:
            db.query(
                Skill
            ).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()