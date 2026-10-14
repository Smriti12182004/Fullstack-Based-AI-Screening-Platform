"""Individual AssessmentSet submission lifecycle tests."""

from uuid import uuid4

import pytest

from app.db.session import SessionLocal
from app.models.section_skill import SectionSkill

from app.models import (
    AssessmentSet,
    Job,
    JobAssessmentAccess,
    Question,
    QuestionSet,
    QuestionSlot,
    Section,
    Skill,
    User,
)
from app.services.assessment_authoring_service import (
    submit_assessment_set_for_review,
)


def _create_user(db, role: str) -> User:
    unique = uuid4().hex[:10]
    user = User(
        username=f"s4_set_submit_{role}_{unique}",
        email=f"s4_set_submit_{role}_{unique}@test.com",
        password_hash="test-password-hash",
        role=role,
        is_email_verified=True,
    )
    db.add(user)
    db.flush()
    return user


def _create_fixture(db):
    manager = _create_user(db, "assessment_manager")
    reviewer = _create_user(db, "assessment_reviewer")

    job = Job(
        title=f"S4 Set Submission Job {uuid4().hex[:8]}",
        description="AssessmentSet independent submission test job.",
        created_by=manager.id,
    )
    db.add(job)
    db.flush()

    db.add(
        JobAssessmentAccess(
            job_id=job.id,
            user_id=manager.id,
            assigned_by=manager.id,
        )
    )
    db.add(
        JobAssessmentAccess(
            job_id=job.id,
            user_id=reviewer.id,
            assigned_by=manager.id,
        )
    )

    skill = Skill(name=f"s4-set-submit-skill-{uuid4().hex[:8]}")
    db.add(skill)
    db.flush()

    question_set = QuestionSet(
        job_id=job.id,
        name=f"S4 Set Submission Question Set {uuid4().hex[:8]}",
        description="Independent AssessmentSet submission test.",
        status="draft",
        version=1,
        created_by=manager.id,
        variant_count=2,
    )
    db.add(question_set)
    db.flush()

    section = Section(
        question_set_id=question_set.id,
        name="Technical",
        section_type="implementation",
        difficulty="medium",
        display_order=1,
        is_locked=False,
    )
    db.add(section)
    db.flush()

    # Review submission requires each section to have a positive skill
    # allocation. The existing question slots use medium difficulty.
    db.add(
        SectionSkill(question_count=1,
            section_id=section.id,
            skill_id=skill.id,
            easy_count=0,
            medium_count=1,
            hard_count=0,
        )
    )
    db.flush()

    set_a = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=1,
        label="Set A",
        status="draft",
    )
    set_b = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=2,
        label="Set B",
        status="draft",
    )
    db.add_all([set_a, set_b])
    db.flush()

    slot_a = QuestionSlot(
        assessment_set_id=set_a.id,
        section_id=section.id,
        skill_id=skill.id,
        section_type="implementation",
        difficulty="medium",
        slot_number=1,
        preferred_question_type="MCQ",
        status="filled",
    )
    slot_b = QuestionSlot(
        assessment_set_id=set_b.id,
        section_id=section.id,
        skill_id=skill.id,
        section_type="implementation",
        difficulty="medium",
        slot_number=1,
        preferred_question_type="MCQ",
        status="filled",
    )
    db.add_all([slot_a, slot_b])
    db.flush()

    question_a = Question(
        question_text=f"Set A question {uuid4().hex[:8]}",
        question_type="MCQ",
        section_type="implementation",
        skill_id=skill.id,
        difficulty="medium",
        options=["A", "B", "C", "D"],
        correct_answer="A",
        status="pending_review",
        source="manual",
        created_by=manager.id,
    )
    question_b = Question(
        question_text=f"Set B question {uuid4().hex[:8]}",
        question_type="MCQ",
        section_type="implementation",
        skill_id=skill.id,
        difficulty="medium",
        options=["A", "B", "C", "D"],
        correct_answer="A",
        status="pending_review",
        source="manual",
        created_by=manager.id,
    )
    db.add_all([question_a, question_b])
    db.flush()

    slot_a.current_question_id = question_a.id
    slot_b.current_question_id = question_b.id

    db.commit()
    db.refresh(set_a)
    db.refresh(set_b)
    db.refresh(question_a)
    db.refresh(question_b)

    return {
        "manager": manager,
        "reviewer": reviewer,
        "job": job,
        "skill": skill,
        "question_set": question_set,
        "section": section,
        "set_a": set_a,
        "set_b": set_b,
        "slot_a": slot_a,
        "slot_b": slot_b,
        "question_a": question_a,
        "question_b": question_b,
    }


def _cleanup(db, fixture):
    question_set = fixture["question_set"]
    job = fixture["job"]
    manager = fixture["manager"]
    reviewer = fixture["reviewer"]
    skill = fixture["skill"]

    db.query(QuestionSlot).filter(
        QuestionSlot.assessment_set_id.in_(
            [fixture["set_a"].id, fixture["set_b"].id]
        )
    ).delete(synchronize_session=False)

    db.query(Question).filter(
        Question.id.in_([
            fixture["question_a"].id,
            fixture["question_b"].id,
        ])
    ).delete(synchronize_session=False)

    db.query(AssessmentSet).filter(
        AssessmentSet.question_set_id == question_set.id
    ).delete(synchronize_session=False)

    db.query(Section).filter(
        Section.id == fixture["section"].id
    ).delete(synchronize_session=False)

    db.query(QuestionSet).filter(
        QuestionSet.id == question_set.id
    ).delete(synchronize_session=False)

    db.query(JobAssessmentAccess).filter(
        JobAssessmentAccess.job_id == job.id
    ).delete(synchronize_session=False)

    db.query(Job).filter(Job.id == job.id).delete(synchronize_session=False)
    db.query(Skill).filter(Skill.id == skill.id).delete(synchronize_session=False)
    db.query(User).filter(
        User.id.in_([manager.id, reviewer.id])
    ).delete(synchronize_session=False)


def test_submit_one_assessment_set_is_independent_from_sibling_set():
    db = SessionLocal()
    fixture = None

    try:
        fixture = _create_fixture(db)

        result = submit_assessment_set_for_review(
            db=db,
            assessment_set_id=fixture["set_a"].id,
            user_id=fixture["manager"].id,
        )

        db.refresh(fixture["set_a"])
        db.refresh(fixture["set_b"])
        db.refresh(fixture["question_set"])

        assert fixture["set_a"].status == "submitted_for_review"
        assert fixture["set_b"].status == "draft"
        assert fixture["question_set"].status == "draft"
        assert result["assigned_reviewer"]["id"] == fixture["reviewer"].id
        assert result["status"] == "submitted_for_review"

    finally:
        if fixture is not None:
            _cleanup(db, fixture)
            db.commit()
        db.close()


def test_pending_review_questions_are_allowed():
    db = SessionLocal()
    fixture = None

    try:
        fixture = _create_fixture(db)

        result = submit_assessment_set_for_review(
            db=db,
            assessment_set_id=fixture["set_a"].id,
            user_id=fixture["manager"].id,
        )

        assert result["status"] == "submitted_for_review"

    finally:
        if fixture is not None:
            _cleanup(db, fixture)
            db.commit()
        db.close()


def test_rejected_current_question_blocks_submission():
    db = SessionLocal()
    fixture = None

    try:
        fixture = _create_fixture(db)
        fixture["question_a"].status = "rejected"
        fixture["question_a"].rejection_reason = "Needs correction."
        db.commit()

        with pytest.raises(ValueError, match="Rejected questions must be replaced or revised"):
            submit_assessment_set_for_review(
                db=db,
                assessment_set_id=fixture["set_a"].id,
                user_id=fixture["manager"].id,
            )

        db.refresh(fixture["set_a"])
        assert fixture["set_a"].status == "draft"

    finally:
        if fixture is not None:
            _cleanup(db, fixture)
            db.commit()
        db.close()


def test_missing_current_question_blocks_submission():
    db = SessionLocal()
    fixture = None

    try:
        fixture = _create_fixture(db)
        slot = fixture["slot_a"]
        slot.current_question_id = None
        slot.status = "empty"
        db.commit()

        with pytest.raises(
            ValueError,
            match="Every question slot must contain a question",
        ):
            submit_assessment_set_for_review(
                db=db,
                assessment_set_id=fixture["set_a"].id,
                user_id=fixture["manager"].id,
            )

    finally:
        if fixture is not None:
            _cleanup(db, fixture)
            db.commit()
        db.close()


def test_only_draft_or_rejected_sets_can_be_submitted():
    db = SessionLocal()
    fixture = None

    try:
        fixture = _create_fixture(db)
        fixture["set_a"].status = "submitted_for_review"
        db.commit()

        with pytest.raises(ValueError, match="Only draft or rejected"):
            submit_assessment_set_for_review(
                db=db,
                assessment_set_id=fixture["set_a"].id,
                user_id=fixture["manager"].id,
            )

    finally:
        if fixture is not None:
            _cleanup(db, fixture)
            db.commit()
        db.close()
