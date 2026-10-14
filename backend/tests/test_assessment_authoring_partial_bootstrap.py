
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import app.services.assessment_authoring_service as authoring_service


@pytest.fixture
def question_set():
    return SimpleNamespace(
        id=42,
        job_id=7,
        name="Backend Developer - 2026 Assessment",
        hiring_year=2026,
        variant_count=2,
    )


@pytest.fixture
def sections():
    return [
        {"id": 11, "name": "Core Fundamentals", "section_type": "conceptual"},
        {
            "id": 12,
            "name": "Implementation & Applied Reasoning",
            "section_type": "implementation",
        },
        {
            "id": 13,
            "name": "Evaluation & Open Response",
            "section_type": "free_text",
        },
    ]


def make_db(existing_sets=None):
    db = MagicMock()
    query = db.query.return_value
    query.filter.return_value.order_by.return_value.all.return_value = (
        existing_sets or []
    )
    query.filter.return_value.all.return_value = []
    query.filter.return_value.first.return_value = None
    return db


def test_workspace_loads_when_all_sections_are_unconfigured(
    monkeypatch, question_set, sections
):
    db = make_db()
    available_skill = SimpleNamespace(id=101, name="Python", category="Programming")

    monkeypatch.setattr(
        authoring_service,
        "_get_question_set",
        lambda _db, _question_set_id, _user_id: question_set,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_rows",
        lambda _db, _question_set_id: sections,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_skill_rows",
        lambda _db, _section_id: [],
    )
    monkeypatch.setattr(
        authoring_service,
        "get_job_skills",
        lambda _db, _job_id: [available_skill],
    )

    result = authoring_service.get_question_set_authoring_workspace(
        db=db,
        question_set_id=question_set.id,
        user_id=5,
    )

    assert result["question_set_id"] == question_set.id
    assert result["variant_count"] == 2
    assert result["sections"] == sections
    assert result["available_skills"] == [
        {"id": 101, "name": "Python", "category": "Programming"}
    ]
    assert result["sets"] == []
    db.add.assert_not_called()


def test_bootstrap_skips_unconfigured_sections_and_creates_slots_for_allocated_section(
    monkeypatch, question_set, sections
):
    db = make_db()
    positive_allocation = {
        "skill_id": 101,
        "easy_count": 1,
        "medium_count": 0,
        "hard_count": 0,
    }
    allocations_by_section = {
        11: [],
        12: [positive_allocation],
        13: [],
    }
    skill = SimpleNamespace(id=101, name="Python", category="Programming")

    monkeypatch.setattr(
        authoring_service,
        "_get_question_set",
        lambda _db, _question_set_id, _user_id: question_set,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_rows",
        lambda _db, _question_set_id: sections,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_skill_rows",
        lambda _db, section_id: allocations_by_section[section_id],
    )
    monkeypatch.setattr(
        authoring_service,
        "_skill_map",
        lambda _db, skill_ids: {101: skill} if skill_ids == {101} else {},
    )
    monkeypatch.setattr(
        authoring_service,
        "get_job_skills",
        lambda _db, _job_id: [skill],
    )

    result = authoring_service.bootstrap_question_set(
        db=db,
        question_set_id=question_set.id,
        user_id=5,
    )

    assert [item["label"] for item in result["sets"]] == ["Set A", "Set B"]
    assert all(item["question_set_id"] == question_set.id for item in result["sets"])

    added_objects = [call.args[0] for call in db.add.call_args_list]
    created_slots = [
        item
        for item in added_objects
        if isinstance(item, authoring_service.QuestionSlot)
    ]
    assert len(created_slots) == 2
    assert {item.section_id for item in created_slots} == {12}


def test_bootstrap_still_rejects_blueprint_with_no_positive_allocations(
    monkeypatch, question_set, sections
):
    db = make_db()

    monkeypatch.setattr(
        authoring_service,
        "_get_question_set",
        lambda _db, _question_set_id, _user_id: question_set,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_rows",
        lambda _db, _question_set_id: sections,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_skill_rows",
        lambda _db, _section_id: [],
    )

    with pytest.raises(ValueError, match="No positive question allocations"):
        authoring_service.bootstrap_question_set(
            db=db,
            question_set_id=question_set.id,
            user_id=5,
        )


def test_review_validation_requires_each_section_to_have_skill_allocations(
    monkeypatch, sections
):
    allocations_by_section = {
        11: [{"skill_id": 101, "easy_count": 1, "medium_count": 0, "hard_count": 0}],
        12: [],
        13: [{"skill_id": 101, "easy_count": 0, "medium_count": 0, "hard_count": 1}],
    }
    monkeypatch.setattr(
        authoring_service,
        "_section_rows",
        lambda _db, _question_set_id: sections,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_skill_rows",
        lambda _db, section_id: allocations_by_section[section_id],
    )

    with pytest.raises(ValueError, match="Implementation.*must contain at least one skill allocation"):
        authoring_service._validate_sections_for_review(MagicMock(), 42)


def test_review_validation_rejects_section_with_only_zero_counts(
    monkeypatch, sections
):
    allocations_by_section = {
        11: [{"skill_id": 101, "easy_count": 1, "medium_count": 0, "hard_count": 0}],
        12: [{"skill_id": 102, "easy_count": 0, "medium_count": 0, "hard_count": 0}],
        13: [{"skill_id": 103, "easy_count": 0, "medium_count": 0, "hard_count": 1}],
    }
    monkeypatch.setattr(
        authoring_service,
        "_section_rows",
        lambda _db, _question_set_id: sections,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_skill_rows",
        lambda _db, section_id: allocations_by_section[section_id],
    )

    with pytest.raises(ValueError, match="Implementation.*must contain at least one requested question"):
        authoring_service._validate_sections_for_review(MagicMock(), 42)


def test_review_validation_accepts_complete_positive_section_allocations(
    monkeypatch, sections
):
    allocations_by_section = {
        11: [{"skill_id": 101, "easy_count": 1, "medium_count": 0, "hard_count": 0}],
        12: [{"skill_id": 102, "easy_count": 0, "medium_count": 1, "hard_count": 0}],
        13: [{"skill_id": 103, "easy_count": 0, "medium_count": 0, "hard_count": 1}],
    }
    monkeypatch.setattr(
        authoring_service,
        "_section_rows",
        lambda _db, _question_set_id: sections,
    )
    monkeypatch.setattr(
        authoring_service,
        "_section_skill_rows",
        lambda _db, section_id: allocations_by_section[section_id],
    )

    authoring_service._validate_sections_for_review(MagicMock(), 42)
