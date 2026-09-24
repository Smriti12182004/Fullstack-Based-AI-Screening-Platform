"""S4-02 assessment question snapshot tests."""

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
from app.services.assessment_service import assemble_assessment


def test_assessment_question_snapshot_is_preserved_after_question_edit():
    """
    Editing a question in the question bank must not change the
    question content already stored in a finalized assessment.
    """

    db = SessionLocal()

    job = None
    skill = None
    question_set = None
    assessment = None
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
            title=f"S4-02 Snapshot Job {uuid4().hex[:8]}",
            description="Question snapshot preservation test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        skill = Skill(
            name=f"s4-snapshot-skill-{uuid4().hex[:8]}",
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
            name=f"S4-02 Snapshot Set {uuid4().hex[:8]}",
            description="Snapshot preservation test set.",
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
                name="Snapshot Test",
                display_order=1,
                easy_count=1,
                medium_count=0,
                hard_count=0,
                is_locked=False,
            )
        )

        db.add(
            QuestionSetConfiguration(
                question_set_id=question_set.id,
                total_questions=1,
                duration_minutes=15,
                candidate_instructions="Answer the question.",
            )
        )

        original_text = (
            f"Original snapshot question {uuid4().hex[:8]}"
        )

        question = Question(
            question_text=original_text,
            question_type="MCQ",
            skill_id=skill.id,
            difficulty="easy",
            options=[
                "Original A",
                "Original B",
                "Original C",
                "Original D",
            ],
            correct_answer="Original A",
            explanation="Original explanation.",
            status="approved",
            source="manual",
        )

        db.add(question)
        db.commit()
        db.refresh(question)

        assessment = assemble_assessment(
            db=db,
            question_set_id=question_set.id,
            title="Snapshot Preservation Assessment",
        )

        snapshot = (
            db.query(AssessmentQuestion)
            .filter(
                AssessmentQuestion.assessment_id
                == assessment.id
            )
            .first()
        )

        assert snapshot is not None

        assert snapshot.question_id == question.id
        assert snapshot.question_text == original_text
        assert snapshot.question_type == "MCQ"
        assert snapshot.skill_id == skill.id
        assert snapshot.difficulty == "easy"
        assert snapshot.options == [
            "Original A",
            "Original B",
            "Original C",
            "Original D",
        ]
        assert snapshot.correct_answer == "Original A"
        assert snapshot.explanation == "Original explanation."

        # Simulate a later Question Bank edit.
        question.question_text = "Edited question text"
        question.options = [
            "Edited A",
            "Edited B",
            "Edited C",
            "Edited D",
        ]
        question.correct_answer = "Edited A"
        question.explanation = "Edited explanation."
        question.difficulty = "medium"

        db.commit()
        db.refresh(question)
        db.expire(snapshot)
        db.refresh(snapshot)

        # The finalized assessment snapshot must remain unchanged.
        assert question.question_text == "Edited question text"
        assert question.difficulty == "medium"

        assert snapshot.question_text == original_text
        assert snapshot.question_type == "MCQ"
        assert snapshot.skill_id == skill.id
        assert snapshot.difficulty == "easy"
        assert snapshot.options == [
            "Original A",
            "Original B",
            "Original C",
            "Original D",
        ]
        assert snapshot.correct_answer == "Original A"
        assert snapshot.explanation == "Original explanation."

        print()
        print("ASSESSMENT ID:", assessment.id)
        print("QUESTION ID:", question.id)
        print("CURRENT QUESTION:", question.question_text)
        print("SNAPSHOT QUESTION:", snapshot.question_text)
        print("SNAPSHOT DIFFICULTY:", snapshot.difficulty)
        print()
        print("ASSESSMENT QUESTION SNAPSHOT TEST PASSED")

    finally:
        if assessment is not None:
            db.query(AssessmentQuestion).filter(
                AssessmentQuestion.assessment_id
                == assessment.id
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