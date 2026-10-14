from types import SimpleNamespace

import pytest

from app.services.question_set_configuration_service import (
    QuestionSetConfigurationServiceError,
    _aggregate_section_counts,
    _section_question_count,
)


def allocation(easy=0, medium=0, hard=0):
    return SimpleNamespace(
        easy_count=easy,
        medium_count=medium,
        hard_count=hard,
    )


def section(section_type="conceptual", skills=()):
    return SimpleNamespace(
        name="Test Section",
        section_type=section_type,
        section_skills=list(skills),
    )


def test_section_question_count_sums_all_difficulties_and_skills():
    value = _section_question_count(
        section(
            skills=[
                allocation(easy=2, medium=3, hard=1),
                allocation(easy=1, medium=0, hard=2),
            ]
        )
    )

    assert value == 9


def test_aggregate_counts_preserves_global_distribution():
    result = _aggregate_section_counts(
        [
            section(
                "conceptual",
                [allocation(easy=2, medium=1, hard=0)],
            ),
            section(
                "implementation",
                [allocation(easy=0, medium=2, hard=1)],
            ),
            section(
                "free_text",
                [allocation(easy=1, medium=0, hard=2)],
            ),
        ]
    )

    assert result == (9, 3, 3, 3)


def test_invalid_section_type_is_rejected():
    with pytest.raises(
        QuestionSetConfigurationServiceError,
        match="invalid section type",
    ):
        _aggregate_section_counts(
            [section("coding_only", [allocation(easy=1)])]
        )
