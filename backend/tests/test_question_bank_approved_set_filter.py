from types import SimpleNamespace
from unittest.mock import MagicMock

import app.services.assessment_authoring_service as authoring_service


def _slot_and_set():
    slot = SimpleNamespace(
        id=17,
        assessment_set_id=71,
        current_question_id=None,
        source_type=None,
        status="empty",
        skill_id=23,
        difficulty="easy",
        section_type="conceptual",
        preferred_question_type="MCQ",
    )
    question_set = SimpleNamespace(
        id=39,
        job_id=11,
        hiring_year=2026,
    )
    return slot, question_set


def test_current_bank_returns_only_approved_questions_from_approved_sets(monkeypatch):
    slot, question_set = _slot_and_set()
    monkeypatch.setattr(
        authoring_service,
        "_get_slot",
        lambda _db, _slot_id, _user_id: (slot, question_set),
    )

    expected = {
        "id": 501,
        "question_text": "What does git status report?",
        "skill_id": 23,
        "difficulty": "easy",
        "section_type": "conceptual",
        "question_type": "MCQ",
        "status": "approved",
        "confirmed_set_label": "Set A",
        "confirmed_set_variant": 1,
        "manager_rating": 3,
        "reviewer_rating": 2,
    }
    query_result = MagicMock()
    query_result.mappings.return_value.all.return_value = [expected]
    db = MagicMock()
    db.execute.return_value = query_result

    result = authoring_service.get_question_bank_questions(
        db=db,
        slot_id=slot.id,
        user_id=44,
    )

    sql = str(db.execute.call_args.args[0]).lower()
    params = db.execute.call_args.args[1]

    assert "q.status = 'approved'" in sql
    assert "join lateral" in sql
    assert "source_set.status = 'approved'" in sql
    assert "q.skill_id = :skill_id" in sql
    assert "q.difficulty = :difficulty" in sql
    assert "q.section_type = :section_type" in sql
    assert "q.question_type = :question_type" in sql
    assert params["job_id"] == question_set.job_id
    assert params["hiring_year"] == question_set.hiring_year
    assert params["skill_id"] == slot.skill_id
    assert params["difficulty"] == slot.difficulty
    assert params["section_type"] == slot.section_type
    assert params["question_type"] == "MCQ"
    assert result == [expected]


def test_assigning_from_current_bank_revalidates_approved_set_and_slot_context(
    monkeypatch,
):
    slot, question_set = _slot_and_set()
    question = SimpleNamespace(id=501)
    monkeypatch.setattr(
        authoring_service,
        "_get_slot",
        lambda _db, _slot_id, _user_id: (slot, question_set),
    )
    monkeypatch.setattr(
        authoring_service,
        "_slot_response",
        lambda _db, _slot: {"id": _slot.id},
    )
    monkeypatch.setattr(
        authoring_service,
        "_question_response",
        lambda _question, *_args, **_kwargs: {"id": _question.id},
    )

    allowed_result = MagicMock()
    allowed_result.first.return_value = SimpleNamespace(id=501)
    duplicate_result = MagicMock()
    duplicate_result.first.return_value = None

    db = MagicMock()
    db.execute.side_effect = [allowed_result, duplicate_result]
    db.get.return_value = question

    response = authoring_service.use_existing_question(
        db=db,
        slot_id=slot.id,
        question_id=question.id,
        user_id=44,
    )

    validation_sql = str(db.execute.call_args_list[0].args[0]).lower()
    assert "q.status = 'approved'" in validation_sql
    assert "source_set.status = 'approved'" in validation_sql
    assert "q.skill_id = :skill_id" in validation_sql
    assert "q.difficulty = :difficulty" in validation_sql
    assert "q.section_type = :section_type" in validation_sql
    assert "q.question_type = :question_type" in validation_sql
    assert response["slot"]["id"] == slot.id
    assert response["question"]["id"] == question.id
    assert slot.current_question_id == question.id
    assert slot.source_type == "question_bank"
    assert slot.status == "filled"
    db.commit.assert_called_once()


def test_previous_finalized_questions_must_match_question_type(monkeypatch):
    slot, question_set = _slot_and_set()
    monkeypatch.setattr(
        authoring_service,
        "_get_slot",
        lambda _db, _slot_id, _user_id: (slot, question_set),
    )

    query_result = MagicMock()
    query_result.mappings.return_value.all.return_value = []
    db = MagicMock()
    db.execute.return_value = query_result

    result = authoring_service.get_previous_questions(
        db=db,
        slot_id=slot.id,
        user_id=44,
    )

    sql = str(db.execute.call_args.args[0]).lower()
    params = db.execute.call_args.args[1]
    assert "q.question_type = :question_type" in sql
    assert params["question_type"] == "MCQ"
    assert result == []
