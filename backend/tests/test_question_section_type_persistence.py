from app.models.question import Question
from app.models.question_version import QuestionVersion


def test_question_model_exposes_section_type():
    assert hasattr(Question, "section_type")


def test_question_version_model_exposes_section_type():
    assert hasattr(QuestionVersion, "section_type")
