from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session

from app.models import Question


DEFAULT_EMBEDDING_MODEL = "all-MiniLM-L6-v2"


class SemanticRetrievalError(Exception):
    """Base exception for semantic retrieval failures."""


@dataclass(frozen=True)
class SemanticSearchResult:
    """A question returned from semantic retrieval."""

    question: Question
    score: float


class SemanticRetrievalService:
    """
    Semantic retrieval over approved question-bank content.

    The service keeps the vector index in memory. PostgreSQL remains the
    source of truth for question records and metadata.
    """

    def __init__(
        self,
        model_name: str = DEFAULT_EMBEDDING_MODEL,
        model: SentenceTransformer | None = None,
    ) -> None:
        try:
            self.model = model or SentenceTransformer(model_name)
        except Exception as exc:
            raise SemanticRetrievalError(
                f"Unable to load embedding model '{model_name}'."
            ) from exc

        self.index: faiss.IndexFlatIP | None = None
        self.question_ids: list[int] = []
        self.embedding_dimension = (
             self.model.get_embedding_dimension()
        )

        if self.embedding_dimension is None:
            raise SemanticRetrievalError(
                "Embedding model did not provide an embedding dimension."
            )

    def build_index(
        self,
        questions: Iterable[Question],
    ) -> int:
        """
        Build a FAISS index from approved questions.

        Returns the number of indexed questions.
        """

        approved_questions = [
            question
            for question in questions
            if question.status == "approved"
        ]

        self.index = faiss.IndexFlatIP(
            self.embedding_dimension
        )
        self.question_ids = []

        if not approved_questions:
            return 0

        texts = [
            question.question_text.strip()
            for question in approved_questions
        ]

        if any(not text for text in texts):
            raise SemanticRetrievalError(
                "Approved questions cannot contain empty question text."
            )

        try:
            embeddings = self.model.encode(
                texts,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
        except Exception as exc:
            raise SemanticRetrievalError(
                "Unable to generate question embeddings."
            ) from exc

        embeddings = np.asarray(
            embeddings,
            dtype=np.float32,
        )

        if embeddings.ndim != 2:
            raise SemanticRetrievalError(
                "Embedding output must be a two-dimensional matrix."
            )

        if embeddings.shape[1] != self.embedding_dimension:
            raise SemanticRetrievalError(
                "Embedding dimension does not match the FAISS index."
            )

        self.index.add(embeddings)
        self.question_ids = [
            question.id
            for question in approved_questions
        ]

        return len(self.question_ids)

    def search(
        self,
        db: Session,
        query_text: str,
        top_k: int = 5,
        skill_id: int | None = None,
        question_type: str | None = None,
        difficulty: str | None = None,
    ) -> list[SemanticSearchResult]:
        """
        Retrieve semantically similar approved questions.

        Metadata filters are applied after similarity ranking.

        For the current MVP-sized question bank, all indexed vectors are
        searched so filtering cannot accidentally remove a valid matching
        result simply because it was outside a small pre-filter top-k set.
        """

        normalized_query = query_text.strip()

        if not normalized_query:
            raise SemanticRetrievalError(
                "Semantic search query cannot be empty."
            )

        if top_k <= 0:
            raise SemanticRetrievalError(
                "top_k must be greater than zero."
            )

        if question_type is not None:
            question_type = question_type.strip().upper()

            if question_type not in {"MCQ", "FREE_TEXT"}:
                raise SemanticRetrievalError(
                    "Question type must be MCQ or FREE_TEXT."
                )

        if difficulty is not None:
            difficulty = difficulty.strip().lower()

            if difficulty not in {
                "easy",
                "medium",
                "hard",
            }:
                raise SemanticRetrievalError(
                    "Difficulty must be easy, medium, or hard."
                )

        if self.index is None or self.index.ntotal == 0:
            return []

        try:
            query_embedding = self.model.encode(
                [normalized_query],
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
        except Exception as exc:
            raise SemanticRetrievalError(
                "Unable to generate the search-query embedding."
            ) from exc

        query_embedding = np.asarray(
            query_embedding,
            dtype=np.float32,
        )

        if query_embedding.shape != (
            1,
            self.embedding_dimension,
        ):
            raise SemanticRetrievalError(
                "Search-query embedding has an unexpected dimension."
            )

        # Search the entire current index so metadata filtering is exact
        # for the MVP-sized question bank.
        scores, positions = self.index.search(
            query_embedding,
            self.index.ntotal,
        )

        matched_question_ids = [
            self.question_ids[position]
            for position in positions[0]
            if position >= 0
        ]

        if not matched_question_ids:
            return []

        questions = (
            db.query(Question)
            .filter(
                Question.id.in_(matched_question_ids),
                Question.status == "approved",
            )
            .all()
        )

        question_by_id = {
            question.id: question
            for question in questions
        }

        results: list[SemanticSearchResult] = []

        for position, score in zip(
            positions[0],
            scores[0],
        ):
            if position < 0:
                continue

            question_id = self.question_ids[position]
            question = question_by_id.get(question_id)

            if question is None:
                continue

            if (
                skill_id is not None
                and question.skill_id != skill_id
            ):
                continue

            if (
                question_type is not None
                and question.question_type != question_type
            ):
                continue

            if (
                difficulty is not None
                and question.difficulty != difficulty
            ):
                continue

            results.append(
                SemanticSearchResult(
                    question=question,
                    score=float(score),
                )
            )

            if len(results) >= top_k:
                break

        return results

    def is_ready(self) -> bool:
        """Return whether the service currently has indexed questions."""

        return (
            self.index is not None
            and self.index.ntotal > 0
            and bool(self.question_ids)
        )

    def indexed_count(self) -> int:
        """Return the current number of indexed questions."""

        if self.index is None:
            return 0

        return self.index.ntotal