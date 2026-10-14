"""Assessment variant API tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.session import SessionLocal
from app.main import app
from app.models import (
    Assessment,
    AssessmentQuestion,
    Job,
    JobAssessmentAccess,
    JobSkill,
    JobSkillReview,
    Question,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
    SectionSkill,
    Skill,
    User,
)


client = TestClient(app)


def test_assessment_variants_api_creates_three_distinct_variants():
    """
    The assessment assembly API must create three variants from the
    same question-set blueprint without reusing questions.
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

        manager = (
            db.query(User)
            .filter(
                User.role == "assessment_manager"
            )
            .first()
        )

        assert recruiter is not None
        assert manager is not None

        # -----------------------------------------------------
        # Create job.
        # -----------------------------------------------------

        job = Job(
            title=f"Variant API Job {uuid4().hex[:8]}",
            description="Three-variant API test.",
            created_by=recruiter.id,
        )

        db.add(job)
        db.flush()

        # -----------------------------------------------------
        # Give assessment manager access to the job.
        # -----------------------------------------------------

        db.add(
            JobAssessmentAccess(
                job_id=job.id,
                user_id=manager.id,
                assigned_by=recruiter.id,
            )
        )

        # -----------------------------------------------------
        # Create skill.
        # -----------------------------------------------------

        skill = Skill(
            name=f"variant-api-skill-{uuid4().hex[:8]}",
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

        # -----------------------------------------------------
        # Create question set.
        # -----------------------------------------------------

        question_set = QuestionSet(
            job_id=job.id,
            name=f"Variant API Set {uuid4().hex[:8]}",
            description="Two assessment variants.",
            status="draft",
            version=1,
            created_by=manager.id,
            variant_count=2,
        )

        db.add(question_set)
        db.flush()

        # -----------------------------------------------------
        # Create blueprint:
        #
        # Easy   = 1
        # Medium = 1
        # Total  = 2
        # -----------------------------------------------------

        easy_section = Section(
            question_set_id=question_set.id,
            name="Easy",
            difficulty="easy",
            display_order=1,
            is_locked=False,
        )

        medium_section = Section(
            question_set_id=question_set.id,
            name="Medium",
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

        # -----------------------------------------------------
        # Create six approved questions:
        #
        # Easy:
        #   E1 E2 E3
        #
        # Medium:
        #   M1 M2 M3
        #
        # Enough inventory for three variants.
        # -----------------------------------------------------

        for difficulty in ("easy", "medium"):
            for number in range(1, 4):
                question = Question(
                    question_text=(
                        f"{difficulty.title()} "
                        f"Variant Question {number} "
                        f"{uuid4().hex[:8]}"
                    ),
                    question_type="MCQ",
                    skill_id=skill.id,
                    difficulty=difficulty,
                    options=[
                        "A",
                        "B",
                        "C",
                        "D",
                    ],
                    correct_answer="A",
                    status="approved",
                    source="manual",
                )

                db.add(question)
                questions.append(question)

        db.commit()

        # -----------------------------------------------------
        # Login token for assessment manager.
        # -----------------------------------------------------

        token = create_access_token(
            {
                "sub": str(manager.id),
                "role": "assessment_manager",
            }
        )

        headers = {
            "Authorization": f"Bearer {token}",
        }

        # -----------------------------------------------------
        # Variant 1.
        # -----------------------------------------------------

        response_1 = client.post(
            "/assessments/assemble",
            headers=headers,
            json={
                "question_set_id": question_set.id,
                "title": "Backend Developer Assessment - Variant 1",
            },
        )

        assert response_1.status_code == 201

        variant_1 = response_1.json()

        assert variant_1["question_set_id"] == question_set.id
        assert variant_1["variant_number"] == 1
        assert variant_1["status"] == "ready"

        assessment_1 = db.get(
            Assessment,
            variant_1["id"],
        )

        assert assessment_1 is not None

        rows_1 = (
            db.query(AssessmentQuestion)
            .filter(
                AssessmentQuestion.assessment_id
                == assessment_1.id
            )
            .order_by(
                AssessmentQuestion.display_order
            )
            .all()
        )

        assert len(rows_1) == 2

        variant_1_question_ids = {
            row.question_id
            for row in rows_1
        }

        # -----------------------------------------------------
        # Variant 2.
        # -----------------------------------------------------

        response_2 = client.post(
            "/assessments/assemble",
            headers=headers,
            json={
                "question_set_id": question_set.id,
                "title": "Backend Developer Assessment - Variant 2",
            },
        )

        assert response_2.status_code == 201

        variant_2 = response_2.json()

        assert variant_2["question_set_id"] == question_set.id
        assert variant_2["variant_number"] == 2
        assert variant_2["status"] == "ready"

        assessment_2 = db.get(
            Assessment,
            variant_2["id"],
        )

        assert assessment_2 is not None

        rows_2 = (
            db.query(AssessmentQuestion)
            .filter(
                AssessmentQuestion.assessment_id
                == assessment_2.id
            )
            .order_by(
                AssessmentQuestion.display_order
            )
            .all()
        )

        assert len(rows_2) == 2

        variant_2_question_ids = {
            row.question_id
            for row in rows_2
        }

        # -----------------------------------------------------
        # Verify both variants are different.
        # -----------------------------------------------------

        assert variant_1_question_ids.isdisjoint(
            variant_2_question_ids
        )

        # -----------------------------------------------------
        # Every variant follows the same blueprint:
        #
        #   1 easy
        #   1 medium
        # -----------------------------------------------------

        for rows in (
            rows_1,
            rows_2,
        ):
            difficulties = sorted(
                row.difficulty
                for row in rows
            )

            assert difficulties == [
                "easy",
                "medium",
            ]

        # -----------------------------------------------------
        # Four total questions consumed.
        # -----------------------------------------------------

        all_used_question_ids = (
            variant_1_question_ids
            | variant_2_question_ids
        )

        assert len(all_used_question_ids) == 4

        # -----------------------------------------------------
        # Variant 3 must fail.
        # -----------------------------------------------------

        response_3 = client.post(
            "/assessments/assemble",
            headers=headers,
            json={
                "question_set_id": question_set.id,
                "title": "Backend Developer Assessment - Variant 3",
            },
        )

        assert response_3.status_code == 422

        assert response_3.json()["detail"] == (
            f"All 2 assessment variants have already been "
            f"created for question set {question_set.id}."
        )

    finally:
        # -----------------------------------------------------
        # Remove generated assessment snapshots.
        # -----------------------------------------------------

        if question_set is not None:
            assessments = (
                db.query(Assessment)
                .filter(
                    Assessment.question_set_id
                    == question_set.id
                )
                .all()
            )

            assessment_ids = [
                assessment.id
                for assessment in assessments
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

            # -------------------------------------------------
            # Remove configuration.
            # -------------------------------------------------

            db.query(
                QuestionSetConfiguration
            ).filter(
                QuestionSetConfiguration.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            # -------------------------------------------------
            # Remove SectionSkill rows.
            # -------------------------------------------------

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

            # -------------------------------------------------
            # Remove sections.
            # -------------------------------------------------

            db.query(
                Section
            ).filter(
                Section.question_set_id
                == question_set.id
            ).delete(
                synchronize_session=False
            )

            # -------------------------------------------------
            # Remove question set.
            # -------------------------------------------------

            db.query(
                QuestionSet
            ).filter(
                QuestionSet.id == question_set.id
            ).delete(
                synchronize_session=False
            )

        # -----------------------------------------------------
        # Remove questions.
        # -----------------------------------------------------

        for question in questions:
            if question.id is not None:
                db.query(
                    Question
                ).filter(
                    Question.id == question.id
                ).delete(
                    synchronize_session=False
                )

        # -----------------------------------------------------
        # Remove job access.
        # -----------------------------------------------------

        if job is not None:
            db.query(
                JobAssessmentAccess
            ).filter(
                JobAssessmentAccess.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(
                JobSkillReview
            ).filter(
                JobSkillReview.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(
                JobSkill
            ).filter(
                JobSkill.job_id == job.id
            ).delete(
                synchronize_session=False
            )

            db.query(
                Job
            ).filter(
                Job.id == job.id
            ).delete(
                synchronize_session=False
            )

        # -----------------------------------------------------
        # Remove skill.
        # -----------------------------------------------------

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