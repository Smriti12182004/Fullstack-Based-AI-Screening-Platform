"""HR Assessment Inbox API tests."""

from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.db.timestamps import utc_now
from app.main import app
from app.models import (
    Assessment,
    Job,
    QuestionSet,
    QuestionSetConfiguration,
    User,
)
from app.models.assessment_set import AssessmentSet


client = TestClient(app)


def create_test_user(
    db,
    role: str,
) -> User:
    """Create an isolated verified user."""

    unique = uuid4().hex[:10]

    user = User(
        username=f"hr_inbox_{role}_{unique}",
        email=f"hr_inbox_{role}_{unique}@test.com",
        password_hash=hash_password("Test@12345"),
        role=role,
        is_email_verified=True,
    )

    db.add(user)
    db.flush()

    return user


def token_for(
    user: User,
) -> str:
    """Create an application-compatible JWT."""

    return create_access_token(
        {
            "sub": str(user.id),
            "role": user.role,
        }
    )


def create_assessment_bundle(
    db,
    recruiter: User,
    manager: User,
    reviewer: User,
    *,
    set_status: str = "approved",
    sent_to_hr: bool = True,
    question_count: int = 12,
    duration_minutes: int = 45,
    title_suffix: str | None = None,
) -> dict:
    """Create one HR inbox assessment fixture."""

    suffix = title_suffix or uuid4().hex[:8]

    job = Job(
        title=f"HR Inbox Job {suffix}",
        description="HR assessment inbox test job.",
        created_by=recruiter.id,
    )
    db.add(job)
    db.flush()

    question_set = QuestionSet(
        job_id=job.id,
        name=f"HR Inbox Question Set {suffix}",
        description="Question set used for HR inbox testing.",
        variant_count=2,
        status="draft",
        version=1,
        created_by=manager.id,
    )
    db.add(question_set)
    db.flush()

    assessment_set = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=1,
        label="A",
        status=set_status,
        reviewer_id=reviewer.id,
        sent_to_hr_by=reviewer.id if sent_to_hr else None,
        sent_to_hr_at=utc_now() if sent_to_hr else None,
    )
    db.add(assessment_set)
    db.flush()

    assessment = Assessment(
        job_id=job.id,
        question_set_id=question_set.id,
        variant_number=1,
        title=f"HR Inbox Assessment - Set A - {suffix}",
        status="ready",
        review_status="approved",
    )
    db.add(assessment)
    db.flush()

    configuration = QuestionSetConfiguration(
        question_set_id=question_set.id,
        total_questions=question_count,
        duration_minutes=duration_minutes,
        candidate_instructions="Answer all questions carefully.",
    )
    db.add(configuration)

    db.commit()

    return {
        "job": job,
        "question_set": question_set,
        "assessment_set": assessment_set,
        "assessment": assessment,
        "configuration": configuration,
    }


def cleanup_bundle(
    db,
    bundle: dict,
) -> None:
    """Remove all records created by one bundle."""

    configuration = bundle.get("configuration")
    if configuration is not None:
        db.delete(configuration)

    assessment = bundle.get("assessment")
    if assessment is not None:
        db.delete(assessment)

    assessment_set = bundle.get("assessment_set")
    if assessment_set is not None:
        db.delete(assessment_set)

    question_set = bundle.get("question_set")
    if question_set is not None:
        db.delete(question_set)

    job = bundle.get("job")
    if job is not None:
        db.delete(job)

    db.commit()


def create_variant(
    db,
    *,
    job: Job,
    question_set: QuestionSet,
    reviewer: User,
    variant_number: int,
    label: str,
    sent_to_hr: bool,
    title_suffix: str,
) -> dict:
    """Add another approved AssessmentSet variant to an existing job package."""

    assessment_set = AssessmentSet(
        question_set_id=question_set.id,
        variant_number=variant_number,
        label=label,
        status="approved",
        reviewer_id=reviewer.id,
        sent_to_hr_by=reviewer.id if sent_to_hr else None,
        sent_to_hr_at=utc_now() if sent_to_hr else None,
    )
    db.add(assessment_set)
    db.flush()

    assessment = Assessment(
        job_id=job.id,
        question_set_id=question_set.id,
        variant_number=variant_number,
        title=f"HR Inbox Assessment - Set {label} - {title_suffix}",
        status="ready",
        review_status="approved",
    )
    db.add(assessment)
    db.flush()

    db.commit()

    return {
        "assessment_set": assessment_set,
        "assessment": assessment,
    }


def test_hr_inbox_groups_all_approved_variants_for_a_handed_off_job():
    db = SessionLocal()

    recruiter = None
    manager = None
    reviewer = None
    bundle = None
    companion = None

    try:
        recruiter = create_test_user(
            db,
            "recruiter",
        )
        manager = create_test_user(
            db,
            "assessment_manager",
        )
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        bundle = create_assessment_bundle(
            db,
            recruiter,
            manager,
            reviewer,
            sent_to_hr=True,
            question_count=10,
            duration_minutes=60,
            title_suffix="paired-set-a",
        )

        companion = create_variant(
            db,
            job=bundle["job"],
            question_set=bundle["question_set"],
            reviewer=reviewer,
            variant_number=2,
            label="B",
            sent_to_hr=False,
            title_suffix="paired-set-b",
        )

        response = client.get(
            "/assessment-delivery/hr/assessments",
            headers={
                "Authorization": (
                    f"Bearer {token_for(recruiter)}"
                ),
            },
        )

        assert response.status_code == 200

        items = response.json()["items"]

        job_items = [
            item
            for item in items
            if item["job_id"] == bundle["job"].id
        ]

        assert [
            item["variant_number"]
            for item in job_items
        ] == [1, 2]

        assert [
            item["sent_to_hr"]
            for item in job_items
        ] == [True, False]

        assert job_items[0]["question_count"] == 10
        assert job_items[0]["duration_minutes"] == 60
        assert job_items[1]["question_count"] == 10
        assert job_items[1]["duration_minutes"] == 60
        assert job_items[1]["sent_to_hr_at"] is None

    finally:
        if companion is not None:
            db.delete(companion["assessment"])
            db.delete(companion["assessment_set"])

        if bundle is not None:
            cleanup_bundle(db, bundle)

        if reviewer is not None:
            db.delete(reviewer)
        if manager is not None:
            db.delete(manager)
        if recruiter is not None:
            db.delete(recruiter)

        db.commit()
        db.close()


def test_hr_sees_only_approved_handed_off_assessments_for_owned_jobs():
    db = SessionLocal()

    recruiter = None
    other_recruiter = None
    manager = None
    reviewer = None
    bundles = []

    try:
        recruiter = create_test_user(
            db,
            "recruiter",
        )
        other_recruiter = create_test_user(
            db,
            "recruiter",
        )
        manager = create_test_user(
            db,
            "assessment_manager",
        )
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        owned_handed_off = create_assessment_bundle(
            db,
            recruiter,
            manager,
            reviewer,
            title_suffix="owned-handed-off",
        )
        bundles.append(owned_handed_off)

        owned_not_handed_off = create_assessment_bundle(
            db,
            recruiter,
            manager,
            reviewer,
            sent_to_hr=False,
            title_suffix="owned-not-handed-off",
        )
        bundles.append(owned_not_handed_off)

        owned_rejected = create_assessment_bundle(
            db,
            recruiter,
            manager,
            reviewer,
            set_status="rejected",
            title_suffix="owned-rejected",
        )
        bundles.append(owned_rejected)

        other_owned_handed_off = create_assessment_bundle(
            db,
            other_recruiter,
            manager,
            reviewer,
            title_suffix="other-owner",
        )
        bundles.append(other_owned_handed_off)

        response = client.get(
            "/assessment-delivery/hr/assessments",
            headers={
                "Authorization": (
                    f"Bearer {token_for(recruiter)}"
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert [
            item["assessment_set_id"]
            for item in data["items"]
        ] == [
            owned_handed_off["assessment_set"].id
        ]

    finally:
        for bundle in reversed(bundles):
            cleanup_bundle(db, bundle)

        if reviewer is not None:
            db.delete(reviewer)
        if manager is not None:
            db.delete(manager)
        if other_recruiter is not None:
            db.delete(other_recruiter)
        if recruiter is not None:
            db.delete(recruiter)

        db.commit()
        db.close()


def test_hr_inbox_returns_question_count_duration_and_handoff_metadata():
    db = SessionLocal()

    recruiter = None
    manager = None
    reviewer = None
    bundle = None

    try:
        recruiter = create_test_user(
            db,
            "recruiter",
        )
        manager = create_test_user(
            db,
            "assessment_manager",
        )
        reviewer = create_test_user(
            db,
            "assessment_reviewer",
        )

        bundle = create_assessment_bundle(
            db,
            recruiter,
            manager,
            reviewer,
            question_count=18,
            duration_minutes=60,
            title_suffix="metadata",
        )

        response = client.get(
            "/assessment-delivery/hr/assessments",
            headers={
                "Authorization": (
                    f"Bearer {token_for(recruiter)}"
                ),
            },
        )

        assert response.status_code == 200

        data = response.json()

        assert len(data["items"]) == 1

        item = data["items"][0]

        assert item["assessment_set_id"] == bundle["assessment_set"].id
        assert item["assessment_id"] == bundle["assessment"].id
        assert item["job_id"] == bundle["job"].id
        assert item["job_title"] == bundle["job"].title
        assert item["question_set_id"] == bundle["question_set"].id
        assert item["title"] == bundle["assessment"].title
        assert item["label"] == "A"
        assert item["variant_number"] == 1
        assert item["assessment_status"] == "ready"
        assert item["review_status"] == "approved"
        assert item["question_count"] == 18
        assert item["duration_minutes"] == 60
        assert item["sent_to_hr_at"] is not None

    finally:
        if bundle is not None:
            cleanup_bundle(db, bundle)

        if reviewer is not None:
            db.delete(reviewer)
        if manager is not None:
            db.delete(manager)
        if recruiter is not None:
            db.delete(recruiter)

        db.commit()
        db.close()


def test_non_recruiter_cannot_access_hr_assessment_inbox():
    db = SessionLocal()

    manager = None

    try:
        manager = create_test_user(
            db,
            "assessment_manager",
        )
        db.commit()

        response = client.get(
            "/assessment-delivery/hr/assessments",
            headers={
                "Authorization": (
                    f"Bearer {token_for(manager)}"
                ),
            },
        )

        assert response.status_code == 403

    finally:
        if manager is not None:
            db.delete(manager)

        db.commit()
        db.close()