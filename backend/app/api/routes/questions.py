from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status

from sqlalchemy.orm import Session

from app.core.dependencies import require_any_role, require_role
from app.db.session import get_db
from app.models import Job, Question, User
from app.schemas.question import (
    QuestionCreate,
    QuestionGenerationRequest,
    QuestionGenerationResponse,
    QuestionRejectRequest,
    QuestionResponse,
    QuestionUpdate,
)
from app.models.job_assessment_access import JobAssessmentAccess
from app.schemas.question_section import (
    QuestionSectionCreate,
    QuestionSectionResponse,
)
from app.services.llm_service import LLMServiceError
from app.services.question_service import (
    QuestionServiceError,
    approve_question,
    create_question,
    generate_questions,
    get_questions,
    reject_question,
    update_question,
)
from app.services.question_section_service import (
    QuestionSectionServiceError,
    add_question_to_section,
)
from app.services.semantic_retrieval_service import (
    SemanticRetrievalError,
    SemanticRetrievalService,
)


router = APIRouter(
    prefix="/questions",
    tags=["Questions"],
)


class SemanticQuestionSearchResult(BaseModel):
    """One semantically retrieved question with its similarity score."""

    question: QuestionResponse
    score: float


_semantic_retrieval_service: SemanticRetrievalService | None = None


def get_semantic_retrieval_service() -> SemanticRetrievalService:
    """
    Return the process-local semantic retrieval service.

    The embedding model is loaded lazily so importing the API router does not
    immediately load the Sentence Transformer model.
    """

    global _semantic_retrieval_service

    if _semantic_retrieval_service is None:
        _semantic_retrieval_service = SemanticRetrievalService()

    return _semantic_retrieval_service


@router.post(
    "",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_question_endpoint(
    question: QuestionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    try:
        return create_question(
            db=db,
            question_text=question.question_text,
            question_type=question.question_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            created_by=current_user["user_id"],
        )
    except QuestionServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post(
    "/generate",
    response_model=QuestionGenerationResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_questions_endpoint(
    request: QuestionGenerationRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    job = db.get(Job, request.job_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    access = (
    db.query(JobAssessmentAccess)
    .filter(
        JobAssessmentAccess.job_id == job.id,
        JobAssessmentAccess.user_id == current_user["user_id"],
    )
    .first()
)

    if (
        job.created_by != current_user["user_id"]
        and access is None
        ):
        raise HTTPException(

     status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not allowed to generate questions for this job.",
          )

    try:
        questions = generate_questions(
            db=db,
            job_id=request.job_id,
            skill_ids=request.skill_ids,
            number_of_questions=request.number_of_questions,
            difficulty=request.difficulty,
            created_by=current_user["user_id"],
        )
    except QuestionServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except LLMServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Question generation service is currently unavailable.",
        ) from exc

    return QuestionGenerationResponse(
        job_id=request.job_id,
        number_requested=request.number_of_questions,
        generated_count=len(questions),
        questions=questions,
    )


@router.post(
    "/sections/add",
    response_model=QuestionSectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_question_to_section_endpoint(
    data: QuestionSectionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    try:
        return add_question_to_section(
            db=db,
            question_id=data.question_id,
            section_id=data.section_id,
        )
    except QuestionSectionServiceError as exc:
        if str(exc) == "Section not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        if str(exc) == "Question not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=list[QuestionResponse],
)
def get_questions_endpoint(
    skill_id: int | None = None,
    question_type: str | None = None,
    difficulty: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "assessment_manager",
            "assessment_reviewer",
        )
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    try:
        return get_questions(
            db=db,
            skill_id=skill_id,
            question_type=question_type,
            difficulty=difficulty,
        )
    except QuestionServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.get(
    "/semantic-search",
    response_model=list[SemanticQuestionSearchResult],
)
def semantic_search_questions_endpoint(
    query: str = Query(
        ...,
        min_length=1,
        max_length=1000,
    ),
    top_k: int = Query(
        default=5,
        ge=1,
        le=50,
    ),
    skill_id: int | None = None,
    question_type: str | None = None,
    difficulty: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_any_role(
            "assessment_manager",
            "assessment_reviewer",
        )
    ),
):
    """
    Retrieve semantically relevant approved questions.

    PostgreSQL remains the source of truth. FAISS is rebuilt from the
    currently approved question set before each search so newly approved or
    rejected content is reflected immediately in this MVP implementation.
    """

    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    approved_questions = (
        db.query(Question)
        .filter(Question.status == "approved")
        .all()
    )

    retrieval_service = get_semantic_retrieval_service()

    try:
        retrieval_service.build_index(
            approved_questions
        )

        results = retrieval_service.search(
            db=db,
            query_text=query,
            top_k=top_k,
            skill_id=skill_id,
            question_type=question_type,
            difficulty=difficulty,
        )

    except SemanticRetrievalError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return [
        SemanticQuestionSearchResult(
            question=result.question,
            score=result.score,
        )
        for result in results
    ]


@router.put(
    "/{question_id}",
    response_model=QuestionResponse,
)
def update_question_endpoint(
    question_id: int,
    question: QuestionUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_manager")
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    try:
        return update_question(
            db=db,
            question_id=question_id,
            question_text=question.question_text,
            question_type=question.question_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            updated_by=current_user["user_id"],
        )
    except QuestionServiceError as exc:
        if str(exc) == "Question not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post(
    "/{question_id}/approve",
    response_model=QuestionResponse,
)
def approve_question_endpoint(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    try:
        return approve_question(
            db=db,
            question_id=question_id,
            reviewer_id=current_user["user_id"],
        )
    except QuestionServiceError as exc:
        if str(exc) == "Question not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post(
    "/{question_id}/reject",
    response_model=QuestionResponse,
)
def reject_question_endpoint(
    question_id: int,
    data: QuestionRejectRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("assessment_reviewer")
    ),
):
    user = db.get(User, current_user["user_id"])

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    try:
        return reject_question(
            db=db,
            question_id=question_id,
            reviewer_id=current_user["user_id"],
            rejection_reason=data.rejection_reason,
        )
    except QuestionServiceError as exc:
        if str(exc) == "Question not found.":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(exc),
            ) from exc

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc