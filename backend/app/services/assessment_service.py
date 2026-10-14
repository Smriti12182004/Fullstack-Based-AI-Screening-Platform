from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from app.models import (
    Assessment,
    AssessmentQuestion,
    AssessmentSet,
    JobSkill,
    Question,
    QuestionBank,
    QuestionSet,
    QuestionSetConfiguration,
    QuestionSlot,
    Section,
)
from app.services.assessment_rubric import rubric_for_question


class AssessmentServiceError(Exception):
    """Base exception for assessment service failures."""


def _normalize_question_text(question_text: str) -> str:
    """Normalize question text for duplicate protection during assembly."""
    return " ".join(
        question_text.strip().lower().split()
    )


def _get_next_variant_number(
    db: Session,
    question_set: QuestionSet,
) -> int:
    """

    Return the next available variant number for this question set.



    Variants start at 1 and continue up to question_set.variant_count.

    """
    rows = (
        db.query(Assessment.variant_number)
        .filter(
            Assessment.question_set_id == question_set.id
        )
        .all()
    )
    existing_variant_numbers = {
        row[0]
        for row in rows
        if row[0] is not None
    }
    max_variants = question_set.variant_count
    for variant_number in range(
        1,
        max_variants + 1,
    ):
        if variant_number not in existing_variant_numbers:
            return variant_number
    raise AssessmentServiceError(
        f"All {max_variants} assessment variants have already been "
        f"created for question set {question_set.id}."
    )


def _get_existing_variant_numbers(
    db: Session,
    question_set_id: int,
) -> set[int]:
    """Return all already-created variant numbers."""
    rows = (
        db.query(Assessment.variant_number)
        .filter(
            Assessment.question_set_id == question_set_id
        )
        .all()
    )
    return {
        row[0]
        for row in rows
        if row[0] is not None
    }


def _validate_variant_number(
    db: Session,
    question_set: QuestionSet,
    variant_number: int,
) -> None:
    """Validate an explicitly requested variant number."""
    if variant_number < 1:
        raise AssessmentServiceError(
            "Variant number must be at least 1."
        )
    if variant_number > question_set.variant_count:
        raise AssessmentServiceError(
            f"Variant number cannot exceed the configured "
            f"variant count of {question_set.variant_count}."
        )
    existing_assessment = (
        db.query(Assessment)
        .filter(
            Assessment.question_set_id == question_set.id,
            Assessment.variant_number == variant_number,
        )
        .first()
    )
    if existing_assessment is not None:
        raise AssessmentServiceError(
            f"Assessment Variant {variant_number} already exists "
            f"for this question set."
        )


def _get_used_question_ids(
    db: Session,
    question_set_id: int,
) -> set[int]:
    """

    Return all question IDs already used by assessments belonging

    to this question set.



    These questions cannot be reused in another variant.

    """
    rows = (
        db.query(AssessmentQuestion.question_id)
        .join(
            Assessment,
            AssessmentQuestion.assessment_id == Assessment.id,
        )
        .filter(
            Assessment.question_set_id == question_set_id,
        )
        .all()
    )
    return {
        question_id
        for (question_id,) in rows
        if question_id is not None
    }


def _load_question_set_configuration(
    db: Session,
    question_set_id: int,
) -> QuestionSetConfiguration:
    """Load the question-set configuration."""
    configuration = (
        db.query(QuestionSetConfiguration)
        .filter(
            QuestionSetConfiguration.question_set_id
            == question_set_id
        )
        .first()
    )
    if configuration is None:
        raise AssessmentServiceError(
            "Assessment configuration not found."
        )
    return configuration


def _load_sections(
    db: Session,
    question_set_id: int,
) -> list[Section]:
    """Load sections in display order."""
    sections = (
        db.query(Section)
        .filter(
            Section.question_set_id == question_set_id
        )
        .order_by(
            Section.display_order
        )
        .all()
    )
    if not sections:
        raise AssessmentServiceError(
            "At least one section is required before assembling the assessment."
        )
    return sections


def _load_question_candidates(
    db: Session,
    question_set: QuestionSet,
    skill_id: int,
    difficulty: str,
    reserved_question_ids: set[int],
) -> list[Question]:
    """

    Load approved question candidates in year-aware priority order.



    Priority:

    1. Questions from the current hiring-year bank for this job.

    2. Questions from earlier hiring-year banks for the same job,

       newest historical year first.

    3. Legacy approved questions that have no question bank, restricted

       to skills that belong to this job.



    Reserved questions are excluded so the same question cannot be

    consumed by another assessment variant in the same question set.

    """
    if question_set.hiring_year is None:
        raise AssessmentServiceError(
            "Question set hiring year is not configured."
        )
    # ---------------------------------------------------------
    # Current hiring year
    # ---------------------------------------------------------
    current_year_questions = (
        db.query(Question)
        .join(
            QuestionBank,
            Question.question_bank_id == QuestionBank.id,
        )
        .filter(
            QuestionBank.job_id == question_set.job_id,
            QuestionBank.hiring_year == question_set.hiring_year,
            Question.skill_id == skill_id,
            Question.difficulty == difficulty,
            Question.status == "approved",
        )
        .order_by(
            Question.id.asc()
        )
        .all()
    )
    # ---------------------------------------------------------
    # Historical hiring years
    # ---------------------------------------------------------
    historical_questions = (
        db.query(Question)
        .join(
            QuestionBank,
            Question.question_bank_id == QuestionBank.id,
        )
        .filter(
            QuestionBank.job_id == question_set.job_id,
            QuestionBank.hiring_year < question_set.hiring_year,
            Question.skill_id == skill_id,
            Question.difficulty == difficulty,
            Question.status == "approved",
        )
        .order_by(
            QuestionBank.hiring_year.desc(),
            Question.id.asc(),
        )
        .all()
    )
    # ---------------------------------------------------------
    # Legacy questions without an annual QuestionBank
    #
    # We restrict these to skills belonging to this job so that
    # an old unbanked question from another job is not reused.
    # ---------------------------------------------------------
    legacy_questions = (
        db.query(Question)
        .join(
            JobSkill,
            JobSkill.skill_id == Question.skill_id,
        )
        .filter(
            JobSkill.job_id == question_set.job_id,
            Question.question_bank_id.is_(None),
            Question.skill_id == skill_id,
            Question.difficulty == difficulty,
            Question.status == "approved",
        )
        .order_by(
            Question.id.asc()
        )
        .all()
    )
    ordered_candidates = (
        current_year_questions
        + historical_questions
        + legacy_questions
    )
    # ---------------------------------------------------------
    # Final duplicate protection
    # ---------------------------------------------------------
    candidates: list[Question] = []
    seen_ids: set[int] = set()
    seen_text_keys: set[str] = set()
    for question in ordered_candidates:
        if question.id in reserved_question_ids:
            continue
        if question.id in seen_ids:
            continue
        question_key = _normalize_question_text(
            question.question_text
        )
        if not question_key:
            continue
        # Prevent the same question text from appearing under
        # different question IDs across different years.
        if question_key in seen_text_keys:
            continue
        seen_ids.add(question.id)
        seen_text_keys.add(question_key)
        candidates.append(question)
    return candidates


def _select_questions_for_variant(
    db: Session,
    question_set: QuestionSet,
    sections: list[Section],
    reserved_question_ids: set[int],
) -> list[Question]:
    """

    Select questions for one assessment variant.



    Selection follows the section blueprint exactly while using:

    current-year approved questions first, then approved historical

    questions, then legacy approved questions.

    """
    selected_question_ids: set[int] = set()
    selected_question_text_keys: set[str] = set()
    selected_questions: list[Question] = []
    for section in sections:
        if not section.section_skills:
            raise AssessmentServiceError(
                f"Section '{section.name}' does not contain any "
                f"skill allocations."
            )
        for section_skill in section.section_skills:
            required_count = section_skill.question_count
            if required_count <= 0:
                continue
            difficulty = section.difficulty
            available_questions = _load_question_candidates(
                db=db,
                question_set=question_set,
                skill_id=section_skill.skill_id,
                difficulty=difficulty,
                reserved_question_ids=(
                    reserved_question_ids
                    | selected_question_ids
                ),
            )
            if len(available_questions) < required_count:
                raise AssessmentServiceError(
                    f"Section '{section.name}' requires "
                    f"{required_count} approved {difficulty} "
                    f"question(s) for skill {section_skill.skill_id}, "
                    f"but only {len(available_questions)} are available."
                )
            selected_for_requirement = available_questions[
                :required_count
            ]
            for question in selected_for_requirement:
                if question.id in selected_question_ids:
                    raise AssessmentServiceError(
                        "Duplicate question detected during assessment assembly."
                    )
                question_key = _normalize_question_text(
                    question.question_text
                )
                if question_key in selected_question_text_keys:
                    raise AssessmentServiceError(
                        "Duplicate question text detected during assessment assembly."
                    )
                selected_question_ids.add(
                    question.id
                )
                selected_question_text_keys.add(
                    question_key
                )
                selected_questions.append(
                    question
                )
    return selected_questions


def _build_assessment(
    question_set: QuestionSet,
    variant_number: int,
    title: str,
    selected_questions: list[Question],
    sections: list[Section] | None = None,
) -> Assessment:
    """Create an assessment with immutable question, section, and rubric snapshots."""
    assessment = Assessment(
        job_id=question_set.job_id,
        question_set_id=question_set.id,
        variant_number=variant_number,
        title=title,
        status="ready",
    )
    # Selection walks each section and its skill allocations in this same order.
    # Repeat each section for its configured number of questions to preserve the
    # section identity in the immutable candidate-facing snapshot.
    snapshot_sections: list[Section] = []
    if sections is not None:
        for section in sections:
            section_question_count = sum(
                max(0, int(section_skill.question_count or 0))
                for section_skill in section.section_skills
            )
            snapshot_sections.extend([section] * section_question_count)
        if len(snapshot_sections) != len(selected_questions):
            raise AssessmentServiceError(
                "Section question counts do not match the selected assessment question count."
            )
    for display_order, question in enumerate(selected_questions, start=1):
        section = (
            snapshot_sections[display_order - 1]
            if sections is not None
            else None
        )
        assessment_question = AssessmentQuestion(
            assessment=assessment,
            question_id=question.id,
            display_order=display_order,
            question_text=question.question_text,
            question_type=question.question_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            section_id=section.id if section is not None else None,
            section_name=section.name if section is not None else None,
            rubric=rubric_for_question(
                question.question_type,
                question.correct_answer,
                question.explanation,
            ),
        )
        assessment.assessment_questions.append(assessment_question)
    return assessment


def _load_approved_assessment_set(
    db: Session,
    assessment_set_id: int,
) -> tuple[AssessmentSet, QuestionSet]:
    """

    Load an AssessmentSet together with its parent QuestionSet.



    Only reviewer-approved AssessmentSets may be materialized into the

    candidate-facing Assessment lifecycle.

    """
    if assessment_set_id <= 0:
        raise AssessmentServiceError(
            "Assessment Set ID must be greater than zero."
        )
    assessment_set = db.get(
        AssessmentSet,
        assessment_set_id,
    )
    if assessment_set is None:
        raise AssessmentServiceError(
            "Assessment set not found."
        )
    question_set = db.get(
        QuestionSet,
        assessment_set.question_set_id,
    )
    if question_set is None:
        raise AssessmentServiceError(
            "Parent QuestionSet not found."
        )
    normalized_status = str(
        assessment_set.status or ""
    ).strip().lower()
    if normalized_status != "approved":
        raise AssessmentServiceError(
            "Only reviewer-approved assessment sets can be materialized."
        )
    return assessment_set, question_set


def _load_assessment_set_slots(
    db: Session,
    assessment_set_id: int,
) -> list[QuestionSlot]:
    """

    Load AssessmentSet slots in deterministic blueprint order.

    """
    slots = (
        db.query(QuestionSlot)
        .filter(
            QuestionSlot.assessment_set_id == assessment_set_id,
        )
        .order_by(
            QuestionSlot.section_id.asc(),
            QuestionSlot.skill_id.asc(),
            QuestionSlot.difficulty.asc(),
            QuestionSlot.slot_number.asc(),
        )
        .all()
    )
    if not slots:
        raise AssessmentServiceError(
            "Assessment set does not contain any question slots."
        )
    return slots


def _get_existing_assessment_for_set(
    db: Session,
    assessment_set: AssessmentSet,
) -> Assessment | None:
    """

    Return an existing candidate-facing Assessment for this exact

    QuestionSet variant, if one exists.

    """
    return (
        db.query(Assessment)
        .filter(
            Assessment.question_set_id == assessment_set.question_set_id,
            Assessment.variant_number == assessment_set.variant_number,
        )
        .first()
    )


def _format_assessment_set_title(
    question_set: QuestionSet,
    assessment_set: AssessmentSet,
) -> str:
    """

    Build the candidate-facing assessment title from the durable

    QuestionSet and AssessmentSet identity.

    """
    question_set_name = str(
        question_set.name or ""
    ).strip()
    label = str(
        assessment_set.label or ""
    ).strip()
    if not label:
        variant_number = assessment_set.variant_number
        label = (
            f"Set {variant_number}"
            if variant_number is not None
            else "Assessment Set"
        )
    elif not label.lower().startswith("set "):
        label = f"Set {label}"
    if question_set_name:
        return f"{question_set_name} — {label}"
    return label


def _validate_assessment_set_questions(
    db: Session,
    assessment_set: AssessmentSet,
    slots: list[QuestionSlot],
    configuration: QuestionSetConfiguration,
) -> list[Question]:
    """

    Validate and return the approved current questions from all slots.



    The returned list is already ordered for candidate delivery and is the

    source used to create immutable AssessmentQuestion snapshots.

    """
    total_slots = len(slots)
    configured_total = int(
        configuration.total_questions or 0
    )
    if configured_total <= 0:
        raise AssessmentServiceError(
            "Assessment configuration must contain a positive total question count."
        )
    if total_slots != configured_total:
        raise AssessmentServiceError(
            "Assessment set slot count does not match the configured "
            "assessment question count."
        )
    selected_questions: list[Question] = []
    seen_question_ids: set[int] = set()
    for slot in slots:
        if slot.current_question_id is None:
            raise AssessmentServiceError(
                f"Assessment set slot {slot.slot_number} is not filled."
            )
        question = db.get(
            Question,
            slot.current_question_id,
        )
        if question is None:
            raise AssessmentServiceError(
                f"Current question {slot.current_question_id} "
                f"for slot {slot.slot_number} was not found."
            )
        question_status = str(
            question.status or ""
        ).strip().lower()
        if question_status != "approved":
            raise AssessmentServiceError(
                f"Question {question.id} in slot {slot.slot_number} "
                "must be approved before the assessment can be published."
            )
        if question.id in seen_question_ids:
            raise AssessmentServiceError(
                f"Question {question.id} is assigned to more than one "
                "AssessmentSet slot."
            )
        slot_skill_id = (
            int(slot.skill_id)
            if slot.skill_id is not None
            else None
        )
        question_skill_id = (
            int(question.skill_id)
            if question.skill_id is not None
            else None
        )
        if (
            slot_skill_id is not None
            and question_skill_id != slot_skill_id
        ):
            raise AssessmentServiceError(
                f"Question {question.id} does not match the skill "
                f"configured for slot {slot.slot_number}."
            )
        slot_difficulty = str(
            slot.difficulty or ""
        ).strip().lower()
        question_difficulty = str(
            question.difficulty or ""
        ).strip().lower()
        if (
            slot_difficulty
            and question_difficulty != slot_difficulty
        ):
            raise AssessmentServiceError(
                f"Question {question.id} does not match the difficulty "
                f"configured for slot {slot.slot_number}."
            )
        preferred_type = str(
            slot.preferred_question_type or ""
        ).strip().upper()
        actual_type = str(
            question.question_type or ""
        ).strip().upper()
        if (
            preferred_type
            and actual_type
            and preferred_type != actual_type
        ):
            raise AssessmentServiceError(
                f"Question {question.id} does not match the question type "
                f"configured for slot {slot.slot_number}."
            )
        seen_question_ids.add(
            question.id
        )
        selected_questions.append(
            question
        )
    return selected_questions


def materialize_assessment_set(
    db: Session,
    assessment_set_id: int,
) -> Assessment:
    """Materialize an approved AssessmentSet into immutable candidate snapshots."""
    assessment_set, question_set = _load_approved_assessment_set(
        db=db,
        assessment_set_id=assessment_set_id,
    )
    existing_assessment = _get_existing_assessment_for_set(
        db=db,
        assessment_set=assessment_set,
    )
    if existing_assessment is not None:
        raise AssessmentServiceError(
            "An Assessment already exists for this Assessment Set variant."
        )
    configuration = _load_question_set_configuration(
        db=db,
        question_set_id=question_set.id,
    )
    slots = _load_assessment_set_slots(
        db=db,
        assessment_set_id=assessment_set.id,
    )
    approved_questions = _validate_assessment_set_questions(
        db=db,
        assessment_set=assessment_set,
        slots=slots,
        configuration=configuration,
    )
    if len(approved_questions) != len(slots):
        raise AssessmentServiceError(
            "Assessment slot and approved question counts do not match."
        )
    title = _format_assessment_set_title(
        question_set=question_set,
        assessment_set=assessment_set,
    )
    assessment = Assessment(
        job_id=question_set.job_id,
        question_set_id=question_set.id,
        variant_number=assessment_set.variant_number,
        title=title,
        status="ready",
        review_status="approved",
    )
    section_ids = {
        int(slot.section_id)
        for slot in slots
        if slot.section_id is not None
    }
    sections_by_id = {}
    if section_ids:
        section_rows = (
            db.query(Section)
            .filter(Section.id.in_(section_ids))
            .all()
        )
        sections_by_id = {int(section.id): section for section in section_rows}
    # _validate_assessment_set_questions iterates the same ordered slot list,
    # so the question at each position belongs to the slot at that position.
    for display_order, (question, slot) in enumerate(
        zip(approved_questions, slots),
        start=1,
    ):
        section_id = int(slot.section_id) if slot.section_id is not None else None
        section = sections_by_id.get(section_id) if section_id is not None else None
        assessment_question = AssessmentQuestion(
            assessment=assessment,
            question_id=question.id,
            display_order=display_order,
            question_text=question.question_text,
            question_type=question.question_type,
            skill_id=question.skill_id,
            difficulty=question.difficulty,
            options=question.options,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            section_id=section_id,
            section_name=section.name if section is not None else None,
            rubric=rubric_for_question(
                question.question_type,
                question.correct_answer,
                question.explanation,
            ),
        )
        assessment.assessment_questions.append(assessment_question)
    try:
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
    except SQLAlchemyError as exc:
        db.rollback()
        raise AssessmentServiceError(
            "Unable to materialize the approved assessment set."
        ) from exc
    return assessment


def assemble_assessment(
    db: Session,
    question_set_id: int,
    title: str,
    variant_number: int | None = None,
) -> Assessment:
    """

    Automatically assemble one assessment variant from a question set.







    Rules:

    - Question set must exist.

    - Assessment configuration must exist.

    - At least one section must exist.

    - Every section must contain at least one skill allocation.

    - Only approved questions can be selected.

    - Questions must match the section skill.

    - Questions must match the section difficulty.

    - Current-year questions are preferred.

    - Approved historical questions are used when current-year

      questions are insufficient.

    - Legacy approved questions without a bank remain eligible when

      they belong to the same job's skill.

    - Each section-skill allocation determines its question count.

    - A question cannot appear twice in the same assessment.

    - A question already used by another variant of the same

      question set cannot be reused.

    - The final number of questions must match the configuration.

    - Variant number must be between 1 and question_set.variant_count.

    - An existing variant cannot be assembled again.

    - The exact approved question content is snapshotted into

      AssessmentQuestion.

    """
    question_set = db.get(
        QuestionSet,
        question_set_id,
    )
    if question_set is None:
        raise AssessmentServiceError(
            "Question set not found."
        )
    if variant_number is None:
        variant_number = _get_next_variant_number(
            db=db,
            question_set=question_set,
        )
    else:
        _validate_variant_number(
            db=db,
            question_set=question_set,
            variant_number=variant_number,
        )
    configuration = _load_question_set_configuration(
        db=db,
        question_set_id=question_set_id,
    )
    sections = _load_sections(
        db=db,
        question_set_id=question_set_id,
    )
    normalized_title = title.strip()
    if not normalized_title:
        raise AssessmentServiceError(
            "Assessment title cannot be empty."
        )
    used_question_ids = _get_used_question_ids(
        db=db,
        question_set_id=question_set_id,
    )
    selected_questions = _select_questions_for_variant(
        db=db,
        question_set=question_set,
        sections=sections,
        reserved_question_ids=used_question_ids,
    )
    if len(selected_questions) != configuration.total_questions:
        raise AssessmentServiceError(
            "Assembled question count does not match the configured total."
        )
    try:
        assessment = _build_assessment(
            question_set=question_set,
            variant_number=variant_number,
            title=normalized_title,
            selected_questions=selected_questions,
            sections=sections,
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)
    except SQLAlchemyError as exc:
        db.rollback()
        raise AssessmentServiceError(
            "Unable to assemble assessment."
        ) from exc
    return assessment


def assemble_assessment_variants(
    db: Session,
    question_set_id: int,
    title: str,
) -> list[Assessment]:
    """

    Atomically assemble every missing assessment variant for a

    question set.



    The complete operation either succeeds for every missing variant

    or creates no new variant.



    Questions are never reused across variants.



    Selection priority:

    1. Current hiring-year approved questions.

    2. Earlier-year approved questions for the same job.

    3. Legacy approved questions without an annual bank.

    """
    question_set = db.get(
        QuestionSet,
        question_set_id,
    )
    if question_set is None:
        raise AssessmentServiceError(
            "Question set not found."
        )
    configuration = _load_question_set_configuration(
        db=db,
        question_set_id=question_set_id,
    )
    sections = _load_sections(
        db=db,
        question_set_id=question_set_id,
    )
    normalized_title = title.strip()
    if not normalized_title:
        raise AssessmentServiceError(
            "Assessment title cannot be empty."
        )
    existing_variant_numbers = _get_existing_variant_numbers(
        db=db,
        question_set_id=question_set_id,
    )
    missing_variant_numbers = [
        variant_number
        for variant_number in range(
            1,
            question_set.variant_count + 1,
        )
        if variant_number not in existing_variant_numbers
    ]
    if not missing_variant_numbers:
        raise AssessmentServiceError(
            f"All {question_set.variant_count} assessment variants "
            f"have already been created for question set "
            f"{question_set.id}."
        )
    # ---------------------------------------------------------
    # Pre-flight question selection.
    #
    # Nothing is persisted here.
    #
    # This ensures that an insufficient question pool does not
    # create Variant 1 and then fail while creating Variant 2.
    # ---------------------------------------------------------
    reserved_question_ids = _get_used_question_ids(
        db=db,
        question_set_id=question_set_id,
    )
    variant_selections: list[
        tuple[int, list[Question]]
    ] = []
    for variant_number in missing_variant_numbers:
        selected_questions = _select_questions_for_variant(
            db=db,
            question_set=question_set,
            sections=sections,
            reserved_question_ids=reserved_question_ids,
        )
        if len(selected_questions) != configuration.total_questions:
            raise AssessmentServiceError(
                "Assembled question count does not match "
                "the configured total."
            )
        selected_question_ids = {
            question.id
            for question in selected_questions
        }
        reserved_question_ids.update(
            selected_question_ids
        )
        variant_selections.append(
            (
                variant_number,
                selected_questions,
            )
        )
    # ---------------------------------------------------------
    # Persist every variant in one transaction.
    # ---------------------------------------------------------
    assessments: list[Assessment] = []
    try:
        for variant_number, selected_questions in variant_selections:
            variant_title = (
                f"{normalized_title} - Variant {variant_number}"
            )
            assessment = _build_assessment(
                question_set=question_set,
                variant_number=variant_number,
                title=variant_title,
                selected_questions=selected_questions,
                sections=sections,
            )
            db.add(assessment)
            assessments.append(assessment)
        db.commit()
        for assessment in assessments:
            db.refresh(assessment)
    except SQLAlchemyError as exc:
        db.rollback()
        raise AssessmentServiceError(
            "Unable to assemble assessment variants."
        ) from exc
    return assessments
