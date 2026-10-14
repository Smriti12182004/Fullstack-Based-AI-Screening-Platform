from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.db.session import get_db
from app.models import QuestionIdea


router = APIRouter(
    prefix="/question-ideas",
    tags=["Question Ideas"],
)


class QuestionIdeaCreate(BaseModel):
    question_text: str = Field(min_length=3, max_length=10000)
    topic: str | None = Field(default=None, max_length=200)
    skill_name: str | None = Field(default=None, max_length=200)
    question_type: Literal["MCQ", "FREE_TEXT"] = "FREE_TEXT"
    difficulty: Literal["easy", "medium", "hard"] | None = None
    expected_answer: str | None = Field(default=None, max_length=10000)
    notes: str | None = Field(default=None, max_length=10000)
    tags: list[str] = Field(default_factory=list, max_length=50)


class QuestionIdeaUpdate(BaseModel):
    question_text: str | None = Field(default=None, min_length=3, max_length=10000)
    topic: str | None = Field(default=None, max_length=200)
    skill_name: str | None = Field(default=None, max_length=200)
    question_type: Literal["MCQ", "FREE_TEXT"] | None = None
    difficulty: Literal["easy", "medium", "hard"] | None = None
    expected_answer: str | None = Field(default=None, max_length=10000)
    notes: str | None = Field(default=None, max_length=10000)
    tags: list[str] | None = Field(default=None, max_length=50)


class QuestionIdeaResponse(BaseModel):
    id: int
    question_text: str
    topic: str | None
    skill_name: str | None
    question_type: str
    difficulty: str | None
    expected_answer: str | None
    notes: str | None
    tags: list
    status: str
    created_by: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[QuestionIdeaResponse])
def list_question_ideas(
    search: str | None = Query(default=None, max_length=300),
    topic: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    query = db.query(QuestionIdea).filter(
        QuestionIdea.created_by == current_user["user_id"]
    )

    if topic and topic.strip():
        query = query.filter(
            QuestionIdea.topic.ilike(f"%{topic.strip()}%")
        )

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                QuestionIdea.question_text.ilike(term),
                QuestionIdea.topic.ilike(term),
                QuestionIdea.skill_name.ilike(term),
                QuestionIdea.notes.ilike(term),
            )
        )

    return query.order_by(
        QuestionIdea.updated_at.desc(),
        QuestionIdea.id.desc(),
    ).all()


@router.post(
    "",
    response_model=QuestionIdeaResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_question_idea(
    payload: QuestionIdeaCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    values = payload.model_dump()
    values["question_text"] = values["question_text"].strip()

    if len(values["question_text"]) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Question idea must contain at least 3 non-whitespace characters.",
        )

    values["tags"] = [
        tag.strip()[:100]
        for tag in values["tags"]
        if isinstance(tag, str) and tag.strip()
    ]

    idea = QuestionIdea(
        **values,
        created_by=current_user["user_id"],
        status="idea",
    )

    try:
        db.add(idea)
        db.commit()
        db.refresh(idea)
        return idea
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save question idea.",
        ) from exc


@router.patch("/{idea_id}", response_model=QuestionIdeaResponse)
def update_question_idea(
    idea_id: int,
    payload: QuestionIdeaUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    idea = (
        db.query(QuestionIdea)
        .filter(
            QuestionIdea.id == idea_id,
            QuestionIdea.created_by == current_user["user_id"],
            QuestionIdea.status == "idea",
        )
        .first()
    )

    if idea is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question idea not found or cannot be edited.",
        )

    values = payload.model_dump(exclude_unset=True)

    if "question_text" in values:
        question_text = values["question_text"]
        if question_text is None or len(question_text.strip()) < 3:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Question idea must contain at least 3 non-whitespace characters.",
            )
        values["question_text"] = question_text.strip()

    if "tags" in values and values["tags"] is not None:
        values["tags"] = [
            tag.strip()[:100]
            for tag in values["tags"]
            if isinstance(tag, str) and tag.strip()
        ]

    for field, value in values.items():
        setattr(idea, field, value)

    try:
        db.commit()
        db.refresh(idea)
        return idea
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update question idea.",
        ) from exc


@router.delete("/{idea_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question_idea(
    idea_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("assessment_manager")),
):
    idea = (
        db.query(QuestionIdea)
        .filter(
            QuestionIdea.id == idea_id,
            QuestionIdea.created_by == current_user["user_id"],
            QuestionIdea.status == "idea",
        )
        .first()
    )

    if idea is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question idea not found or cannot be deleted.",
        )

    try:
        db.delete(idea)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete question idea.",
        ) from exc
