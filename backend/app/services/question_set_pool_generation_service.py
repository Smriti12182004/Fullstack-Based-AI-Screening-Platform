from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    JobSkill,
    Question,
    QuestionBank,
    QuestionSet,
    QuestionSetConfiguration,
    Section,
    QuestionVersion,
)
from app.services.llm_service import (
    LLMServiceError,
    generate_questions_from_skills,
)
from app.services.question_bank_service import get_or_create_question_bank
from app.services.question_service import MAX_GENERATED_QUESTIONS, _normalize_question_text
from app.services.skill_review_service import are_job_skills_confirmed


class QuestionSetPoolServiceError(Exception):
    """Base exception for question-set pool generation failures."""


VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_SECTION_TYPES = {"conceptual", "implementation", "free_text"}
MAX_GENERATION_ATTEMPTS = 3


def _load_question_set(
    db: Session,
    question_set_id: int,
) -> QuestionSet:
    question_set = db.get(QuestionSet, question_set_id)

    if question_set is None:
        raise QuestionSetPoolServiceError("Question set not found.")

    if question_set.hiring_year is None:
        raise QuestionSetPoolServiceError(
            "Question set hiring year is not configured."
        )

    return question_set


def _load_configuration(
    db: Session,
    question_set_id: int,
) -> QuestionSetConfiguration:
    configuration = (
        db.query(QuestionSetConfiguration)
        .filter(
            QuestionSetConfiguration.question_set_id == question_set_id
        )
        .first()
    )

    if configuration is None:
        raise QuestionSetPoolServiceError(
            "Assessment configuration not found."
        )

    return configuration


def _load_sections(
    db: Session,
    question_set_id: int,
) -> list[Section]:
    sections = (
        db.query(Section)
        .filter(Section.question_set_id == question_set_id)
        .order_by(Section.display_order)
        .all()
    )

    if not sections:
        raise QuestionSetPoolServiceError(
            "At least one section is required before generating the question pool."
        )

    return sections



def _aggregate_requirements(
    sections: list[Section],
) -> dict[tuple[str, int, str], dict[str, int]]:
    """Aggregate blueprint requirements by (section_type, skill_id, difficulty)."""

    requirements: dict[tuple[str, int, str], dict[str, int]] = {}

    for section in sections:
        section_type = str(section.section_type or "").strip().lower()

        if section_type not in VALID_SECTION_TYPES:
            raise QuestionSetPoolServiceError(
                f"Section '{section.name}' has invalid section type '{section.section_type}'."
            )

        if not section.section_skills:
            raise QuestionSetPoolServiceError(
                f"Section '{section.name}' does not contain any skill allocations."
            )

        for section_skill in section.section_skills:
            for difficulty in VALID_DIFFICULTIES:
                count = max(
                    int(getattr(section_skill, f"{difficulty}_count", 0) or 0),
                    0,
                )

                if count <= 0:
                    continue

                key = (
                    section_type,
                    section_skill.skill_id,
                    difficulty,
                )

                if key not in requirements:
                    requirements[key] = {
                        "questions_per_variant": 0,
                        "section_count": 0,
                    }

                requirements[key]["questions_per_variant"] += count
                requirements[key]["section_count"] += 1

    if not requirements:
        raise QuestionSetPoolServiceError(
            "No positive question allocations are configured for this question set."
        )

    return requirements

def _get_pool_questions(
    db: Session,
    question_set: QuestionSet,
    section_type: str,
    skill_id: int,
    difficulty: str,
) -> dict[str, list[Question]]:
    """
    Load year-aware question candidates for one skill/difficulty.

    Current-year questions are split into approved and pending review.
    Historical questions are approved-only. Legacy unbanked questions are
    approved-only and must belong to the same job through JobSkill.
    """

    current_approved = (
        db.query(Question)
        .join(QuestionBank, Question.question_bank_id == QuestionBank.id)
        .filter(
            QuestionBank.job_id == question_set.job_id,
            QuestionBank.hiring_year == question_set.hiring_year,
            Question.skill_id == skill_id,
            Question.section_type == section_type,
            Question.difficulty == difficulty,
            Question.status == "approved",
        )
        .order_by(Question.id.asc())
        .all()
    )

    current_pending = (
        db.query(Question)
        .join(QuestionBank, Question.question_bank_id == QuestionBank.id)
        .filter(
            QuestionBank.job_id == question_set.job_id,
            QuestionBank.hiring_year == question_set.hiring_year,
            Question.skill_id == skill_id,
            Question.section_type == section_type,
            Question.difficulty == difficulty,
            Question.status == "pending_review",
        )
        .order_by(Question.id.asc())
        .all()
    )

    historical_approved = (
        db.query(Question)
        .join(QuestionBank, Question.question_bank_id == QuestionBank.id)
        .filter(
            QuestionBank.job_id == question_set.job_id,
            QuestionBank.hiring_year < question_set.hiring_year,
            Question.skill_id == skill_id,
            Question.section_type == section_type,
            Question.difficulty == difficulty,
            Question.status == "approved",
        )
        .order_by(
            QuestionBank.hiring_year.desc(),
            Question.id.asc(),
        )
        .all()
    )

    legacy_approved = (
        db.query(Question)
        .join(JobSkill, JobSkill.skill_id == Question.skill_id)
        .filter(
            JobSkill.job_id == question_set.job_id,
            Question.question_bank_id.is_(None),
            Question.skill_id == skill_id,
            Question.section_type == section_type,
            Question.difficulty == difficulty,
            Question.status == "approved",
        )
        .order_by(Question.id.asc())
        .all()
    )

    return {
        "current_approved": current_approved,
        "current_pending": current_pending,
        "historical_approved": historical_approved,
        "legacy_approved": legacy_approved,
    }


def _unique_priority_questions(
    sources: list[list[Question]],
) -> tuple[list[Question], list[int]]:
    """
    Deduplicate questions by normalized text while respecting source priority.

    Returns the selected unique questions and per-source contribution counts.
    """

    seen_text_keys: set[str] = set()
    selected: list[Question] = []
    source_counts: list[int] = []

    for source_questions in sources:
        source_count = 0

        for question in source_questions:
            key = _normalize_question_text(question.question_text)

            if not key or key in seen_text_keys:
                continue

            seen_text_keys.add(key)
            selected.append(question)
            source_count += 1

        source_counts.append(source_count)

    return selected, source_counts


def _persist_generated_questions(
    db: Session,
    question_set: QuestionSet,
    question_bank: QuestionBank,
    section_type: str,
    skill_id: int,
    difficulty: str,
    number_to_generate: int,
    created_by: int | None,
    existing_questions: list[Question],
) -> list[Question]:
    """Generate only the missing pool questions and persist them as pending review."""

    if number_to_generate <= 0:
        return []

    skill_name = None

    for job_skill in (
        db.query(JobSkill)
        .filter(
            JobSkill.job_id == question_set.job_id,
            JobSkill.skill_id == skill_id,
        )
        .all()
    ):
        if job_skill.skill is not None:
            skill_name = job_skill.skill.name
            break

    if skill_name is None:
        raise QuestionSetPoolServiceError(
            "Configured section skill is not a confirmed skill for this job."
        )

    seen_text_keys = {
        _normalize_question_text(question.question_text)
        for question in existing_questions
        if question.question_text and question.question_text.strip()
    }

    generated_questions: list[Question] = []
    remaining = number_to_generate
    attempts = 0

    while remaining > 0 and attempts < MAX_GENERATION_ATTEMPTS:
        attempts += 1

        request_count = min(
            remaining,
            MAX_GENERATED_QUESTIONS,
        )

        try:
            generated_batch = generate_questions_from_skills(
                skills=[
                    {
                        "skill_id": skill_id,
                        "skill_name": skill_name,
                        "category": "Other",
                    }
                ],
                number_of_questions=request_count,
                difficulty=difficulty,
                section_type=section_type,
            )
        except LLMServiceError:
            raise
        except ValueError as exc:
            raise QuestionSetPoolServiceError(str(exc)) from exc

        batch_added = 0

        for generated in generated_batch:
            if remaining <= 0:
                break

            generated_skill_key = " ".join(
                generated.skill_name.strip().lower().split()
            )
            expected_skill_key = " ".join(
                skill_name.strip().lower().split()
            )

            if generated_skill_key != expected_skill_key:
                raise QuestionSetPoolServiceError(
                    "Generated question referenced a skill outside the configured blueprint."
                )

            generated_difficulty = generated.difficulty.strip().lower()

            if generated_difficulty != difficulty:
                raise QuestionSetPoolServiceError(
                    "Generated question difficulty does not match the configured blueprint."
                )

            generated_section_type = generated.section_type.strip().lower()
            if generated_section_type != section_type:
                raise QuestionSetPoolServiceError(
                    "Generated question section type does not match the configured blueprint."
                )

            generated_question_type = generated.question_type.strip().upper()
            expected_question_type = (
                "FREE_TEXT"
                if section_type == "free_text"
                else "MCQ"
            )

            if generated_question_type != expected_question_type:
                raise QuestionSetPoolServiceError(
                    "Generated question type does not match the configured section type."
                )

            if generated_question_type == "MCQ":
                if not generated.options or len(generated.options) < 2:
                    raise QuestionSetPoolServiceError(
                        "AI generated an MCQ without at least two options."
                    )

                if (
                    not generated.correct_answer
                    or generated.correct_answer not in generated.options
                ):
                    raise QuestionSetPoolServiceError(
                        "AI generated an MCQ with an invalid correct answer."
                    )
            else:
                if generated.options or generated.correct_answer:
                    raise QuestionSetPoolServiceError(
                        "Free-text questions cannot contain MCQ options or a correct answer."
                    )

            question_text = generated.question_text.strip()
            question_key = _normalize_question_text(question_text)

            if not question_key:
                continue

            if question_key in seen_text_keys:
                continue

            question = Question(
                question_text=question_text,
                question_type=generated_question_type,
                section_type=section_type,
                skill_id=skill_id,
                difficulty=difficulty,
                options=generated.options,
                correct_answer=generated.correct_answer,
                question_bank_id=question_bank.id,
                status="pending_review",
                source="ai_generated",
                explanation=generated.explanation,
                rejection_reason=None,
                created_by=created_by,
                reviewed_by=None,
                reviewed_at=None,
                version=1,
            )

            db.add(question)
            generated_questions.append(question)
            seen_text_keys.add(question_key)
            remaining -= 1
            batch_added += 1

        if batch_added == 0 and generated_batch:
            continue

        if not generated_batch:
            break

    if remaining > 0:
        raise QuestionSetPoolServiceError(
            f"AI generation could not produce {number_to_generate} unique "
            f"question(s) for skill {skill_id} at {difficulty} difficulty. "
            f"{number_to_generate - remaining} were generated."
        )

    return generated_questions


def generate_question_set_pool(
    db: Session,
    question_set_id: int,
    created_by: int | None,
) -> dict:
    """
    Build the question pool required to support every assessment variant.

    For each skill/difficulty requirement, the required pool is:

        questions_per_variant × variant_count

    Approved current-year questions are preferred, followed by approved
    historical questions and legacy approved questions. Existing current-year
    pending-review questions count toward planned pool coverage but are not
    assembly-ready until a reviewer approves them. AI generates only the
    remaining gap.
    """

    question_set = _load_question_set(
        db=db,
        question_set_id=question_set_id,
    )

    if not are_job_skills_confirmed(
        db,
        question_set.job_id,
    ):
        raise QuestionSetPoolServiceError(
            "Questions can only be generated after the job skills are confirmed."
        )

    configuration = _load_configuration(
        db=db,
        question_set_id=question_set_id,
    )

    sections = _load_sections(
        db=db,
        question_set_id=question_set_id,
    )

    requirements = _aggregate_requirements(sections)

    blueprint_total_per_variant = sum(
        requirement["questions_per_variant"]
        for requirement in requirements.values()
    )

    if blueprint_total_per_variant != configuration.total_questions:
        raise QuestionSetPoolServiceError(
            f"Question blueprint contains {blueprint_total_per_variant} "
            f"question(s) per variant, but configuration specifies "
            f"{configuration.total_questions}."
        )

    try:
        question_bank = get_or_create_question_bank(
            db=db,
            job_id=question_set.job_id,
            hiring_year=question_set.hiring_year,
            created_by=created_by,
        )
    except Exception as exc:
        if isinstance(exc, QuestionSetPoolServiceError):
            raise
        raise QuestionSetPoolServiceError(
            "Unable to resolve the annual question bank."
        ) from exc

    generated_questions: list[Question] = []
    requirement_results: list[dict] = []

    try:
        for (section_type, skill_id, difficulty), requirement in requirements.items():
            required_pool_questions = (
                requirement["questions_per_variant"]
                * question_set.variant_count
            )

            sources = _get_pool_questions(
                db=db,
                question_set=question_set,
                section_type=section_type,
                skill_id=skill_id,
                difficulty=difficulty,
            )

            approved_unique, approved_source_counts = _unique_priority_questions(
                [
                    sources["current_approved"],
                    sources["historical_approved"],
                    sources["legacy_approved"],
                ]
            )

            seen_approved_keys = {
                _normalize_question_text(question.question_text)
                for question in approved_unique
            }

            pending_unique: list[Question] = []
            pending_seen = set(seen_approved_keys)

            for question in sources["current_pending"]:
                key = _normalize_question_text(question.question_text)

                if not key or key in pending_seen:
                    continue

                pending_seen.add(key)
                pending_unique.append(question)

            projected_pool_count = (
                len(approved_unique)
                + len(pending_unique)
            )

            gap = max(
                required_pool_questions - projected_pool_count,
                0,
            )

            newly_generated = _persist_generated_questions(
                db=db,
                question_set=question_set,
                question_bank=question_bank,
                section_type=section_type,
                skill_id=skill_id,
                difficulty=difficulty,
                number_to_generate=gap,
                created_by=created_by,
                existing_questions=(
                    approved_unique
                    + pending_unique
                ),
            )

            generated_questions.extend(newly_generated)

            final_pending_count = len(pending_unique) + len(newly_generated)
            final_projected_pool = len(approved_unique) + final_pending_count

            requirement_results.append(
                {
                    "section_type": section_type,
                    "skill_id": skill_id,
                    "difficulty": difficulty,
                    "questions_per_variant": requirement["questions_per_variant"],
                    "variant_count": question_set.variant_count,
                    "required_pool_questions": required_pool_questions,
                    "current_year_approved": approved_source_counts[0],
                    "historical_approved": approved_source_counts[1],
                    "legacy_approved": approved_source_counts[2],
                    "approved_available": len(approved_unique),
                    "pending_review_current_year": final_pending_count,
                    "generated_count": len(newly_generated),
                    "projected_pool_count": final_projected_pool,
                    "remaining_gap": max(
                        required_pool_questions - final_projected_pool,
                        0,
                    ),
                    "assembly_ready": (
                        len(approved_unique) >= required_pool_questions
                    ),
                }
            )

        db.flush()

        for question in generated_questions:
            version = QuestionVersion(
                question_id=question.id,
                version=question.version,
                question_text=question.question_text,
                question_type=question.question_type,
                section_type=question.section_type,
                skill_id=question.skill_id,
                difficulty=question.difficulty,
                options=question.options,
                correct_answer=question.correct_answer,
                explanation=question.explanation,
                source=question.source,
                changed_by=created_by,
            )
            db.add(version)

        db.commit()

        for question in generated_questions:
            db.refresh(question)

    except QuestionSetPoolServiceError:
        db.rollback()
        raise
    except LLMServiceError:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise QuestionSetPoolServiceError(
            "Unable to persist the question-set pool."
        ) from exc

    total_required = sum(
        result["required_pool_questions"]
        for result in requirement_results
    )
    total_approved_available = sum(
        result["approved_available"]
        for result in requirement_results
    )
    total_pending_review = sum(
        result["pending_review_current_year"]
        for result in requirement_results
    )
    total_generated = len(generated_questions)
    total_remaining_gap = sum(
        result["remaining_gap"]
        for result in requirement_results
    )

    return {
        "question_set_id": question_set.id,
        "job_id": question_set.job_id,
        "hiring_year": question_set.hiring_year,
        "variant_count": question_set.variant_count,
        "total_questions_per_variant": configuration.total_questions,
        "total_required_pool_questions": total_required,
        "total_approved_available": total_approved_available,
        "total_pending_review": total_pending_review,
        "total_generated": total_generated,
        "total_remaining_gap": total_remaining_gap,
        "ready_for_assembly": all(
            result["approved_available"] >= result["required_pool_questions"]
            for result in requirement_results
        ),
        "requirements": requirement_results,
        "generated_questions": generated_questions,
    }
