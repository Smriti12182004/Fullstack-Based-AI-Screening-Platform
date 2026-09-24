"""S4-04 automatic assessment assembly tests."""

from uuid import uuid4

from app.db.session import SessionLocal
from app.models import (
    Assessment,
    AssessmentQuestion,
    Job,
    JobSkill,
    JobSkillReview,
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
    Skill,
    User,
)
from app.services.assessment_service import (
    AssessmentServiceError,
    assemble_assessment,
)


def test_assessment_is_automatically_assembled():
    """Approved questions are automatically selected and persisted."""

    db = SessionLocal()

    job = None
    skill = None
    question_set = None
    assessment = None
    questions = []

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None, (
            "This test requires an existing recruiter user."
        )

        job = Job(
            title=f"S4-04 Assembly Test Job {uuid4().hex[:8]}",
            description="Python backend developer assessment assembly test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        skill = Skill(
            name=f"s4-assembly-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.flush()

        db.add(
            JobSkill(
                job_id=job.id,
                skill_id=skill.id,
            )
        )

        db.add(
            JobSkillReview(
                job_id=job.id,
                status="confirmed",
            )
        )

        question_set = QuestionSet(
            job_id=job.id,
            name=f"S4-04 Assembly Set {uuid4().hex[:8]}",
            description="Automatic assembly test question set.",
            status="draft",
            version=1,
            created_by=recruiter.id,
        )

        db.add(question_set)
        db.flush()

        section = Section(
            question_set_id=question_set.id,
            skill_id=skill.id,
            name="Python",
            display_order=1,
            easy_count=1,
            medium_count=1,
            hard_count=1,
            is_locked=False,
        )

        db.add(section)

        configuration = QuestionSetConfiguration(
            question_set_id=question_set.id,
            total_questions=3,
            duration_minutes=30,
            candidate_instructions="Complete all questions.",
        )

        db.add(configuration)

        for difficulty in ("easy", "medium", "hard"):
            question = Question(
                question_text=(
                    f"S4-04 {difficulty} assembly question "
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

        for question in questions:
            db.refresh(question)

        assessment = assemble_assessment(
            db=db,
            question_set_id=question_set.id,
            title=f"S4-04 Auto Assessment {uuid4().hex[:8]}",
        )

        assert assessment.id is not None
        assert assessment.job_id == job.id
        assert assessment.status == "ready"

        persisted_rows = (
            db.query(AssessmentQuestion)
            .filter(
                AssessmentQuestion.assessment_id == assessment.id
            )
            .order_by(
                AssessmentQuestion.display_order
            )
            .all()
        )

        assert len(persisted_rows) == 3
        assert len(
            {
                row.question_id
                for row in persisted_rows
            }
        ) == 3

        persisted_question_ids = {
            row.question_id
            for row in persisted_rows
        }

        assert persisted_question_ids == {
            question.id
            for question in questions
        }

        persisted_questions = [
            db.get(Question, row.question_id)
            for row in persisted_rows
        ]

        assert sorted(
            question.difficulty
            for question in persisted_questions
        ) == [
            "easy",
            "hard",
            "medium",
        ]

        print()
        print("ASSESSMENT ID:", assessment.id)
        print("JOB ID:", job.id)
        print("QUESTION SET ID:", question_set.id)
        print(
            "ASSESSMENT QUESTION IDS:",
            [
                row.question_id
                for row in persisted_rows
            ],
        )
        print(
            "DIFFICULTIES:",
            [
                question.difficulty
                for question in persisted_questions
            ],
        )
        print()
        print("ASSESSMENT ASSEMBLY TEST PASSED")

    finally:
        if assessment is not None:
            db.query(AssessmentQuestion).filter(
                AssessmentQuestion.assessment_id == assessment.id
            ).delete(
                synchronize_session=False
            )

            db.query(Assessment).filter(
                Assessment.id == assessment.id
            ).delete(
                synchronize_session=False
            )

        if question_set is not None:
            db.query(QuestionSetConfiguration).filter(
                QuestionSetConfiguration.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            db.query(Section).filter(
                Section.question_set_id == question_set.id
            ).delete(
                synchronize_session=False
            )

            db.query(QuestionSet).filter(
                QuestionSet.id == question_set.id
            ).delete(
                synchronize_session=False
            )

        if job is not None:
            db.query(JobSkillReview).filter(
                JobSkillReview.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(Job).filter(
                Job.id == job.id
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

        if skill is not None:
            db.query(Skill).filter(
                Skill.id == skill.id
            ).delete(
                synchronize_session=False
            )

        db.commit()
        db.close()


def test_assembly_fails_when_approved_questions_are_insufficient():
    """Assembly refuses to create an incomplete assessment."""

    db = SessionLocal()

    job = None
    skill = None
    question_set = None
    question = None

    try:
        recruiter = (
            db.query(User)
            .filter(User.role == "recruiter")
            .first()
        )

        assert recruiter is not None, (
            "This test requires an existing recruiter user."
        )

        job = Job(
            title=f"S4-04 Insufficient Test Job {uuid4().hex[:8]}",
            description="Insufficient approved question test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        skill = Skill(
            name=f"s4-insufficient-skill-{uuid4().hex[:8]}",
        )

        db.add(skill)
        db.flush()

        db.add(
            JobSkill(
                job_id=job.id,
                skill_id=skill.id,
            )
        )

        db.add(
            JobSkillReview(
                job_id=job.id,
                status="confirmed",
            )
        )

        question_set = QuestionSet(
            job_id=job.id,
            name=f"S4-04 Insufficient Set {uuid4().hex[:8]}",
            description="Insufficient question assembly test.",
            status="draft",
            version=1,
            created_by=recruiter.id,
        )

        db.add(question_set)
        db.flush()

        db.add(
            Section(
                question_set_id=question_set.id,
                skill_id=skill.id,
                name="Python",
                display_order=1,
                easy_count=2,
                medium_count=0,
                hard_count=0,
                is_locked=False,
            )
        )

        db.add(
            QuestionSetConfiguration(
                question_set_id=question_set.id,
                total_questions=2,
                duration_minutes=20,
                candidate_instructions=None,
            )
        )

        question = Question(
            question_text=f"Only one approved question {uuid4().hex[:8]}",
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=["A", "B"],
            correct_answer="A",
            status="approved",
            source="manual",
        )

        db.add(question)
        db.commit()

        try:
            assemble_assessment(
                db=db,
                question_set_id=question_set.id,
                title="Should Fail",
            )
            raise AssertionError(
                "Assembly should fail when approved questions are insufficient."
            )
        except AssessmentServiceError as exc:
            assert str(exc) == (
                "Section 'Python' requires 2 approved easy "
                "question(s), but only 1 are available."
            )

    finally:
        if question_set is not None:
            db.query(AssessmentQuestion).filter(
                AssessmentQuestion.assessment_id.in_(
                    db.query(Assessment.id).filter(
                        Assessment.job_id
                        == job.id
                    )
                )
            ).delete(
                synchronize_session=False
            )

            db.query(Assessment).filter(
                Assessment.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(QuestionSetConfiguration).filter(
                QuestionSetConfiguration.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            db.query(Section).filter(
                Section.question_set_id == question_set.id
            ).delete(
                synchronize_session=False
            )

            db.query(QuestionSet).filter(
                QuestionSet.id == question_set.id
            ).delete(
                synchronize_session=False
            )

        if question is not None:
            db.query(Question).filter(
                Question.id == question.id
            ).delete(
                synchronize_session=False
            )

        if job is not None:
            db.query(JobSkillReview).filter(
                JobSkillReview.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(JobSkill).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

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