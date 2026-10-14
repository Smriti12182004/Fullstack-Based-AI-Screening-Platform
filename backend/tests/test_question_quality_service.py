"""Unit tests for the deterministic Question Quality pre-screen."""

from types import SimpleNamespace

import pytest

from app.services.question_quality_service import (
    evaluate_difficulty_heuristic,
    validate_question_quality,
)


class FakeDB:
    def __init__(self, section=None, allowed_skill=True):
        self.section = section
        self.allowed_skill = allowed_skill

    def get(self, model, object_id):
        return self.section

    def query(self, model):
        return FakeQuery(self.allowed_skill)


class FakeQuery:
    def __init__(self, allowed_skill):
        self.allowed_skill = allowed_skill

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        if not self.allowed_skill:
            return None
        return SimpleNamespace(skill_id=7, question_count=1)


def section(section_id=612, difficulty="easy"):
    return SimpleNamespace(id=section_id, difficulty=difficulty)


def test_easy_foundation_passes():
    db = FakeDB(section())
    report = validate_question_quality(
        db,
        question_text="Which Docker command lists running containers?",
        question_type="MCQ",
        skill_id=7,
        difficulty="easy",
        options=["docker ps", "docker images", "docker build", "docker pull"],
        correct_answer="docker ps",
        section_id=612,
        existing_questions=[],
    )

    assert report.passed
    assert report.difficulty is not None
    assert report.difficulty.suggested == "easy"


def test_easy_question_with_debugging_is_rejected_by_prescreen():
    evaluation = evaluate_difficulty_heuristic(
        "A production container intermittently fails. Debug the root cause and choose the best remediation.",
        "easy",
    )

    assert evaluation.obvious_mismatch
    assert evaluation.suggested in {"medium", "hard"}


def test_section_difficulty_mismatch_is_rejected():
    db = FakeDB(section(difficulty="medium"))
    report = validate_question_quality(
        db,
        question_text="Which Docker command lists running containers?",
        question_type="MCQ",
        skill_id=7,
        difficulty="easy",
        options=["docker ps", "docker images", "docker build", "docker pull"],
        correct_answer="docker ps",
        section_id=612,
        existing_questions=[],
    )

    assert not report.passed
    assert any("does not match the target section difficulty" in error for error in report.errors)


def test_exact_duplicate_is_rejected():
    db = FakeDB(section())
    existing = [
        SimpleNamespace(
            id=101,
            question_text="Which Docker command lists running containers?",
        )
    ]

    report = validate_question_quality(
        db,
        question_text=" Which Docker command lists running containers?! ",
        question_type="MCQ",
        skill_id=7,
        difficulty="easy",
        options=["docker ps", "docker images", "docker build", "docker pull"],
        correct_answer="docker ps",
        section_id=612,
        existing_questions=existing,
    )

    assert not report.passed
    assert report.exact_duplicate_question_id == 101


def test_mcq_requires_four_options():
    db = FakeDB(section())
    report = validate_question_quality(
        db,
        question_text="Which Docker command lists running containers?",
        question_type="MCQ",
        skill_id=7,
        difficulty="easy",
        options=["docker ps", "docker images"],
        correct_answer="docker ps",
        section_id=612,
        existing_questions=[],
    )

    assert not report.passed
    assert any("at least four" in error for error in report.errors)
