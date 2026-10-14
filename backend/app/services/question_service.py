from app.models.assessment_set import AssessmentSet
from app.models.question_slot import QuestionSlot
from sqlalchemy import and_, or_
import re
from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import (
    AssessmentSet,
    Job,
    JobAssessmentAccess,
    Question,
    QuestionBank,
    QuestionSet,
    QuestionSlot,
    QuestionVersion,
    Skill,
    User,
)

from app.services.notification_service import create_notification

from app.services.llm_service import (
    LLMServiceError,
    generate_questions_from_skills,
)

from app.services.question_bank_service import (
    get_or_create_question_bank,
)

from app.services.skill_review_service import (
    are_job_skills_confirmed,
    get_job_skills,
)


class QuestionServiceError(Exception):
    """Base exception for question-bank service failures."""


MAX_GENERATED_QUESTIONS = 20
VALID_SECTION_TYPES = {"conceptual", "implementation", "free_text"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_SECTION_TYPES = {"conceptual", "implementation", "free_text"}
VALID_QUESTION_TYPES = {"MCQ", "FREE_TEXT"}


def _expected_question_type(section_type: str) -> str:
    return "FREE_TEXT" if section_type == "free_text" else "MCQ"


def _normalize_question_text(question_text: str) -> str:
    """Normalize question text for reliable duplicate detection."""

    normalized = " ".join(
        question_text.strip().lower().split()
    )

    normalized = re.sub(
        r"[?.!]+$",
        "",
        normalized,
    )

    return normalized


def _get_existing_question_keys(
    db: Session,
    question_bank_id: int | None = None,
) -> set[str]:
    """
    Return normalized question-text keys already present.

    When an annual question bank is supplied, questions assigned to that
    bank are checked along with legacy questions that do not yet belong
    to any question bank.

    This preserves duplicate protection for existinghistorical records
    while allowing explicitly assigned questions to exist independently
    across different year-specific banks.
    """

    query = db.query(
        Question.question_text
    )

    if question_bank_id is not None:
        query = query.filter(
            or_(
                Question.question_bank_id == question_bank_id,
                Question.question_bank_id.is_(None),
            )
        )

    existing_questions = query.all()

    return {
        _normalize_question_text(question_text)
        for question_text, in existing_questions
        if question_text and question_text.strip()
    }


def _create_question_version(
    db: Session,
    question: Question,
    changed_by: int | None,
) -> QuestionVersion:
    """Persist the current question content as a version snapshot."""

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
        changed_by=changed_by,
    )

    db.add(version)

    return version


def _validate_question_bank(
    db: Session,
    question_bank_id: int,
) -> QuestionBank:
    """Return a question bank or raise a service error."""

    question_bank = db.get(
        QuestionBank,
        question_bank_id,
    )

    if question_bank is None:
        raise QuestionServiceError(
            "Question bank not found."
        )

    return question_bank


def create_question(
    db: Session,
    question_text: str,
    question_type: str,
    skill_id: int = 0,
    difficulty: str = "medium",
    options: list[str] | None = None,
    correct_answer: str | None = None,
    created_by: int | None = None,
    question_bank_id: int | None = None,
    section_type: str | None = None,
) -> Question:
    """
    Create and persist a question-bank record.

    Newly created questions enter the maker-checker workflow
    in pending_review status and receive version 1.
    """

    normalized_type = question_type.strip().upper()
    normalized_difficulty = difficulty.strip().lower()
    normalized_text = question_text.strip()

    if not normalized_text:
        raise QuestionServiceError(
            "Question text cannot be empty."
        )

    if normalized_type not in VALID_QUESTION_TYPES:
        raise QuestionServiceError(
            "Question type must be MCQ or FREE_TEXT."
        )

    if normalized_difficulty not in VALID_DIFFICULTIES:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    # Preserve the original question-service API for existing callers that
    # did not know about section_type. The semantic section is inferred from
    # the question type only when section_type was omitted. Explicit values
    # are still validated and cannot contradict the requested question type.
    if section_type is None:
        normalized_section_type = (
            "free_text"
            if normalized_type == "FREE_TEXT"
            else "conceptual"
        )
    else:
        normalized_section_type = section_type.strip().lower()

    if normalized_section_type not in VALID_SECTION_TYPES:
        raise QuestionServiceError(
            "Section type must be conceptual, implementation, or free_text."
        )

    # Resolve the skill before section-type compatibility validation so the
    # long-standing "Skill not found." contract remains stable for callers
    # that reference a missing skill.
    skill = db.get(
        Skill,
        skill_id,
    )

    if skill is None:
        raise QuestionServiceError(
            "Skill not found."
        )

    expected_type = _expected_question_type(normalized_section_type)
    if normalized_type != expected_type:
        raise QuestionServiceError(
            f"Section type '{normalized_section_type}' requires question type '{expected_type}'."
        )

    if question_bank_id is not None:
        _validate_question_bank(
            db,
            question_bank_id,
        )

    if normalized_type == "MCQ":
        if not options or len(options) < 2:
            raise QuestionServiceError(
                "MCQ questions must have at least two options."
            )

        if not correct_answer or correct_answer not in options:
            raise QuestionServiceError(
                "MCQ correct answer must match one of the options."
            )

    else:
        options = None
        correct_answer = None

    question = Question(
        question_text=normalized_text,
        question_type=normalized_type,
        section_type=normalized_section_type,
        skill_id=skill_id,
        difficulty=normalized_difficulty,
        options=options,
        correct_answer=correct_answer,
        question_bank_id=question_bank_id,
        status="pending_review",
        source="manual",
        explanation=None,
        rejection_reason=None,
        created_by=created_by,
        reviewed_by=None,
        reviewed_at=None,
        version=1,
    )

    try:
        db.add(question)
        db.flush()

        _create_question_version(
            db=db,
            question=question,
            changed_by=created_by,
        )

        db.commit()
        db.refresh(question)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to create question."
        ) from exc

    return question


def get_questions(
    db: Session,
    skill_id: int | None = None,
    question_type: str | None = None,
    section_type: str | None = None,
    difficulty: str | None = None,
    question_bank_id: int | None = None,
    library_only: bool = False,
) -> list[Question]:
    """Retrieve questions with optional filters."""

    query = db.query(
        Question
    )

    if library_only:
        # Questions from approved assessment sets are eligible through their
        # current question-slot link. Set-level approval is authoritative for
        # this inclusion path.
        approved_set_question_ids = (
            db.query(QuestionSlot.current_question_id)
            .join(
                AssessmentSet,
                AssessmentSet.id == QuestionSlot.assessment_set_id,
            )
            .filter(
                AssessmentSet.status == "approved",
                QuestionSlot.current_question_id.isnot(None),
            )
        )

        # Reusable bank questions must also be individually approved.
        # This keeps standalone approved questions outside the bank hidden.
        query = query.filter(
            or_(
                and_(
                    Question.question_bank_id.isnot(None),
                    Question.status == "approved",
                ),
                Question.id.in_(approved_set_question_ids),
            )
        )

    if question_bank_id is not None:
        query = query.filter(
            Question.question_bank_id == question_bank_id
        )

    if skill_id is not None:
        query = query.filter(
            Question.skill_id == skill_id
        )

    if question_type is not None:
        normalized_type = question_type.strip().upper()

        if normalized_type not in {
            "MCQ",
            "FREE_TEXT",
        }:
            raise QuestionServiceError(
                "Question type must be MCQ or FREE_TEXT."
            )

        query = query.filter(
            Question.question_type == normalized_type
        )

    if section_type is not None:
        normalized_section_type = section_type.strip().lower()

        if normalized_section_type not in VALID_SECTION_TYPES:
            raise QuestionServiceError(
                "Section type must be conceptual, implementation, or free_text."
            )

        query = query.filter(
            Question.section_type == normalized_section_type
        )

    if difficulty is not None:
        normalized_difficulty = difficulty.strip().lower()

        if normalized_difficulty not in VALID_DIFFICULTIES:
            raise QuestionServiceError(
                "Difficulty must be easy, medium, or hard."
            )

        query = query.filter(
            Question.difficulty == normalized_difficulty
        )

    if section_type is not None:
        normalized_section_type = section_type.strip().lower()

        if normalized_section_type not in VALID_SECTION_TYPES:
            raise QuestionServiceError(
                "Section type must be conceptual, implementation, or free_text."
            )

        query = query.filter(
            Question.section_type == normalized_section_type
        )

    return query.order_by(
        Question.id
    ).all()


def update_question(
    db: Session,
    question_id: int,
    question_text: str | None = None,
    question_type: str | None = None,
    section_type: str | None = None,
    skill_id: int | None = None,
    difficulty: str | None = None,
    options: list[str] | None = None,
    correct_answer: str | None = None,
    updated_by: int | None = None,
) -> Question:
    """
    Update an existing question.

    Every content update creates a new question version and
    returns the question to pending_review.
    """

    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionServiceError(
            "Question not found."
        )

    normalized_type = (
        question_type.strip().upper()
        if question_type is not None
        else question.question_type
    )

    normalized_difficulty = (
        difficulty.strip().lower()
        if difficulty is not None
        else question.difficulty
    )

    normalized_text = (
        question_text.strip()
        if question_text is not None
        else question.question_text
    )

    normalized_section_type = (
        section_type.strip().lower()
        if section_type is not None
        else question.section_type
    )

    final_skill_id = (
        skill_id
        if skill_id is not None
        else question.skill_id
    )

    if not normalized_text:
        raise QuestionServiceError(
            "Question text cannot be empty."
        )

    if normalized_section_type not in VALID_SECTION_TYPES:
        raise QuestionServiceError(
            "Section type must be conceptual, implementation, or free_text."
        )

    if normalized_type not in VALID_QUESTION_TYPES:
        raise QuestionServiceError(
            "Question type must be MCQ or FREE_TEXT."
        )

    if normalized_difficulty not in VALID_DIFFICULTIES:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    expected_type = _expected_question_type(normalized_section_type)
    if normalized_type != expected_type:
        raise QuestionServiceError(
            f"Section type '{normalized_section_type}' requires question type '{expected_type}'."
        )

    skill = db.get(
        Skill,
        final_skill_id,
    )

    if skill is None:
        raise QuestionServiceError(
            "Skill not found."
        )

    if normalized_type == "MCQ":
        if not options or len(options) < 2:
            raise QuestionServiceError(
                "MCQ questions must have at least two options."
            )

        if not correct_answer or correct_answer not in options:
            raise QuestionServiceError(
                "MCQ correct answer must match one of the options."
            )

    else:
        options = None
        correct_answer = None

    next_version = question.version + 1

    question.question_text = normalized_text
    question.question_type = normalized_type
    question.section_type = normalized_section_type
    question.skill_id = final_skill_id
    question.difficulty = normalized_difficulty
    question.options = options
    question.correct_answer = correct_answer

    # Any content edit requires a fresh review.
    question.status = "pending_review"
    question.reviewed_by = None
    question.reviewed_at = None
    question.rejection_reason = None

    question.version = next_version

    try:
        db.flush()

        _create_question_version(
            db=db,
            question=question,
            changed_by=updated_by,
        )

        db.commit()
        db.refresh(question)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to update question."
        ) from exc

    return question


def generate_questions(
    db: Session,
    job_id: int,
    skill_ids: list[int] | None,
    number_of_questions: int,
    difficulty: str,
    created_by: int | None = None,
    hiring_year: int | None = None,
    section_type: str = "conceptual",
    generation_mode: str | None = None,
    custom_topic: str | None = None,
) -> list[Question]:
    """
    Generate AI-created MCQs from the confirmed skills for a job.

    Generated questions are stored in the specified annual question bank.
    """

    job = db.get(
        Job,
        job_id,
    )

    if job is None:
        raise QuestionServiceError(
            "Job not found."
        )

    if not are_job_skills_confirmed(
        db,
        job_id,
    ):
        raise QuestionServiceError(
            "Questions can only be generated after the job skills are confirmed."
        )

    if not isinstance(number_of_questions, int):
        raise QuestionServiceError(
            "Number of questions must be an integer."
        )

    if (
        number_of_questions < 1
        or number_of_questions > MAX_GENERATED_QUESTIONS
    ):
        raise QuestionServiceError(
            f"Number of questions must be between "
            f"1 and {MAX_GENERATED_QUESTIONS}."
        )

    normalized_difficulty = difficulty.strip().lower()
    normalized_section_type = section_type.strip().lower()

    if normalized_section_type not in VALID_SECTION_TYPES:
        raise QuestionServiceError(
            "Section type must be conceptual, implementation, or free_text."
        )

    if normalized_difficulty not in VALID_DIFFICULTIES:
        raise QuestionServiceError(
            "Difficulty must be easy, medium, or hard."
        )

    confirmed_skills = get_job_skills(
        db,
        job_id,
    )

    if not confirmed_skills:
        raise QuestionServiceError(
            "No confirmed skills are available for this job."
        )

    confirmed_by_id = {
        skill.id: skill
        for skill in confirmed_skills
    }

    explicit_generation_mode = generation_mode is not None

    if generation_mode is None:
        # Preserve the behavior of callers that predate generation modes.
        normalized_generation_mode = (
            "job_description" if skill_ids is None else "selected_skills"
        )
    else:
        normalized_generation_mode = str(generation_mode).strip().lower()

    if normalized_generation_mode not in {
        "job_description", "selected_skills", "custom_topic"
    }:
        raise QuestionServiceError("Unsupported question generation mode.")

    normalized_custom_topic = (
        " ".join(str(custom_topic or "").strip().split())
    )

    if len(normalized_custom_topic) > 500:
        raise QuestionServiceError("Custom topic must be 500 characters or fewer.")

    if (
        normalized_generation_mode == "custom_topic"
        and not normalized_custom_topic
    ):
        raise QuestionServiceError(
            "Enter a custom skill or topic before generating questions."
        )

    if (
        normalized_generation_mode in {"selected_skills", "custom_topic"}
        and not skill_ids
    ):
        raise QuestionServiceError(
            "Select at least one confirmed job skill for this generation mode."
        )

    if (
        normalized_generation_mode == "job_description"
        or skill_ids is None
    ):
        selected_skills = confirmed_skills

    else:
        if not skill_ids:
            raise QuestionServiceError(
                "At least one confirmed skill must be selected."
            )

        selected_skills = []
        seen_ids: set[int] = set()

        for selected_skill_id in skill_ids:
            if selected_skill_id in seen_ids:
                continue

            skill = confirmed_by_id.get(
                selected_skill_id
            )

            if skill is None:
                raise QuestionServiceError(
                    "Selected skill is not part of the confirmed skills for this job."
                )

            seen_ids.add(
                selected_skill_id
            )

            selected_skills.append(
                skill
            )

    try:
        question_bank = get_or_create_question_bank(
            db=db,
            job_id=job_id,
            hiring_year=hiring_year,
            created_by=created_by,
        )

    except QuestionServiceError:
        raise

    except Exception as exc:
        raise QuestionServiceError(
            "Unable to resolve the annual question bank."
        ) from exc

    skill_context = [
        {
            "skill_id": skill.id,
            "skill_name": skill.name,
            "category": "Other",
        }
        for skill in selected_skills
    ]

    manager_prompt = None

    # Only explicitly selected new modes add mode-specific guidance.
    # Legacy service callers continue using the existing generation prompt.
    if explicit_generation_mode:
        if normalized_generation_mode == "job_description":
            description = " ".join(str(job.description or "").split())
            description_excerpt = description[:650]
            if len(description) > 650:
                description_excerpt = description_excerpt.rsplit(" ", 1)[0]

            manager_prompt = (
                "Use the selected job's description as primary context. "
                "Generate questions relevant to the role's responsibilities and "
                "requirements, while keeping every question mapped to the "
                "confirmed skill set for this job. Do not invent skill labels. "
                f"Job title: {job.title}. "
                f"Job description excerpt: {description_excerpt}"
            )

        elif normalized_generation_mode == "selected_skills":
            manager_prompt = (
                "Focus questions only on the selected confirmed job skills. "
                "Do not broaden questions into unrelated technologies or skills. "
                "Keep each generated question's skill label aligned with the "
                "selected skill context."
            )

        else:
            selected_skill_names = ", ".join(
                skill.name for skill in selected_skills
            )
            manager_prompt = (
                "The manager supplied this custom skill/topic as the main "
                "content focus: "
                f"{normalized_custom_topic}. "
                "Generate practical, unambiguous questions specifically about "
                "that topic. For database attribution, use only these selected "
                "existing job skills and do not invent a new skill label: "
                f"{selected_skill_names}. "
                "The custom topic controls question content; the selected job "
                "skills control the persisted skill association."
            )

    try:
        generated_questions = generate_questions_from_skills(
            skills=skill_context,
            number_of_questions=number_of_questions,
            difficulty=normalized_difficulty,
            section_type=normalized_section_type,
            **({"manager_prompt": manager_prompt} if manager_prompt else {}),
        )

    except LLMServiceError:
        raise

    except ValueError as exc:
        raise QuestionServiceError(
            str(exc)
        ) from exc

    skill_id_by_name = {
        " ".join(
            skill.name.strip().lower().split()
        ): skill.id
        for skill in selected_skills
    }

    existing_question_keys = _get_existing_question_keys(
        db=db,
        question_bank_id=question_bank.id,
    )

    questions: list[Question] = []
    batch_question_keys: set[str] = set()

    try:
        for generated in generated_questions:

            skill_key = " ".join(
                generated.skill_name.strip().lower().split()
            )

            generated_skill_id = skill_id_by_name.get(
                skill_key
            )

            if generated_skill_id is None:
                raise QuestionServiceError(
                    "Generated question referenced an unapproved skill."
                )

            generated_difficulty = generated.difficulty.strip().lower()
            generated_section_type = generated.section_type.strip().lower()
            generated_question_type = generated.question_type.strip().upper()

            if generated_difficulty != normalized_difficulty:
                raise QuestionServiceError(
                    "Generated question difficulty does not match the configured blueprint."
                )

            if generated_section_type != normalized_section_type:
                raise QuestionServiceError(
                    "Generated question section type does not match the configured blueprint."
                )

            expected_type = _expected_question_type(normalized_section_type)
            if generated_question_type != expected_type:
                raise QuestionServiceError(
                    "Generated question type does not match the configured section type."
                )

            if generated_question_type == "MCQ":
                if not generated.options or len(generated.options) < 2:
                    raise QuestionServiceError(
                        "AI generated an MCQ without at least two options."
                    )
                if (
                    not generated.correct_answer
                    or generated.correct_answer not in generated.options
                ):
                    raise QuestionServiceError(
                        "AI generated an MCQ with an invalid correct answer."
                    )
            else:
                if generated.options or generated.correct_answer:
                    raise QuestionServiceError(
                        "Free-text questions cannot contain MCQ options or a correct answer."
                    )

            question_key = _normalize_question_text(
                generated.question_text
            )

            if not question_key:
                raise QuestionServiceError(
                    "Generated question text cannot be empty."
                )

            if question_key in existing_question_keys:
                raise QuestionServiceError(
                    "Generated question duplicates an existing "
                    "question in the question bank."
                )

            if question_key in batch_question_keys:
                raise QuestionServiceError(
                    "Generated questions contain duplicate question text."
                )

            batch_question_keys.add(
                question_key
            )

            question = Question(
                question_text=generated.question_text.strip(),
                question_type=generated_question_type,
                section_type=normalized_section_type,
                skill_id=generated_skill_id,
                difficulty=normalized_difficulty,
                options=generated.options,
                correct_answer=generated.correct_answer,
                question_bank_id=question_bank.id,
                status="pending_review",
                source="ai_generated",
                explanation=generated.explanation,
                created_by=created_by,
                reviewed_by=None,
                reviewed_at=None,
                rejection_reason=None,
                version=1,
            )

            db.add(question)
            questions.append(question)

        db.flush()

        for question in questions:
            _create_question_version(
                db=db,
                question=question,
                changed_by=created_by,
            )

        db.commit()

        for question in questions:
            db.refresh(question)

    except QuestionServiceError:
        db.rollback()
        raise

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to persist generated questions."
        ) from exc

    return questions


def regenerate_ai_question(
    db: Session,
    question_id: int,
    updated_by: int,
) -> Question:
    """
    Regenerate one AI-created question without changing its blueprint context.

    The existing question id is retained, the skill and difficulty are locked,
    a new immutable QuestionVersion is created, and the question is returned
    to pending_review so the independent reviewer must review the new content.
    """

    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionServiceError(
            "Question not found."
        )

    if question.source != "ai_generated":
        raise QuestionServiceError(
            "Only AI-generated questions can be regenerated."
        )

    if question.status != "pending_review":
        raise QuestionServiceError(
            "Only questions pending review can be regenerated."
        )

    if question.question_bank_id is None:
        raise QuestionServiceError(
            "The question is not associated with an annual question bank."
        )

    question_bank = _validate_question_bank(
        db,
        question.question_bank_id,
    )

    if not are_job_skills_confirmed(
        db,
        question_bank.job_id,
    ):
        raise QuestionServiceError(
            "Questions can only be regenerated after the job skills are confirmed."
        )

    confirmed_skills = get_job_skills(
        db,
        question_bank.job_id,
    )

    skill = next(
        (
            candidate
            for candidate in confirmed_skills
            if candidate.id == question.skill_id
        ),
        None,
    )

    if skill is None:
        raise QuestionServiceError(
            "The question skill is not part of the confirmed job skills."
        )

    existing_question_keys = _get_existing_question_keys(
        db=db,
        question_bank_id=question.question_bank_id,
    )

    existing_question_texts = [
        text
        for (text,) in (
            db.query(Question.question_text)
            .filter(
                Question.question_bank_id == question.question_bank_id,
                Question.id != question.id,
            )
            .all()
        )
        if text and text.strip()
    ]

    existing_question_keys.discard(
        _normalize_question_text(question.question_text)
    )

    skill_context = [
        {
            "skill_id": skill.id,
            "skill_name": skill.name,
            "category": "Other",
        }
    ]

    normalized_difficulty = question.difficulty.strip().lower()
    normalized_section_type = question.section_type.strip().lower()

    if normalized_section_type not in VALID_SECTION_TYPES:
        raise QuestionServiceError(
            "Question has an invalid section type."
        )

    expected_question_type = _expected_question_type(normalized_section_type)
    if question.question_type != expected_question_type:
        raise QuestionServiceError(
            "Question type does not match its section type."
        )

    previous_text = question.question_text

    last_error = None

    for _ in range(5):
        try:
            # Generate several alternatives in one LLM call, then choose the
            # candidate that is most different from the previous question
            # and the existing annual bank. This prevents shallow paraphrases.
            generated_batch = generate_questions_from_skills(
                skills=skill_context,
                number_of_questions=4,
                difficulty=normalized_difficulty,
                section_type=question.section_type,
                excluded_question_texts=[
                    previous_text,
                    *existing_question_texts,
                ],
                regeneration_mode=True,
            )

        except LLMServiceError:
            raise

        except ValueError as exc:
            raise QuestionServiceError(
                str(exc)
            ) from exc

        if not generated_batch:
            last_error = "The AI returned no replacement question."
            continue

        # Pick the least-similar valid candidate so a replacement changes
        # the tested idea rather than only rewording the original.
        import difflib

        def similarity(left: str, right: str) -> float:
            left_tokens = set(_normalize_question_text(left).split())
            right_tokens = set(_normalize_question_text(right).split())
            if not left_tokens or not right_tokens:
                return 0.0
            jaccard = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
            sequence = difflib.SequenceMatcher(
                None,
                _normalize_question_text(left),
                _normalize_question_text(right),
            ).ratio()
            return max(jaccard, sequence)

        valid_candidates = []
        for generated in generated_batch:
            candidate_key = _normalize_question_text(
                generated.question_text
            )

            if not candidate_key:
                continue

            if candidate_key in existing_question_keys:
                continue

            if candidate_key == _normalize_question_text(previous_text):
                continue

            if generated.difficulty.strip().lower() != normalized_difficulty:
                continue

            if generated.section_type.strip().lower() != normalized_section_type:
                continue

            if generated.question_type.strip().upper() != expected_question_type:
                continue

            if expected_question_type == "MCQ":
                if not generated.options or len(generated.options) < 2:
                    continue
                if (
                    not generated.correct_answer
                    or generated.correct_answer not in generated.options
                ):
                    continue
            else:
                if generated.options or generated.correct_answer:
                    continue

            if (
                " ".join(generated.skill_name.strip().lower().split())
                != " ".join(skill.name.strip().lower().split())
            ):
                continue

            expected_question_type = (
                "FREE_TEXT"
                if question.section_type == "free_text"
                else "MCQ"
            )

            if expected_question_type == "MCQ":
                if not generated.options or len(generated.options) < 2:
                    continue

                if (
                    not generated.correct_answer
                    or generated.correct_answer not in generated.options
                ):
                    continue
            else:
                if generated.options or generated.correct_answer:
                    continue

            max_existing_similarity = max(
                [similarity(generated.question_text, previous_text)]
                + [
                    similarity(generated.question_text, existing_text)
                    for existing_text in existing_question_texts
                ]
                if existing_question_texts
                else [similarity(generated.question_text, previous_text)]
            )

            valid_candidates.append(
                (max_existing_similarity, generated)
            )

        if not valid_candidates:
            last_error = (
                "The AI did not return a sufficiently different valid replacement question."
            )
            continue

        valid_candidates.sort(key=lambda item: item[0])
        best_similarity, generated = valid_candidates[0]

        if best_similarity >= 0.58:
            last_error = (
                "The AI returned candidates that were too similar to the existing question set."
            )
            continue

        next_version = question.version + 1

        question.question_text = generated.question_text.strip()
        question.question_type = generated.question_type.strip().upper()
        question.section_type = normalized_section_type
        question.skill_id = skill.id
        question.difficulty = normalized_difficulty
        question.options = generated.options
        question.correct_answer = generated.correct_answer
        question.explanation = generated.explanation
        question.source = "ai_generated"
        question.status = "pending_review"
        question.reviewed_by = None
        question.reviewed_at = None
        question.rejection_reason = None
        question.version = next_version

        try:
            db.flush()

            _create_question_version(
                db=db,
                question=question,
                changed_by=updated_by,
            )

            db.commit()
            db.refresh(question)

        except SQLAlchemyError as exc:
            db.rollback()

            raise QuestionServiceError(
                "Unable to regenerate question."
            ) from exc

        return question

    raise QuestionServiceError(
        last_error
        or "Unable to generate a unique replacement question."
    )


def approve_question(
    db: Session,
    question_id: int,
    reviewer_id: int,
) -> Question:
    """Approve a question that is currently pending review."""

    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionServiceError(
            "Question not found."
        )

    if question.status != "pending_review":
        raise QuestionServiceError(
            "Only questions pending review can be approved."
        )

    if question.created_by == reviewer_id:
        raise QuestionServiceError(
            "The question creator cannot approve their own question."
        )

    question.status = "approved"
    question.reviewed_by = reviewer_id
    question.reviewed_at = datetime.now(timezone.utc)
    question.rejection_reason = None

    try:
        db.commit()
        db.refresh(question)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to approve question."
        ) from exc

    return question


def _get_question_assessment_contexts(
    db: Session,
    question_id: int,
) -> list[tuple[AssessmentSet, QuestionSet]]:
    """Return assessment-set contexts that currently reference a question."""
    rows = (
        db.query(AssessmentSet, QuestionSet)
        .join(QuestionSet, QuestionSet.id == AssessmentSet.question_set_id)
        .join(
            QuestionSlot,
            QuestionSlot.assessment_set_id == AssessmentSet.id,
        )
        .filter(
            QuestionSlot.current_question_id == question_id,
            AssessmentSet.status == "submitted_for_review",
        )
        .order_by(AssessmentSet.id.asc())
        .all()
    )
    return rows


def _notify_assessment_managers_of_question_rejection(
    db: Session,
    assessment_set: AssessmentSet,
    question_set: QuestionSet,
    question: Question,
    reviewer_id: int,
    rejection_reason: str,
) -> None:
    """Create one durable notification per manager assigned to the job."""
    manager_rows = (
        db.query(User.id)
        .join(
            JobAssessmentAccess,
            JobAssessmentAccess.user_id == User.id,
        )
        .filter(
            JobAssessmentAccess.job_id == question_set.job_id,
            User.role == "assessment_manager",
        )
        .order_by(
            JobAssessmentAccess.created_at.asc(),
            User.id.asc(),
        )
        .all()
    )

    for (manager_id,) in manager_rows:
        create_notification(
            db=db,
            user_id=int(manager_id),
            notification_type="ASSESSMENT_QUESTION_REJECTED",
            title="Assessment Question Rejected",
            message=(
                f"Question #{question.id} in Assessment Set "
                f"{assessment_set.label} for question set "
                f'"{question_set.name}" was rejected by the Assessment Reviewer. '
                f"Reason: {rejection_reason} The set has been returned for revision."
            ),
            entity_type="assessment_set",
            entity_id=assessment_set.id,
        )


def reject_question(
    db: Session,
    question_id: int,
    reviewer_id: int,
    rejection_reason: str,
) -> Question:
    """Reject a question and return any containing submitted set for revision."""

    question = db.get(
        Question,
        question_id,
    )

    if question is None:
        raise QuestionServiceError(
            "Question not found."
        )

    if question.status != "pending_review":
        raise QuestionServiceError(
            "Only questions pending review can be rejected."
        )

    if question.created_by == reviewer_id:
        raise QuestionServiceError(
            "The question creator cannot reject their own question."
        )

    normalized_reason = rejection_reason.strip()

    if not normalized_reason:
        raise QuestionServiceError(
            "Rejection reason is required."
        )

    contexts = _get_question_assessment_contexts(
        db,
        question.id,
    )

    now = datetime.now(timezone.utc)

    question.status = "rejected"
    question.reviewed_by = reviewer_id
    question.reviewed_at = now
    question.rejection_reason = normalized_reason

    for assessment_set, question_set in contexts:
        assessment_set.status = "rejected"
        assessment_set.reviewer_id = reviewer_id
        assessment_set.reviewed_at = now
        assessment_set.review_comment = (
            f"Question #{question.id} was rejected. "
            f"Reason: {normalized_reason}"
        )
        if not assessment_set.review_checklist:
            assessment_set.review_checklist = {}

        _notify_assessment_managers_of_question_rejection(
            db=db,
            assessment_set=assessment_set,
            question_set=question_set,
            question=question,
            reviewer_id=reviewer_id,
            rejection_reason=normalized_reason,
        )

    try:
        db.commit()
        db.refresh(question)

    except SQLAlchemyError as exc:
        db.rollback()

        raise QuestionServiceError(
            "Unable to reject question."
        ) from exc

    return question