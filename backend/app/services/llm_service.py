import json
import re
from difflib import SequenceMatcher
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.services.llm_client import (
    GEMINI_QUESTION_TIMEOUT_SECONDS,
    GROQ_QUESTION_TIMEOUT_SECONDS,
    LLMConnectionError,
    LLMQuotaError,
    LLMResponseError,
    LLMServiceError,
    OLLAMA_QUESTION_BATCH_HARD_LIMIT,
    OLLAMA_QUESTION_TIMEOUT_SECONDS,
    QUESTION_BATCH_HARD_LIMIT,
    _call_gemini_chat,
    _call_groq_chat,
)
from app.services.manager_prompt_service import ManagerPromptInterpretation
from app.services.question_generation_planner import QuestionGenerationPlan


MAX_JD_LENGTH = 12000
MAX_SKILL_NAME_LENGTH = 100
MAX_EXPERIENCE_LENGTH = 100
MAX_ADDITIONAL_INSTRUCTIONS_LENGTH = 1000
MAX_MANAGER_PROMPT_LENGTH = 1200

MIN_GENERATED_WORDS = 50
MAX_GENERATED_WORDS = 2000

MAX_GENERATION_ATTEMPTS = 3
MAX_QUESTION_GENERATION_ATTEMPTS = 2


def _call_llm_chat(
    prompt: str,
    *,
    response_format: dict[str, object] | None = None,
    temperature: float = 0.4,
    timeout: float = GEMINI_QUESTION_TIMEOUT_SECONDS,
    reasoning_effort: Literal["none", "default", "low", "medium", "high"] = "medium",
    max_completion_tokens: int | None = None,
) -> str:
    """Dispatch through the shared REST LLM client.

    The generation service intentionally does not own a second Gemini SDK
    implementation. This keeps all question-generation calls on the tested REST
    path in ``app.services.llm_client``.
    """
    provider = str(getattr(settings, "llm_provider", "gemini") or "gemini").strip().lower()

    if provider == "gemini":
        return _call_gemini_chat(
            prompt,
            response_format=response_format,
            temperature=temperature,
            timeout=timeout,
            reasoning_effort=reasoning_effort,
            max_completion_tokens=max_completion_tokens,
        )

    if provider == "groq":
        return _call_groq_chat(
            prompt,
            response_format=response_format,
            temperature=temperature,
            timeout=timeout,
            reasoning_effort=reasoning_effort,
            max_completion_tokens=max_completion_tokens,
        )

    raise LLMResponseError(
        f"Unsupported LLM_PROVIDER '{provider}'. Use 'gemini' or 'groq'."
    )


SkillCategory = Literal[
    "Programming Language",
    "Framework",
    "Library",
    "Database",
    "Cloud",
    "DevOps",
    "Testing",
    "Development Tool",
    "Professional Skill",
    "Certification",
    "Other",
]


class ExtractedSkill(BaseModel):
    name: str
    category: SkillCategory


class SkillExtractionResponse(BaseModel):
    skills: list[ExtractedSkill]
    experience_required: str | None = None


SKILL_EXTRACTION_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "skills": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "Programming Language",
                            "Framework",
                            "Library",
                            "Database",
                            "Cloud",
                            "DevOps",
                            "Testing",
                            "Development Tool",
                            "Professional Skill",
                            "Certification",
                            "Other",
                        ],
                    },
                },
                "required": ["name", "category"],
            },
        },
        "experience_required": {"type": ["string", "null"]},
    },
    "required": ["skills", "experience_required"],
}


def prepare_jd_text(jd_text: str) -> str:
    """Prepare job description text for LLM processing."""
    if not jd_text:
        return ""

    prepared_text = " ".join(jd_text.strip().split())

    if len(prepared_text) > MAX_JD_LENGTH:
        raise ValueError(
            "Job description exceeds the maximum allowed length."
        )

    return prepared_text


def extract_skills_from_jd(
    jd_text: str,
) -> SkillExtractionResponse:
    """Extract structured skills and experience from a job description."""
    prepared_text = prepare_jd_text(jd_text)

    if not prepared_text:
        return SkillExtractionResponse(
            skills=[],
            experience_required=None,
        )

    prompt = f"""
Extract the skills and required experience explicitly supported by the job description.

Rules:

- Do not infer skills from the job title alone.
- Do not invent skills.
- Include relevant programming languages, frameworks, libraries,
  databases, cloud technologies, DevOps tools, testing tools,
  development tools, and professional skills.
- Do not include job titles, company names, responsibilities,
  salary, or education as skills.
- Do not include years of experience as a skill.
- Normalize obvious duplicate skill mentions.
- Return an empty skills list when no relevant skills are present.
- Every skill must have exactly one category.
- Extract the experience requirement only when it is explicitly
  stated or clearly specified in the job description.
- Zero years of experience is valid.
- Preserve valid zero-experience requirements such as:
  "0 years" or "Fresher".
- Preserve other experience requirements in a concise form such as:
  "0 years", "2-4 years", "3+ years", "5 years", or "Fresher".
- If no experience requirement is mentioned, return null.

Allowed categories:

Programming Language
Framework
Library
Database
Cloud
DevOps
Testing
Development Tool
Professional Skill
Certification
Other

Return ONLY valid JSON in this exact structure:

{{
    "skills": [
        {{
            "name": "python",
            "category": "Programming Language"
        }}
    ],
    "experience_required": "2-4 years"
}}

Job Description:

{prepared_text}
""".strip()

    raw_text = _call_llm_chat(
        prompt,
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "evalyn_skill_extraction",
                "strict": True,
                "schema": SKILL_EXTRACTION_JSON_SCHEMA,
            },
        },
        temperature=0.15,
        timeout=120,
        reasoning_effort="none",
        max_completion_tokens=600,
    )

    try:
        parsed_data = json.loads(raw_text)
        return SkillExtractionResponse.model_validate(parsed_data)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise LLMResponseError(
            "LLM returned an invalid structured skill response."
        ) from exc


def normalize_skill_name(skill_name: str) -> str:
    """Normalize a skill name for consistent storage."""
    return " ".join(skill_name.strip().lower().split())


def normalize_extracted_skills(
    extraction: SkillExtractionResponse,
) -> SkillExtractionResponse:
    """Normalize skill names and remove invalid or duplicate skills."""
    normalized_skills: list[ExtractedSkill] = []
    seen: set[str] = set()

    for skill in extraction.skills:
        normalized_name = normalize_skill_name(skill.name)

        if not normalized_name:
            continue

        if len(normalized_name) > MAX_SKILL_NAME_LENGTH:
            continue

        if normalized_name in seen:
            continue

        seen.add(normalized_name)

        normalized_skills.append(
            ExtractedSkill(
                name=normalized_name,
                category=skill.category,
            )
        )

    experience_required = extraction.experience_required

    if experience_required is not None:
        experience_required = " ".join(
            experience_required.strip().split()
        )

        if not experience_required:
            experience_required = None

        elif len(experience_required) > MAX_EXPERIENCE_LENGTH:
            experience_required = experience_required[
                :MAX_EXPERIENCE_LENGTH
            ]

    return SkillExtractionResponse(
        skills=normalized_skills,
        experience_required=experience_required,
    )


# ============================================================
# JOB DESCRIPTION GENERATION HELPERS
# ============================================================

def count_words(text: str) -> int:
    """Count words in generated text using a predictable word boundary."""
    return len(
        re.findall(
            r"\b[\w]+(?:[-'][\w]+)*\b",
            text,
        )
    )


def _bullet_lines(text: str) -> list[str]:
    """Return lines that are formatted as bullets or numbered bullets."""
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    return [
        line
        for line in lines
        if re.match(
            r"^(?:[-*•]|\d+[.)])\s+",
            line,
        )
    ]


def validate_generated_format(
    description: str,
    output_format: str,
) -> tuple[bool, str]:
    """Validate the requested output format."""
    lines = [
        line.strip()
        for line in description.splitlines()
        if line.strip()
    ]

    if not lines:
        return False, "The generated description is empty."

    bullet_lines = _bullet_lines(description)

    if output_format == "bullets":
        if len(bullet_lines) < 2:
            return (
                False,
                "The generated description does not contain enough bullet points.",
            )

    elif output_format == "mixed":
        if len(bullet_lines) < 1:
            return (
                False,
                "The generated description does not contain bullet points.",
            )

        non_bullet_lines = [
            line
            for line in lines
            if not re.match(
                r"^(?:[-*•]|\d+[.)])\s+",
                line,
            )
        ]

        if not non_bullet_lines:
            return (
                False,
                "Mixed format requires both prose and bullet points.",
            )

    elif output_format == "paragraphs":
        heavily_bulleted = (
            len(bullet_lines) > len(lines) / 2
        )

        if heavily_bulleted:
            return (
                False,
                "The generated description is too heavily formatted as bullets.",
            )

    return True, ""


def _call_llm_for_generation(prompt: str) -> str:
    """Send a plain-text generation request through the configured LLM provider."""
    return _call_llm_chat(
        prompt,
        temperature=0.4,
        timeout=120,
        reasoning_effort="none",
        max_completion_tokens=700,
    )


# ============================================================
# JOB DESCRIPTION GENERATION
# ============================================================

def generate_job_description(
    title: str,
    skills: list[str],
    experience_required: str,
    max_words: int = 300,
    output_format: Literal[
        "paragraphs",
        "bullets",
        "mixed",
    ] = "mixed",
    additional_instructions: str | None = None,
) -> str:
    """
    Generate a recruiter-ready job description using Groq.

    The generated output is validated for:
    - maximum word count
    - requested output format
    - required inputs
    - empty model responses
    """

    normalized_title = " ".join(
        title.strip().split()
    )

    if not normalized_title:
        raise ValueError(
            "Job title is required."
        )

    if len(normalized_title) > 255:
        raise ValueError(
            "Job title exceeds the maximum allowed length."
        )

    normalized_skills = [
        " ".join(skill.strip().split())
        for skill in skills
        if skill and skill.strip()
    ]

    if not normalized_skills:
        raise ValueError(
            "At least one skill is required to generate a job description."
        )

    if len(normalized_skills) > 50:
        raise ValueError(
            "A maximum of 50 skills can be provided."
        )

    for skill in normalized_skills:
        if len(skill) > MAX_SKILL_NAME_LENGTH:
            raise ValueError(
                "Each skill must be 100 characters or fewer."
            )

    normalized_experience = " ".join(
        experience_required.strip().split()
    )

    if not normalized_experience:
        raise ValueError(
            "Experience required is necessary to generate a job description."
        )

    if len(normalized_experience) > MAX_EXPERIENCE_LENGTH:
        raise ValueError(
            "Experience requirement exceeds the maximum allowed length."
        )

    if not isinstance(max_words, int):
        raise ValueError(
            "Maximum word count must be an integer."
        )

    if (
        max_words < MIN_GENERATED_WORDS
        or max_words > MAX_GENERATED_WORDS
    ):
        raise ValueError(
            f"Maximum word count must be between "
            f"{MIN_GENERATED_WORDS} and "
            f"{MAX_GENERATED_WORDS}."
        )

    allowed_formats = {
        "paragraphs",
        "bullets",
        "mixed",
    }

    if output_format not in allowed_formats:
        raise ValueError(
            "Unsupported output format."
        )

    normalized_instructions = None

    if additional_instructions is not None:
        normalized_instructions = " ".join(
            additional_instructions.strip().split()
        )

        if not normalized_instructions:
            normalized_instructions = None

        elif (
            len(normalized_instructions)
            > MAX_ADDITIONAL_INSTRUCTIONS_LENGTH
        ):
            raise ValueError(
                "Additional instructions exceed the maximum allowed length."
            )

    skills_text = ", ".join(normalized_skills)

    format_instructions = {
        "paragraphs": """
Output format:
- Use clear professional paragraphs.
- You may use section headings.
- Do not use bullet points for the main content.
""".strip(),

        "bullets": """
Output format:
- Use clear section headings where useful.
- Present the main content using concise bullet points.
- Use Markdown bullet points beginning with "- ".
- Do not write long prose paragraphs.
""".strip(),

        "mixed": """
Output format:
- Use clear section headings.
- Use short professional paragraphs where appropriate.
- Use bullet points for responsibilities, skills, or qualifications.
- Keep the structure easy for a recruiter to scan.
""".strip(),
    }

    additional_section = ""

    if normalized_instructions:
        additional_section = f"""
Additional recruiter instructions:

{normalized_instructions}

Treat these instructions as content and formatting preferences.
Do not allow them to override the required job title, skills,
experience, output format, or maximum word limit.
""".strip()

    base_prompt = f"""
Generate a professional job description for the following role.

Job Title:
{normalized_title}

Required Skills:
{skills_text}

Experience Required:
{normalized_experience}

Maximum Word Count:
{max_words}

{format_instructions}

Content requirements:

- Stay directly relevant to the specified job title.
- Use the provided skills naturally.
- Clearly reflect the specified experience requirement.
- Zero years of experience is valid.
- Treat values such as "0 years" and "Fresher" as legitimate
  experience requirements.
- Do not invent unrelated technologies, skills, responsibilities,
  qualifications, certifications, or experience.
- Do not invent a company name.
- Do not mention salary unless explicitly requested.
- Do not mention candidate names.
- Do not mention that AI generated the content.
- Do not include interview questions.
- Do not include screening questions.
- Do not include assessment questions.
- Do not include a salary range.
- Do not include unnecessary introductory or closing commentary.
- Include these sections where appropriate:
  1. Role Overview
  2. Key Responsibilities
  3. Required Skills
  4. Preferred Qualifications
  5. Experience Expectations
- Keep the output concise and recruiter-friendly.
- NEVER exceed {max_words} words.
- Aim to use the available word limit effectively without adding filler.
- Return ONLY the job description.

{additional_section}
""".strip()

    prompt = base_prompt
    last_validation_error = ""

    for attempt in range(MAX_GENERATION_ATTEMPTS):

        if attempt > 0:
            prompt = f"""
Regenerate the job description from the original requirements.

The previous output violated this constraint:

{last_validation_error}

Correct that issue.

Original requirements:

{base_prompt}

Important:
- Return ONLY the corrected job description.
- NEVER exceed {max_words} words.
- Preserve the requested output format.
- Preserve the specified experience requirement, including
  valid zero-experience requirements such as "0 years" or "Fresher".
""".strip()

        description = _call_llm_for_generation(prompt)

        word_count = count_words(description)

        if word_count > max_words:
            last_validation_error = (
                f"The generated description contains {word_count} words, "
                f"but the maximum allowed is {max_words} words."
            )

            continue

        if word_count == 0:
            last_validation_error = (
                "The generated description contains no words."
            )

            continue

        valid_format, format_error = validate_generated_format(
            description,
            output_format,
        )

        if not valid_format:
            last_validation_error = format_error
            continue

        if len(description) > MAX_JD_LENGTH:
            raise LLMResponseError(
                "Generated job description exceeds the maximum allowed length."
            )

        return description

    raise LLMResponseError(
        "Unable to generate a job description that satisfies "
        f"the requested {max_words}-word limit and "
        f"{output_format} format. "
        f"Last validation issue: {last_validation_error}"
    )

# ============================================================
# AI QUESTION GENERATION
# ============================================================

MAX_GENERATED_QUESTIONS = 20
MIN_GENERATED_QUESTIONS = 1
MAX_QUESTION_TEXT_LENGTH = 4000
MAX_OPTION_LENGTH = 500
MAX_EXPLANATION_LENGTH = 2000

QUESTION_GENERATION_JSON_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "questions": {
            "type": "array",
            "minItems": 1,
            "maxItems": QUESTION_BATCH_HARD_LIMIT,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "question_text": {"type": "string"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "correct_answer": {"type": ["string", "null"]},
                    "explanation": {"type": ["string", "null"]},
                },
                "required": ["question_text", "options", "correct_answer", "explanation"],
            },
        },
    },
    "required": ["questions"],
}


QUESTION_AUTHORING_SYSTEM_PROMPT = 'QUESTION AUTHORING SYSTEM — EVALYN\n\nROLE\nYou are Evalyn\'s assessment-question author. Create clear, memorable assessment\nquestions that test a real technical idea through a believable problem.\n\nCORE STYLE\nThink like a strong coding-platform problem author. Start with a simple\nsituation, introduce a meaningful constraint, symptom, goal, or trade-off, and\nmake the candidate solve the technical problem created by that situation.\n\nUse this chain:\nSIMPLE STORY / CONTEXT\n→ MEANINGFUL CONSTRAINT OR SYMPTOM\n→ TECHNICAL PROBLEM\n→ DECISION / REASONING\n→ ANSWER\n\nThe story is there to CREATE the problem, not decorate a generic technical\nquestion.\n\nPROBLEM-STORY STYLE\nThe story may be:\n- a real software/product situation,\n- an operational situation,\n- a familiar business or everyday setting,\n- a resource/capacity problem,\n- or another simple real-world setup.\n\nThe setting depends on the skill. Do NOT force every question into a\ncorporate "company/team/developer" template.\n\nA good problem-story has the feel of algorithmic assessment problems such as:\na character with a resource constraint, a delivery/capacity problem, a shop\nhandling a rush, or another simple situation where the constraint naturally\ncreates the question.\n\nDo not copy any existing problem. Recreate the underlying style with original\ncontent.\n\nBAD:\n"A fruit vendor wants a smaller package to reduce shipping cost. Which Docker\ntechnique should they use?"\n\nThe fruit story is unrelated to Docker.\n\nALSO BAD:\n"A company wants to improve efficiency. Which Docker option is best?"\n\nThis has no meaningful situation or constraint.\n\nBETTER:\n"A fruit-and-vegetable shop runs its inventory API in a Docker container.\nDuring the evening order rush, the container consumes most of the available CPU\nand the order service slows down. Which Docker control should the team use to\nlimit CPU consumption?"\n\nThe domain creates a real software situation and the symptom creates the\ntechnical decision.\n\nMANAGER EXAMPLES\nWhen the manager gives an example such as "fruits and vegetables", use it as\nproblem context when it naturally fits.\n\nIt may represent:\ninventory, orders, deliveries, stock, quantities, capacity, workloads, or\nanother meaningful constraint.\n\nDo not mechanically repeat the exact same shop story in every question.\nDo not force the example into unrelated technical details.\nDo not turn it into a physical analogy for a technical concept.\n\nEFFICIENCY / PERFORMANCE\nWhen the manager asks for efficiency, make efficiency part of the actual\nproblem.\n\nUse a concrete objective such as:\nminimize time, CPU, memory, latency, bandwidth, disk usage, build time,\ndeployment time, query work, cost, or maximize throughput.\n\nThe candidate\'s answer should affect that objective.\n\nDo not satisfy the request by merely writing "efficient", "optimized", or\n"faster".\n\nINTERESTING BUT EASY\nMake questions interesting through a concrete constraint, trade-off, symptom,\nor goal—not through complicated wording.\n\nFor easy questions:\n- one main technical concept,\n- one meaningful problem constraint,\n- a direct decision,\n- familiar mechanisms,\n- minimal unnecessary data.\n\nDIVERSITY\nDifferent questions must test materially different underlying problems.\nChanging names, numbers, actors, wording, or option order is not diversity.\n\nVary the:\ntechnical mechanism, resource, failure mode, objective, constraint,\ntrade-off, or decision.\n\nQUESTION PLAN\nThe supplied question plan is authoritative for this candidate.\nImplement its pattern, problem target, knowledge target, scenario/context,\nefficiency focus, cognitive operation, storyline, and uniqueness anchor.\n\nDo not replace the plan with a generic question about the skill.\nDo not mix details from different plans.\n\nMCQ QUALITY\nUse exactly four plausible alternatives.\nAll four options must address the same technical decision and be comparable in\nspecificity, structure and length.\n\nAvoid:\n- None of the above\n- obvious opposite-word distractors\n- unrelated technologies\n- obviously silly options\n- options that solve a different problem\n- one very detailed option among three vague options\n- making the correct option longer or more specific than the distractors\n- using visual wording, option length, or grammar as a clue to the answer\n\nThe four options must genuinely compete on the SAME decision. Before returning the\nMCQ, solve the technical problem independently. Identify the symptom, constraint\nor goal in the stem, determine which option actually resolves it, and then set\ncorrect_answer to that option. Do not choose an answer merely because it is a\ngenerally useful technical practice.\n\nAsk whether a candidate who does not know the concept could guess the answer by\neliminating obviously wrong choices or choosing the longest/most detailed option.\nIf yes, rewrite the options.\n\nThere must be one clearly defensible correct answer.\n\nLANGUAGE\nUse concise, natural professional English.\nPrefer concrete nouns and verbs over generic corporate language.\nAvoid repetitive templates such as "What is the main purpose of..." when a\npractical decision can test the concept better.\n\nFINAL SELF-CHECK\nBefore returning JSON, silently verify:\n1. The story creates the technical problem.\n2. The technical problem matches the question plan.\n3. The manager example is used naturally when relevant.\n4. Efficiency is a real constraint/objective when requested.\n5. The question is understandable on first read.\n6. The options are plausible alternatives to the same decision.\n7. The question is materially different from other accepted questions.\n\nReturn only the requested JSON.'


VALID_SECTION_TYPES = {"conceptual", "implementation", "free_text"}
VALID_QUESTION_TYPES = {"MCQ", "FREE_TEXT"}


class GeneratedQuestion(BaseModel):
    """Structured question candidate returned by the LLM."""

    question_text: str
    skill_name: str | None = None
    difficulty: Literal["easy", "medium", "hard"]
    section_type: Literal["conceptual", "implementation", "free_text"] = "conceptual"
    question_type: Literal["MCQ", "FREE_TEXT"] = "MCQ"
    options: list[str] = Field(default_factory=list)
    correct_answer: str | None = None
    explanation: str | None = None


class GeneratedQuestionResponse(BaseModel):
    """Collection of generated question candidates."""

    questions: list[GeneratedQuestion]


class QuestionGenerationRequestContext(BaseModel):
    """Validated skill context supplied to the question-generation prompt."""

    skill_id: int
    skill_name: str | None = None
    category: str


def _extract_json_payload(raw_text: str) -> object:
    """Parse the assistant JSON returned by Groq without hiding malformed output."""
    if not isinstance(raw_text, str):
        raise ValueError("LLM question-generation response was not text.")

    cleaned = raw_text.strip()
    if not cleaned:
        raise ValueError("LLM returned an empty question-generation response.")

    # Preferred path: Ollama structured output returns pure JSON.
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Gracefully handle accidental markdown fences.
    if cleaned.startswith("```"):
        fenced = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        fenced = re.sub(r"\s*```$", "", fenced)
        try:
            return json.loads(fenced.strip())
        except json.JSONDecodeError:
            pass

    # Last tolerant path: locate the outermost JSON object and repair the harmless
    # harmless trailing-comma mistakes.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        candidate = cleaned[start : end + 1]
        candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
        return json.loads(candidate)

    raise ValueError("LLM did not return a JSON object.")


def _normalize_generation_skill_name(skill_name: str) -> str:
    """Normalize a generation skill name for deterministic matching."""
    return " ".join(skill_name.strip().lower().split())


def _normalize_section_type(section_type: str) -> str:
    """Normalize and validate the semantic section type."""

    if not isinstance(section_type, str):
        raise ValueError(
            "Section type must be a string."
        )

    normalized = section_type.strip().lower()

    if normalized not in VALID_SECTION_TYPES:
        raise ValueError(
            "Section type must be conceptual, implementation, or free_text."
        )

    return normalized


def _expected_question_type_for_section(
    section_type: str,
    requested_question_type: str | None = None,
) -> str:
    """Return the requested question type, with a section-based fallback."""
    if requested_question_type:
        normalized = requested_question_type.strip().upper()
        if normalized not in VALID_QUESTION_TYPES:
            raise ValueError("Question type must be MCQ or FREE_TEXT.")
        return normalized
    if section_type == "free_text":
        return "FREE_TEXT"
    return "MCQ"


def _section_type_generation_guidance(section_type: str, question_type: str = "MCQ") -> str:
    """Return semantic guidance while respecting the selected response format."""
    if section_type == "conceptual":
        if question_type == "FREE_TEXT":
            return (
                "Test a foundational concept, principle, definition, comparison or reasoning task "
                "through a concise open-response prompt. Avoid code-heavy implementation work."
            )
        return (
            "Test concepts, principles, definitions with application, behavior, comparisons, "
            "or reasoning. Avoid trivial memorization and avoid code-heavy implementation tasks."
        )
    if section_type == "implementation":
        if question_type == "FREE_TEXT":
            return (
                "Test practical execution or application through code writing, code correction, "
                "SQL, debugging, API/configuration reasoning, output prediction explanation, "
                "or implementation decisions. Require the candidate to explain or produce a solution."
            )
        return (
            "Test practical execution or application. Use concise code snippets, SQL, configuration, "
            "commands, debugging scenarios, output prediction, API usage, or implementation choices."
        )
    if question_type == "FREE_TEXT":
        return (
            "Assess explanation, design, debugging, justification, or solution writing in open response. "
            "The answer must be evaluable with explicit rubric/key-point guidance."
        )
    return (
        "Assess evaluation and applied reasoning with scenario-based MCQs. Use strong distractors "
        "that expose misconceptions and distinguish levels of understanding."
    )


def _difficulty_generation_guidance(difficulty: str) -> str:
    """Return difficulty guidance independent of semantic section type."""
    return {
        "easy": (
            "Use one clear fundamental target. The candidate should need straightforward "
            "reasoning or a direct practical application, not multiple interacting edge cases."
        ),
        "medium": (
            "Require application of the concept through a short scenario, debugging task, "
            "code/output reasoning, comparison, or constrained implementation decision."
        ),
        "hard": (
            "Require multi-step reasoning, edge cases, failure analysis, performance implications, "
            "architecture/design trade-offs, or subtle code behavior. Avoid obscure trivia."
        ),
    }[difficulty]


def _normalize_question_text_for_storage(value: str | None) -> str:
    """Normalize prose while preserving Markdown, code fences and indentation.

    Older LLM outputs sometimes flatten Markdown headings and example labels into
    one paragraph. This repairs those known labels without collapsing whitespace
    inside code blocks, where indentation and newlines can change program behavior.
    """
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""

    # Put opening and closing fences on separate lines when older model output
    # placed them inline with prose/code (e.g. "prompt ```python print(1) ```").
    text = re.sub(r"(?<!\n)```", "\n```", text)
    text = re.sub(
        r"```([A-Za-z0-9_+#.-]+)[ \t]+(?=\S)",
        r"```\1\n",
        text,
    )

    def clean_heading(match: re.Match[str]) -> str:
        label = re.sub(r"\s+", " ", match.group(2)).strip()
        return f"{match.group(1).rstrip()}\n\n### {label}\n"

    def normalize_prose(part: str) -> str:
        part = re.sub(
            r"(^|[ \t])#{1,6}[ \t]*(Problem Statement|Problem|Your Task|Function Signature|Example[ \t]+\d+|Examples|Constraints|Code Snippet|Given Code|Input Format|Output Format|Notes?)[ \t]*:?[ \t]*",
            clean_heading,
            part,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        part = re.sub(
            r"(^|[ \t]+)(Example[ \t]+\d+|Constraints|Problem Statement|Function Signature|Code Snippet|Given Code|Input Format|Output Format|Notes?)[ \t]*:[ \t]*",
            clean_heading,
            part,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        part = re.sub(
            r"(?<!\S)(Input|Output|Explanation)[ \t]*:[ \t]*",
            lambda match: f"\n{match.group(1).title()}: ",
            part,
            flags=re.IGNORECASE,
        )
        # Separate flattened constraint bullets without destroying negative signs.
        part = re.sub(
            r"(?<=[.!?\]])[ \t]+-[ \t]+(?=(?:-?\d+\s*(?:<=|>=|==|<|>|!=)|[A-Z]))",
            r"\n- ",
            part,
        )
        return part

    parts = re.split(r"(```[\s\S]*?```)", text)
    for index in range(0, len(parts), 2):
        parts[index] = normalize_prose(parts[index])

    text = "".join(parts)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _has_fenced_code_snippet(question_text: str | None) -> bool:
    """Return true when question text contains a non-empty fenced code block."""
    text = str(question_text or "")
    return bool(re.search(r"(?ms)^\s*```[A-Za-z0-9_+#.-]+\s*\n.+?^\s*```\s*$", text))


def _code_generation_requirements(
    focus: str,
    manager_prompt: str | None,
    variation_instruction: str | None,
) -> tuple[bool, bool, str]:
    """Determine whether the current request explicitly requires a code snippet."""
    guidance = " ".join(str(part or "") for part in (manager_prompt, variation_instruction)).casefold()
    output_phrases = (
        "generate output-prediction questions",
        "generate output prediction questions",
        "create output-prediction questions",
        "create output prediction questions",
        "only output-prediction questions",
        "only output prediction questions",
        "predict the output",
        "predict output",
        "what is the output",
        "what will this print",
        "what does this return",
        "focus on output prediction",
        "focus on output-prediction",
    )
    code_phrases = (
        "code snippet", "code snippets", "coding question", "coding questions",
        "code-based", "code based", "snippet-based", "snippet based",
        "read the code", "trace the code",
    )
    output_required = focus == "output" or any(phrase in guidance for phrase in output_phrases)
    code_required = (
        focus in {"code", "output", "debugging"}
        or output_required
        or any(phrase in guidance for phrase in code_phrases)
    )

    if output_required:
        instructions = """
OUTPUT-PREDICTION QUESTION — REQUIRED FORMAT
- Include a complete, relevant, multi-line code snippet in question_text inside a Markdown fenced code block.
- Use a language tag matching the selected skill, e.g. ```python, ```javascript, ```typescript, ```java, ```cpp, ```csharp, ```go, ```ruby, ```php, or ```sql.
- Preserve syntax, indentation, blank lines, variable names and operators; never flatten code into prose.
- Explicitly ask the candidate to determine the exact output, printed value, return value or resulting query rows, and explain why.
- Do not reveal the answer in question_text. For MCQ, provide answer choices in options and put the correct choice only in correct_answer. For FREE_TEXT, use options=[] and correct_answer=null; keep evaluation guidance in the separate explanation field.
- For SQL, include the relevant schema and sample rows, then ask for the query result.
- Make the snippet self-contained so the answer can be determined without guessing.
""".strip()
    elif code_required:
        instructions = """
CODE-BASED QUESTION — REQUIRED FORMAT
- Include relevant code in question_text inside a Markdown fenced code block with the correct language tag.
- Use a LeetCode-inspired structure where appropriate: a clear problem statement, code or function signature, Examples with separate Input / Output / Explanation labels, and Constraints as a separate list.
- Preserve multi-line code, indentation, syntax and line breaks; never flatten code into prose.
- For debugging, include the faulty or incomplete snippet and ask for the root cause or best fix. For implementation tasks, state expected behavior and meaningful constraints.
- If this question asks the candidate to predict output, include the actual code snippet and ask for the exact result; never ask a prediction question without code.
- Do not include the solution in question_text.
""".strip()
    else:
        instructions = """
FORMATTING
- Use short paragraphs and Markdown headings when they improve readability.
- If the question contains code, SQL, commands, configuration or a function signature, use a language-labelled fenced code block and preserve indentation.
- Do not flatten examples, inputs, outputs or constraints into one paragraph.
""".strip()

    return code_required, output_required, instructions



_NON_TECHNICAL_TECHNICAL_LEAKAGE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("greedy-choice property", r"\bgreedy(?:\s+choice)?\s+propert(?:y|ies)\b"),
    ("greedy algorithm", r"\bgreedy\s+algorithm\b"),
    ("algorithmic design", r"\balgorithmic\s+design\b"),
    ("computer-science algorithm", r"\b(?:algorithm|algorithms|permutation|permutations|memoization|recursion|recursive|graph traversal|binary tree|dynamic programming|time complexity|space complexity)\b"),
    ("programming implementation", r"\b(?:syntax errors?|memory leaks?|compiler|programming language|source code|code snippet|software debugging)\b"),
    ("algorithm deployment or hardware sizing", r"\b(?:deploy(?:ing|ment)?\s+(?:the\s+)?algorithm|hardware limits required to deploy|algorithm in production)\b"),
)


def find_non_technical_domain_leakage(
    value: str | None,
    *,
    job_title: str | None = None,
    job_description: str | None = None,
) -> list[str]:
    """Return clear computer-science topics that are out of place in a non-technical skill assessment.

    The check is deliberately narrow: terms such as customer, product, system, root cause,
    or problem-solving are not blocked on their own. A non-technical skill can still belong
    to a role in a technology company; only strong CS/programming indicators are rejected.
    """
    text = " ".join(str(value or "").casefold().split())
    if not text:
        return []

    matches: list[str] = []
    for label, pattern in _NON_TECHNICAL_TECHNICAL_LEAKAGE_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE) and label not in matches:
            matches.append(label)

    # For a Sales Executive role, generic "problem-solving" questions are not enough:
    # the question stem must visibly apply the skill to sales/customer work.
    normalized_title = " ".join(str(job_title or "").casefold().split())
    if re.search(r"\b(?:sales|business development)\b", normalized_title):
        sales_context_terms = (
            "customer", "client", "prospect", "lead", "sales", "product", "service",
            "negotiation", "objection", "purchase", "deal", "pitch", "quota", "target",
            "revenue", "pipeline", "follow-up", "follow up", "buyer", "closing",
            "conversion", "customer need", "customer requirement", "sales executive",
        )
        if not any(term in text for term in sales_context_terms):
            matches.append("missing sales-role context")

    return list(dict.fromkeys(matches))


def _role_domain_generation_guidance(
    *,
    skill_category: str,
    skill_name: str,
    job_title: str | None,
    job_description: str | None,
) -> str:
    """Build explicit role-domain guidance for the question authoring model."""
    category = str(skill_category or "technical").strip().lower()
    title = " ".join(str(job_title or "").strip().split())[:255] or "not provided"
    description = " ".join(str(job_description or "").strip().split())[:3500] or "not provided"
    normalized_skill = " ".join(str(skill_name or "").strip().split()) or "not provided"

    if category != "non_technical":
        return f"""
ROLE / JOB CONTEXT
- Job title: {title}
- Confirmed skill: {normalized_skill}
- Skill category: technical
- Job description context: {description}
- Keep the question grounded in this job's stated scope as well as the selected technical skill.
- Do not invent requirements or technologies that the job description does not support.
""".strip()

    return f"""
ROLE / JOB CONTEXT — HARD DOMAIN BOUNDARY
- Job title: {title}
- Confirmed skill: {normalized_skill}
- Skill category: non_technical / professional skill
- Job description context: {description}

NON-TECHNICAL AUTHORING RULES — MUST FOLLOW
- Interpret the selected skill in the occupational context of the job title and job description.
- Assess work tasks, professional judgement, communication, customer handling, prioritization,
  persuasion, coordination, lead qualification, negotiation, or other responsibilities only
  where they fit the selected skill and supplied job description.
- A broad skill such as "problem-solving" means solving realistic problems faced in this job,
  not a generic computer-science puzzle.
- For a Sales Executive role, use sales/customer scenarios such as understanding a customer's
  needs, qualifying and prioritizing leads, responding to objections, follow-up, negotiation,
  presenting value, and working toward targets when relevant to the JD.
- Never substitute algorithms, greedy-choice properties, recursion, permutations, memoization,
  graph traversal, programming syntax, memory leaks, compiler behaviour, code snippets, or
  algorithm deployment for a professional-skill question unless the supplied job description
  explicitly makes that subject part of the role.
- For an easy conceptual question, ask about a genuine concept used in the role (for example,
  lead qualification or consultative selling for a sales job). Keep it direct and foundational.
- For applied/scenario patterns, use realistic job situations and professionally defensible
  choices; do not turn the assessment into a coding or computer-science test.
- Existing/reference questions may guide style only. Ignore their content if it is from a different
  occupational domain or conflicts with the supplied job title and JD.
- Stay faithful to the supplied job title, description and selected skill. Do not infer tools,
  responsibilities, or specialist knowledge that the source does not support.
""".strip()


_NON_TECHNICAL_QUESTION_AUTHORING_SYSTEM_PROMPT = """
QUESTION AUTHORING SYSTEM — EVALYN

ROLE
You write assessment questions for the specific job title, job description, selected skill,
section, difficulty, and response format provided in the request.

CORE RULE
The job domain is a hard constraint. A broad transferable skill must be assessed in the
actual occupational context, not defaulted to computer science or software engineering.

FOR A NON-TECHNICAL / PROFESSIONAL SKILL
- Write about the practical responsibilities and decisions described by the job title and JD.
- For a Sales Executive, suitable domains include prospects, lead qualification, customer needs,
  product benefits, sales conversations, objection handling, negotiation, follow-up, and targets
  where those subjects fit the JD.
- A skill such as problem-solving means solving a realistic problem in that role.
- Do not generate computer-science riddles, algorithms, greedy-choice properties, recursion,
  permutations, memoization, graph traversal, programming syntax, memory leaks, compiler issues,
  code snippets, SQL, or algorithm deployment unless the JD explicitly requires that subject.
- Do not import technical content from old/reference questions when it conflicts with the job domain.
- For easy conceptual questions, ask one direct, foundational, role-relevant concept question.
  For applied/scenario questions, describe a concrete workplace situation and ask for the best
  professional response or decision.
- Use plain professional language that a candidate for the stated role would understand.
- Do not invent products, regulations, tools, policies, responsibilities, or qualifications
  not supported by the supplied JD.

QUALITY
- The stem must test the selected skill, not merely mention its name.
- Options must be plausible and comparable, with exactly one defensible correct answer for MCQs.
- Distractors should reflect believable professional mistakes, not technical trivia.
- The explanation must justify the correct response using the situation and role context.
- Stay within the requested section, difficulty, and question type.
- Return only the requested JSON.
""".strip()


def _role_appropriate_authoring_system_prompt(skill_category: str) -> str:
    """Select technical or non-technical authoring policy without mixing conflicting rules."""
    if str(skill_category or "").strip().lower() == "non_technical":
        return _NON_TECHNICAL_QUESTION_AUTHORING_SYSTEM_PROMPT
    return QUESTION_AUTHORING_SYSTEM_PROMPT

def _validate_generated_question(
    question: GeneratedQuestion,
    allowed_skills: dict[str, QuestionGenerationRequestContext],
    requested_difficulty: str,
    requested_section_type: str,
    requested_question_type: str | None = None,
) -> GeneratedQuestion:
    """Validate and normalize one generated question."""
    normalized_text = _normalize_question_text_for_storage(question.question_text)

    if not normalized_text:
        raise LLMResponseError(
            "Groq returned a generated question with empty question text."
        )

    if len(normalized_text) > MAX_QUESTION_TEXT_LENGTH:
        raise LLMResponseError(
            "Groq returned a generated question that is too long."
        )

    # The slot already determines the target skill. Do not make the local LLM
    # re-select the skill as authoritative metadata; the model can
    # occasionally emit a neighbouring skill label even when the question is
    # otherwise valid. For one-slot generation, the server supplies the skill.
    if len(allowed_skills) == 1:
        normalized_skill = next(iter(allowed_skills))
    else:
        normalized_skill = _normalize_generation_skill_name(question.skill_name or "")
        if normalized_skill not in allowed_skills:
            raise LLMResponseError(
                "Groq returned a question for a skill that was not approved for generation."
            )

    normalized_difficulty = question.difficulty.strip().lower()

    if normalized_difficulty != requested_difficulty:
        raise LLMResponseError(
            "Groq returned a question with an unexpected difficulty."
        )

    normalized_section_type = question.section_type.strip().lower()

    if normalized_section_type != requested_section_type:
        raise LLMResponseError(
            "Groq returned a question with an unexpected section type."
        )

    normalized_question_type = question.question_type.strip().upper()
    expected_question_type = _expected_question_type_for_section(
        requested_section_type, requested_question_type
    )

    if normalized_question_type != expected_question_type:
        raise LLMResponseError(
            "Groq returned a question type that is incompatible with the requested section type."
        )

    normalized_options: list[str] = []
    seen_options: set[str] = set()

    for option in question.options:
        if not isinstance(option, str):
            continue

        normalized_option = " ".join(option.strip().split())
        normalized_option = re.sub(
            r"^[A-D][\.)\:]\s*",
            "",
            normalized_option,
            flags=re.IGNORECASE,
        )

        if not normalized_option:
            continue

        if len(normalized_option) > MAX_OPTION_LENGTH:
            raise LLMResponseError(
                "Groq returned an option that is too long."
            )

        option_key = normalized_option.lower()

        if option_key in seen_options:
            continue

        seen_options.add(option_key)
        normalized_options.append(normalized_option)

    normalized_correct_answer = None

    if question.correct_answer is not None:
        normalized_correct_answer = " ".join(
            question.correct_answer.strip().split()
        )

        if not normalized_correct_answer:
            normalized_correct_answer = None

    if expected_question_type == "MCQ":
        if len(normalized_options) != 4:
            raise LLMResponseError(
                "Groq returned an MCQ that does not contain exactly four distinct options."
            )

        if not normalized_correct_answer:
            raise LLMResponseError(
                "Groq returned an MCQ without a correct answer."
            )

        # Some model responses may return the correct answer as a letter, number,
        # or a wrapped label such as "Correct answer: Option B". Normalize
        # deterministic labels to the canonical option text without making a
        # semantic guess about which option is correct.
        answer_token = None

        letter_match = re.match(
            r"^(?:(?:correct\s+answer|answer|option)\s*[:=-]?\s*)?"
            r"(?:option\s*)?([A-D])(?:[\.\:\)]|\s|$)",
            normalized_correct_answer,
            flags=re.IGNORECASE,
        )
        if letter_match:
            answer_token = letter_match.group(1).upper()

        if answer_token is None:
            number_match = re.match(
                r"^(?:(?:correct\s+answer|answer|option)\s*[:=-]?\s*)?"
                r"(?:option\s*)?([1-4])(?:[\.\:\)]|\s|$)",
                normalized_correct_answer,
                flags=re.IGNORECASE,
            )
            if number_match:
                answer_token = number_match.group(1)

        if answer_token in {"A", "B", "C", "D"}:
            letter_index = ord(answer_token) - ord("A")
            normalized_correct_answer = normalized_options[letter_index]
        elif answer_token in {"1", "2", "3", "4"}:
            normalized_correct_answer = normalized_options[int(answer_token) - 1]

        option_lookup = {
            re.sub(r"\s+", " ", option.strip()).casefold(): option
            for option in normalized_options
        }

        canonical_correct_answer = option_lookup.get(
            re.sub(r"\s+", " ", normalized_correct_answer.strip()).casefold()
        )

        if canonical_correct_answer is None:
            # Some local models return the answer with common wrapper text such as
            # "Answer: B" or "Option C". Try one more tolerant extraction before
            # rejecting the candidate. Never guess from semantic similarity.
            embedded_letter = re.search(
                r"\b(?:answer|correct(?: answer)?|option)\s*[:=-]?\s*([A-D])\b",
                normalized_correct_answer,
                flags=re.IGNORECASE,
            )
            if embedded_letter:
                letter_index = ord(embedded_letter.group(1).upper()) - ord("A")
                canonical_correct_answer = normalized_options[letter_index]

        if canonical_correct_answer is None:
            raise LLMResponseError(
                "Groq returned an MCQ whose correct answer does not match an option."
            )

        normalized_correct_answer = canonical_correct_answer

    else:
        if normalized_options:
            raise LLMResponseError(
                "Groq returned options for a free-text question."
            )

        if normalized_correct_answer:
            raise LLMResponseError(
                "Groq returned a multiple-choice answer for a free-text question."
            )

    normalized_explanation = question.explanation

    if normalized_explanation is not None:
        normalized_explanation = " ".join(
            normalized_explanation.strip().split()
        )

        if not normalized_explanation:
            normalized_explanation = None

        elif len(normalized_explanation) > MAX_EXPLANATION_LENGTH:
            raise LLMResponseError(
                "Groq returned an explanation that is too long."
            )

    if expected_question_type == "FREE_TEXT" and not normalized_explanation:
        raise LLMResponseError(
            "Groq returned a free-text question without evaluation guidance."
        )

    return GeneratedQuestion(
        question_text=normalized_text,
        skill_name=allowed_skills[normalized_skill].skill_name,
        difficulty=normalized_difficulty,
        section_type=normalized_section_type,
        question_type=normalized_question_type,
        options=normalized_options,
        correct_answer=normalized_correct_answer,
        explanation=normalized_explanation,
    )


def _manager_prompt_directives(manager_prompt: str | None) -> dict[str, object]:
    """Convert free-form manager guidance into bounded, testable directives."""
    prompt = " ".join(str(manager_prompt or "").strip().split())
    lowered = prompt.casefold()

    avoid_definition = any(
        phrase in lowered
        for phrase in (
            "avoid definition",
            "avoid basic definition",
            "avoid basic definitions",
            "no definition",
            "not definition",
            "not definition-only",
            "avoid definition-only",
            "avoid simple definition",
            "avoid simple definitions",
            "no simple definitions",
        )
    )

    current_requested = any(
        phrase in lowered
        for phrase in (
            "latest",
            "current",
            "recent",
            "modern",
            "up-to-date",
            "up to date",
        )
    )

    focus_signals = [
        ("output", ("output prediction", "predict the output", "what will this print", "what does this return")),
        ("debugging", ("debugging", "debug questions", "debug scenario", "root cause", "troubleshooting", "fix the bug", "diagnose", "failure analysis")),
        ("code", ("code snippet", "code-based", "code based", "write code", "read the code", "implementation question", "code questions")),
        ("comparison", ("comparison", "compare", "difference between", "versus", " vs ", "which approach")),
        ("scenario", ("scenario-based", "scenario based", "real-world scenario", "real world scenario", "production scenario", "case study")),
        ("sql", ("sql questions", "sql queries", "query writing", "joins", "group by")),
        ("design", ("system design", "architecture", "trade-off", "tradeoff", "design questions")),
        ("applied", ("practical questions", "applied questions", "hands-on", "real world", "practical scenario", "production")),
        ("concept", ("concept questions", "conceptual questions", "principles", "fundamentals")),
    ]

    focuses: list[str] = []
    for focus, signals in focus_signals:
        if any(signal in lowered for signal in signals):
            focuses.append(focus)

    topics: list[str] = []
    topic_match = re.search(
        r"(?:focused?\s+on|focus(?:ed)?\s+on|cover(?:ing|s)?|about|regarding|center(?:ed)?\s+on|emphas(?:ize|is)\s+)(.+)$",
        prompt,
        flags=re.IGNORECASE,
    )
    if topic_match:
        topic_text = re.split(
            r"\b(?:avoid|exclude|do not|don't|without)\b",
            topic_match.group(1),
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0].strip(" .;:")
        parts = re.split(r",|\band\b|\bor\b", topic_text, flags=re.IGNORECASE)
        for part in parts:
            cleaned = " ".join(part.strip(" .;:").split())
            if 2 <= len(cleaned) <= 90 and cleaned.casefold() not in {item.casefold() for item in topics}:
                topics.append(cleaned)
            if len(topics) >= 6:
                break

    # Preserve explicit examples separately from abstract topics. This lets the
    # generator honour concrete manager guidance such as:
    #   "food eg with fruit as secondary example"
    # without turning the entire phrase into one opaque topic.
    examples: list[str] = []

    def add_example(value: str) -> None:
        cleaned = " ".join(value.strip(" .,:;\t").split())
        cleaned = re.sub(
            r"^(?:(?:with|using|use|include|take|and|or|eg|e\.g\.)\s+)+",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        if 2 <= len(cleaned) <= 80 and cleaned.casefold() not in {
            item.casefold() for item in examples
        }:
            examples.append(cleaned)

    # A single-word/short named example before "eg/e.g.".
    for match in re.finditer(
        r"\b([A-Za-z0-9][A-Za-z0-9_-]{1,40})\s+(?:eg|e\.g\.)\b",
        prompt,
        flags=re.IGNORECASE,
    ):
        add_example(match.group(1))

    # Explicit primary/secondary example phrasing.
    for match in re.finditer(
        r"\b([A-Za-z0-9][A-Za-z0-9_-]*(?:\s+[A-Za-z0-9][A-Za-z0-9_-]*){0,2})\s+as\s+(?:(?:a|an)\s+)?(?:primary|main|first|secondary|second|another|additional)?\s*example\b",
        prompt,
        flags=re.IGNORECASE,
    ):
        add_example(match.group(1))

    # "use food as an example", "include fruit as example".
    for match in re.finditer(
        r"\b(?:use|using|include|take)\s+([A-Za-z0-9][A-Za-z0-9_-]{1,40})\s+(?:as\s+)?(?:(?:a|an)\s+)?example\b",
        prompt,
        flags=re.IGNORECASE,
    ):
        add_example(match.group(1))

    # "examples: food, fruit" / "example - food".
    for match in re.finditer(
        r"\bexamples?\s*[:\-]\s*([^.;]{2,140})",
        prompt,
        flags=re.IGNORECASE,
    ):
        for part in re.split(r",|\band\b|\bor\b", match.group(1)):
            add_example(part)

    return {
        "avoid_definition": avoid_definition,
        "current_requested": current_requested,
        "focuses": focuses,
        "topics": topics,
        "examples": examples[:8],
    }


def _question_is_definition_like(question_text: str | None) -> bool:
    """Detect common low-effort recall stems that managers can explicitly reject."""
    text = " ".join(str(question_text or "").strip().casefold().split())
    if not text:
        return False
    patterns = (
        r"^what is\b",
        r"^what's\b",
        r"^define\b",
        r"^what is the (main )?(purpose|goal|benefit|use|role)\b",
        r"^what does .* mean\b",
        r"^which of the following (best )?describes\b",
    )
    return any(re.search(pattern, text) for pattern in patterns)


_QUESTION_TOKEN_STOPWORDS = {
    "what", "whats", "is", "are", "the", "a", "an", "of", "to", "in",
    "on", "for", "from", "with", "and", "or", "by", "does", "do", "can",
    "should", "would", "could", "which", "how", "why", "when", "where",
    "main", "primary", "purpose", "goal", "benefit", "use", "role",
    "best", "following", "option", "options", "correct", "answer",
    "fastapi", "application", "app", "framework", "route", "routes",
    "parameter", "module", "feature", "endpoint", "question",
}


def _question_target_tokens(question_text: str | None) -> set[str]:
    """Build a lightweight content-word fingerprint for target overlap checks."""
    raw = re.findall(
        r"[a-zA-Z][a-zA-Z0-9_]{2,}",
        str(question_text or "").casefold(),
    )
    tokens: set[str] = set()
    for token in raw:
        for part in token.split("_"):
            if len(part) < 3 or part in _QUESTION_TOKEN_STOPWORDS:
                continue
            if part.endswith("ies") and len(part) > 5:
                part = part[:-3] + "y"
            elif part.endswith("s") and len(part) > 4:
                part = part[:-1]
            tokens.add(part)
    return tokens


def _normalize_generation_text(value: str | None) -> str:
    """Normalize question text for stable lightweight comparison.

    This is intentionally limited to whitespace/case normalization. The actual
    near-duplicate gate lives in the authoring service, while this helper only
    supports the conservative underlying-target comparison below.
    """
    return " ".join(str(value or "").strip().casefold().split())


def _question_targets_are_too_similar(
    candidate_text: str | None,
    excluded_texts: list[str] | None,
) -> bool:
    """Reject genuinely repeated knowledge targets without blocking valid neighbors.

    This check is intentionally conservative because ``excluded_texts`` can contain
    a large question-bank sample. A single shared domain noun (for example
    ``dependency`` or ``body``) is not enough to prove that two questions test
    the same knowledge target. Exact and near-text duplicates are handled separately by
    the authoring service.
    """
    candidate_tokens = _question_target_tokens(candidate_text)
    if len(candidate_tokens) < 2:
        return False

    candidate_normalized = _normalize_generation_text(candidate_text)
    if not candidate_normalized:
        return False

    for existing in excluded_texts or []:
        existing_normalized = _normalize_generation_text(existing)
        if not existing_normalized:
            continue

        # Avoid rejecting short questions merely because they share one distinctive
        # domain term with a different question.
        existing_tokens = _question_target_tokens(existing)
        if len(existing_tokens) < 2:
            continue

        overlap = candidate_tokens & existing_tokens
        if len(overlap) < 2:
            continue

        union = candidate_tokens | existing_tokens
        jaccard = len(overlap) / max(len(union), 1)

        # Very strong overlap in content words usually means the same assessment target,
        # even when the prose is different. This catches repeated scenarios such as
        # "chatbot memory performance" written as several different questions.
        if jaccard >= 0.60:
            return True

        # Longer questions with four or more shared content words are also treated as
        # the same target when a meaningful portion of their content vocabulary overlaps.
        if len(candidate_tokens) >= 8 and len(overlap) >= 4 and jaccard >= 0.30:
            return True

        if len(candidate_tokens) >= 5 and len(overlap) >= 3 and jaccard >= 0.50:
            return True

        # Very close full-text similarity belongs to the authoring-service duplicate
        # gate, but keep an additional safety check here for generated retries.
        if SequenceMatcher(None, candidate_normalized, existing_normalized).ratio() >= 0.88:
            return True

    return False


def _practical_scenario_quality_errors(
    question: GeneratedQuestion,
    plan: QuestionGenerationPlan | None,
) -> list[str]:
    """Reject scenario questions that use a decorative story without a real operational task.

    A manager request for realistic/practical scenarios means the business context must
    be the actual setting in which the technical problem occurs. The stem should expose
    an operational symptom/constraint and force a concrete technical decision. A sentence
    that merely says a shop/farmer/company wants to be "efficient" is not enough.
    """
    if plan is None or str(plan.pattern).strip().lower() not in {"scenario", "applied"}:
        return []

    question_text = " ".join(str(question.question_text or "").strip().casefold().split())
    errors: list[str] = []

    # Concrete operational evidence: a symptom, workload, resource constraint, or
    # measurable business/technical condition that makes the decision necessary.
    operational_signals = (
        "slow", "latency", "timeout", "timed out", "spike", "high cpu", "cpu usage",
        "memory usage", "running out of memory", "traffic", "orders", "requests",
        "build takes", "build time", "deploy takes", "deployment time", "image size",
        "build context", "disk space", "storage", "bandwidth", "throughput", "failed",
        "error", "bottleneck", "resource limit", "resource", "capacity", "%", "seconds",
        "minutes", "mb", "gb", "busy period", "peak", "under load",
    )
    if not any(signal in question_text for signal in operational_signals):
        errors.append(
            "Scenario is decorative rather than practical: it lacks a concrete operational symptom, constraint, workload, or measurable condition."
        )

    # A real scenario should ask for an actionable technical choice, not just a noun/definition.
    decision_signals = (
        "which", "what should", "what would", "how should", "how would", "best next step",
        "best way", "which option", "which setting", "which approach", "what would you do",
        "choose", "select", "configure", "set", "limit", "exclude", "use",
    )
    if not any(signal in question_text for signal in decision_signals):
        errors.append(
            "Scenario does not ask for a concrete technical action or decision."
        )

    # Prevent the exact failure shown by the recent examples: the physical produce story
    # is unrelated to the Docker mechanism. The manager example should be the software
    # product/domain, not a metaphor about packing or shipping vegetables.
    produce_terms = ("fruit", "fruits", "vegetable", "vegetables", "produce")
    technical_terms = (
        "docker", "dockerfile", "container", "image", "build context", ".dockerignore",
        "cpu", "memory", "network", "bridge", "overlay", "port", "volume", "registry",
    )
    has_produce = any(term in question_text for term in produce_terms)
    has_technical = any(term in question_text for term in technical_terms)
    if has_produce and not has_technical:
        errors.append(
            "Manager example is being used as a decorative story without a visible technical context."
        )

    return errors



def _mcq_quality_errors(question: GeneratedQuestion) -> list[str]:
    """Run deterministic MCQ quality checks focused on elimination bias.

    These checks target observable defects that can make the correct answer obvious
    without knowing the subject: strong option-length imbalance, a structurally unique
    option, and common giveaway distractors. Semantic correctness is handled by the
    separate answer-consistency gate below; this helper intentionally avoids another
    LLM call.
    """
    if question.question_type.strip().upper() != "MCQ":
        return []
    if len(question.options) != 4:
        return []

    option_texts = [" ".join(str(option).strip().split()) for option in question.options]
    word_counts = [len(text.split()) for text in option_texts]
    char_counts = [len(text) for text in option_texts]
    errors: list[str] = []

    sorted_word_counts = sorted(word_counts)
    sorted_char_counts = sorted(char_counts)
    median_words = (sorted_word_counts[1] + sorted_word_counts[2]) / 2
    median_chars = (sorted_char_counts[1] + sorted_char_counts[2]) / 2

    min_words = max(sorted_word_counts[0], 1)
    max_words = sorted_word_counts[-1]
    if max_words >= 6 and max_words / min_words >= 2.4:
        errors.append("MCQ options have a strong word-count imbalance that could reveal the answer by length.")

    min_chars = max(sorted_char_counts[0], 1)
    max_chars = sorted_char_counts[-1]
    if max_chars >= 36 and max_chars / min_chars >= 2.75:
        errors.append("MCQ options have a strong character-length imbalance that could reveal the answer by visual pattern.")

    correct_normalized = " ".join(str(question.correct_answer or "").strip().casefold().split())
    correct_index = next((i for i, option in enumerate(option_texts) if option.casefold() == correct_normalized), None)

    if correct_index is not None:
        correct_words = word_counts[correct_index]
        correct_chars = char_counts[correct_index]
        shortest_words = min(word_counts)
        if (
            correct_words >= 6
            and correct_words >= median_words * 1.35
            and correct_words - median_words >= 2
        ) or (
            correct_words >= 7
            and correct_words / max(shortest_words, 1) >= 1.6
            and correct_words - shortest_words >= 3
            and correct_words == max(word_counts)
        ):
            errors.append("The correct MCQ option is noticeably longer than the other options.")

        if correct_words >= 3 and correct_words <= median_words * 0.55 and median_words - correct_words >= 3:
            errors.append("The correct MCQ option is noticeably shorter than the other options.")

        if correct_chars >= 36 and correct_chars >= median_chars * 1.45 and correct_chars - median_chars >= 18:
            errors.append("The correct MCQ option has noticeably more visual detail than the other options.")

        if correct_chars >= 12 and correct_chars <= median_chars * 0.55 and median_chars - correct_chars >= 18:
            errors.append("The correct MCQ option has noticeably less visual detail than the other options.")

    sentence_like = [bool(re.search(r"[.!?]$", option)) for option in option_texts]
    if sum(sentence_like) == 1:
        errors.append("MCQ options use inconsistent sentence structure that could reveal the answer.")

    giveaway_phrases = (
        "none of the above", "all of the above", "do nothing", "ignore the problem",
        "ignore the issue", "ignore the error", "delete the database", "turn off security",
        "disable security", "delete all data",
    )
    if any(any(phrase in option.casefold() for phrase in giveaway_phrases) for option in option_texts):
        errors.append("MCQ contains a giveaway or obviously non-competitive distractor.")

    return errors


_SALES_GIVEAWAY_DISTRACTOR_PATTERNS: tuple[tuple[str, str], ...] = (
    (
        "aggressive or coercive follow-up",
        r"\b(?:contact|call|email)\b.{0,70}\bevery single day\b|\bevery single day\b.{0,70}\b(?:call|email|contact)\b|\buntil (?:the )?(?:prospect|client|customer) explicitly (?:tell|asks?) you to stop\b",
    ),
    (
        "interrupting or dominating the customer",
        r"\b(?:interrupt|cut off) (?:the )?(?:client|customer|prospect)\b|\b(?:dominate|control) the (?:conversation|dialogue)\b|\bprevent the (?:client|customer|prospect) from raising\b",
    ),
    (
        "coercive or impulsive selling",
        r"\bpressure (?:the )?(?:prospect|client|customer)\b.{0,100}\bimpulsive\b|\bforce (?:the )?(?:prospect|client|customer)\b.{0,60}\bdecision\b|\bdemand a direct explanation\b",
    ),
    (
        "unfounded assumptions about customer interest",
        r"\bassume (?:they|the prospect|the client|the customer) (?:have|has) zero interest\b|\bclose (?:their|the) lead file\b.{0,70}\bzero interest\b",
    ),
    (
        "unverified promises or dismissing customer concerns",
        r"\bpromise (?:an? )?unverified (?:benefit|feature|capability|result)\b|\b(?:ignore|dismiss) (?:the )?(?:prospect|client|customer)(?:'s)? concern\b",
    ),
    (
        "irrelevant competitive surveillance",
        r"\bforward (?:their )?contact information\b.{0,100}\bdemand\b|\bcheck if (?:the )?prospect has forwarded (?:your )?(?:pricing|price) details to (?:rival|competitor)\b",
    ),
    (
        "unrealistically absolute behaviour",
        r"\bevery single line\b.{0,60}\b(?:terms|conditions|document)\b|\b(?:read|review) every single line\b",
    ),
)

_SALES_COMMUNICATION_STEM_PATTERN = re.compile(
    r"\b(?:active listening|paraphras(?:e|ing)|summari[sz](?:e|ing)|open[- ]ended questions?|client discovery|customer discovery)\b",
    flags=re.IGNORECASE,
)
_SALES_OFF_TOPIC_COMMUNICATION_OPTION_PATTERN = re.compile(
    r"\b(?:technical knowledge|technical specifications|custom product build|compiler|algorithm|sql query|memory leak)\b",
    flags=re.IGNORECASE,
)
_CANDIDATE_FACING_RUBRIC_LEAKAGE_PATTERNS: tuple[str, ...] = (
    r"\bprovide (?:the )?rubric guidance\b",
    r"\brubric guidance\b",
    r"\bscoring rubric\b",
    r"\bprovide (?:the )?evaluation criteria\b",
    r"\bwhat a strong candidate response should include\b",
    r"\binclude the expected key points\b",
    r"\bexplain how (?:this|the) answer should be evaluated\b",
    r"\bdescribe the scoring criteria\b",
)
_REPEATED_NON_TECHNICAL_STEM_PATTERNS: tuple[tuple[str, str], ...] = (
    ("primary-purpose", r"\bwhat is the (?:primary|main) purpose\b"),
    ("primary-criterion", r"\bwhat is the primary (?:criterion|criteria)\b"),
    ("most-effective-approach", r"\bwhat is the most effective approach\b"),
    ("best-way", r"\bwhat is the best way to\b"),
)


def _non_technical_question_quality_errors(
    question: GeneratedQuestion,
    *,
    job_title: str | None = None,
    excluded_question_texts: list[str] | None = None,
) -> list[str]:
    """Reject obvious non-technical authoring defects without another model call.

    These checks are intentionally conservative: they target explicit evaluator-only
    instructions, cartoonishly bad sales distractors, off-topic options for sales-
    communication questions, and repeated generic stem templates. They do not try to
    decide semantic correctness from keyword overlap alone.
    """
    question_text = " ".join(str(question.question_text or "").strip().casefold().split())
    if not question_text:
        return ["Generated question has an empty candidate-facing stem."]

    errors: list[str] = []
    question_type = str(question.question_type or "").strip().upper()

    if question_type == "FREE_TEXT":
        if any(re.search(pattern, question_text, flags=re.IGNORECASE)
               for pattern in _CANDIDATE_FACING_RUBRIC_LEAKAGE_PATTERNS):
            errors.append(
                "Candidate-facing question contains evaluator-only rubric or scoring instructions; keep those in the separate explanation field."
            )
        return errors

    if question_type != "MCQ" or len(question.options or []) != 4:
        return errors

    normalized_title = " ".join(str(job_title or "").strip().casefold().split())
    is_sales_role = bool(re.search(r"\b(?:sales|business development)\b", normalized_title))
    correct_answer = " ".join(str(question.correct_answer or "").strip().casefold().split())
    option_texts = [" ".join(str(option or "").strip().casefold().split()) for option in question.options]
    correct_index = next(
        (index for index, option in enumerate(option_texts) if option == correct_answer),
        None,
    )
    incorrect_options = [
        option for index, option in enumerate(option_texts)
        if correct_index is None or index != correct_index
    ]

    if is_sales_role:
        for label, pattern in _SALES_GIVEAWAY_DISTRACTOR_PATTERNS:
            if any(re.search(pattern, option, flags=re.IGNORECASE) for option in incorrect_options):
                errors.append(
                    f"MCQ contains an implausibly extreme or unprofessional distractor ({label}); rewrite it as a credible alternative for the same sales decision."
                )
                break

        if _SALES_COMMUNICATION_STEM_PATTERN.search(question_text) and any(
            _SALES_OFF_TOPIC_COMMUNICATION_OPTION_PATTERN.search(option)
            for option in incorrect_options
        ):
            errors.append(
                "MCQ contains an off-topic technical distractor for a sales-communication question; all options must address the same professional concept."
            )

    # Avoid repeating stock stem templates across questions already generated or
    # selected for this same slot. This checks wording pattern only, not the target.
    for label, pattern in _REPEATED_NON_TECHNICAL_STEM_PATTERNS:
        if not re.search(pattern, question_text, flags=re.IGNORECASE):
            continue
        for previous in excluded_question_texts or []:
            previous_text = " ".join(str(previous or "").strip().casefold().split())
            if previous_text and re.search(pattern, previous_text, flags=re.IGNORECASE):
                errors.append(
                    f"Question repeats the generic '{label}' stem pattern from recent assessment content; vary the question structure while testing a distinct target."
                )
                break
        if errors:
            break

    return errors


_MCQ_CONCEPT_GROUPS: dict[str, set[str]] = {
    "docker_build_context": {
        "build context", "context", "dockerignore", ".dockerignore", "node_modules",
        "log files", "unnecessary files", "sending context",
    },
    "docker_build_layers_cache": {
        "dockerfile", "copy", "dependency", "dependencies", "install", "reinstall",
        "cache", "layer", "layers", "rebuild", "source code", "requirements",
    },
    "cpu": {"cpu", "cores", "processor", "cpu usage", "cpu utilization", "cpulimit"},
    "memory": {"memory", "ram", "oom", "out of memory", "memory limit"},
    "persistence": {
        "persist", "persistent", "volume", "volumes", "restart", "restarts",
        "survives restart", "data survives", "retain data", "retained data", "order history",
        "stored data",
    },
    "docker_image_size": {
        "image size", "smaller image", "base image", "multi-stage", "packages", "package",
        "cache", "files", "layers", "image",
    },
    "network": {
        "network", "latency", "bandwidth", "port", "bridge", "overlay", "connection",
        "connections", "throughput",
    },
    "database_query": {
        "query", "queries", "sql", "join", "joins", "index", "indexes", "database", "scan", "rows",
    },
}

_MCQ_SEMANTIC_ALIASES: tuple[set[str], ...] = (
    {"cpu", "cores", "processor"},
    {"memory", "ram", "oom"},
    {"storage", "disk", "volume", "persistent", "persistence"},
    {"latency", "response", "slow", "speed"},
    {"throughput", "requests", "traffic", "load", "capacity"},
    {"build", "build context", "build time", "dockerfile", "copy", "layer", "cache"},
    {"dependencies", "dependency", "install", "reinstall", "requirements"},
    {"image", "image size", "base image", "multi-stage", "packages", "files"},
)

_MCQ_ALIGNMENT_STOPWORDS = {
    "what", "which", "best", "most", "effective", "appropriate", "should", "would",
    "change", "technique", "method", "approach", "option", "use", "using", "docker",
    "container", "containers", "service", "services", "application", "app", "developer",
    "team", "system", "want", "wants", "need", "needs", "make", "making", "improve",
    "improving", "reduce", "reducing", "increase", "increasing", "time", "performance",
    "efficient", "efficiency", "directly", "question", "following", "during",
}


def _mcq_semantic_tokens(text: str | None) -> set[str]:
    return {token for token in _question_target_tokens(text) if token not in _MCQ_ALIGNMENT_STOPWORDS and len(token) >= 4}


def _mcq_contains_group(text: str | None, group_terms: set[str]) -> bool:
    normalized = " ".join(str(text or "").strip().casefold().split())
    return any(term.casefold() in normalized for term in group_terms)


def _mcq_alias_overlap(left: str | None, right: str | None) -> bool:
    left_text = " ".join(str(left or "").strip().casefold().split())
    right_text = " ".join(str(right or "").strip().casefold().split())
    if not left_text or not right_text:
        return False
    if _mcq_semantic_tokens(left_text) & _mcq_semantic_tokens(right_text):
        return True
    return any(
        any(term in left_text for term in alias_group)
        and any(term in right_text for term in alias_group)
        for alias_group in _MCQ_SEMANTIC_ALIASES
    )


def _mcq_answer_consistency_errors(question: GeneratedQuestion, plan: QuestionGenerationPlan | None) -> list[str]:
    """Catch high-confidence cases where the selected answer does not fit the problem."""
    if question.question_type.strip().upper() != "MCQ" or len(question.options) != 4:
        return []

    question_text = " ".join(str(question.question_text or "").strip().casefold().split())
    correct_answer = " ".join(str(question.correct_answer or "").strip().casefold().split())
    if not question_text or not correct_answer:
        return []

    errors: list[str] = []
    distinctive_groups = {
        "docker_build_context", "persistence", "cpu", "memory", "docker_build_layers_cache", "database_query",
    }

    for group_name, group_terms in _MCQ_CONCEPT_GROUPS.items():
        if group_name not in distinctive_groups:
            continue
        stem_hits = sum(1 for term in group_terms if term.casefold() in question_text)
        if stem_hits < 2 or _mcq_contains_group(correct_answer, group_terms):
            continue
        errors.append(
            f"MCQ answer does not address the problem described in the stem ({group_name.replace('_', ' ')})."
        )
        break

    if not errors and plan is not None:
        plan_text = " ".join(
            str(value or "")
            for value in (
                getattr(plan, "problem_target", None),
                getattr(plan, "knowledge_target", None),
                getattr(plan, "efficiency_focus", None),
            )
        )
        target_tokens = _mcq_semantic_tokens(plan_text)
        answer_tokens = _mcq_semantic_tokens(correct_answer)
        if len(target_tokens) >= 3 and not (target_tokens & answer_tokens) and not _mcq_alias_overlap(plan_text, correct_answer):
            errors.append("MCQ answer is not aligned with the technical problem/knowledge target selected by the question plan.")

    improvement_objective = any(
        phrase in question_text
        for phrase in (
            "improve performance", "improve transaction processing", "reduce build time",
            "reduce the build time", "speed up", "reduce latency", "lower latency",
            "increase throughput", "improve processing time", "faster processing",
        )
    )
    restrictive_answer = any(
        phrase in correct_answer
        for phrase in (
            "limit cpu", "limit memory", "cap cpu", "cap memory", "throttle cpu",
            "throttle memory", "restrict cpu", "restrict memory", "reduce cpu usage",
            "reduce memory",
        )
    )
    overload_evidence = any(
        phrase in question_text
        for phrase in (
            "high cpu", "cpu usage", "cpu utilization", "cpu reaches", "cpu is maxed",
            "cpu is saturated", "memory usage", "running out of memory", "memory pressure",
            "resource contention", "contention", "overloaded", "under heavy load",
        )
    )
    if improvement_objective and restrictive_answer and not overload_evidence:
        errors.append(
            "MCQ answer conflicts with the stated improvement objective: it restricts a resource without a stated overload/resource-pressure condition."
        )

    persistence_objective = any(
        phrase in question_text
        for phrase in (
            "survives container restarts", "survive container restarts", "data is lost",
            "order history is lost", "data lost after restart", "persist", "persistent",
        )
    )
    persistence_answer = any(
        phrase in correct_answer
        for phrase in (
            "volume", "persistent", "persist", "database", "external storage",
            "durable storage", "mount",
        )
    )
    if persistence_objective and not persistence_answer:
        errors.append("MCQ answer does not provide a durable mechanism for the stated persistence/data-loss problem.")

    return errors


def _generation_plan_quality_errors(
    question: GeneratedQuestion,
    plan: QuestionGenerationPlan | None,
) -> list[str]:
    """Run lightweight server-side checks for plan details that materially affect quality.

    Preferred manager examples are prompt guidance rather than hard structural
    constraints, so omission of an example alone must not make a valid question
    fail. Hard slot constraints, requested pattern, efficiency focus, and MCQ
    option quality remain enforced elsewhere.
    """
    errors: list[str] = []
    if question.question_type.strip().upper() == "MCQ":
        errors.extend(_mcq_quality_errors(question))

    if plan is None:
        return errors

    question_text = " ".join(str(question.question_text or "").strip().casefold().split())

    errors.extend(_mcq_answer_consistency_errors(question, plan))
    errors.extend(_practical_scenario_quality_errors(question, plan))

    if plan.efficiency_focus:
        focus_tokens = _question_target_tokens(plan.efficiency_focus)
        candidate_tokens = _question_target_tokens(
            " ".join([question.question_text or "", *(question.options or [])])
        )
        if focus_tokens and not (focus_tokens & candidate_tokens):
            errors.append(
                "Generated question does not visibly implement the planned efficiency/performance focus."
            )

    if question.question_type.strip().upper() == "MCQ" and len(question.options) == 4:
        option_texts = [" ".join(option.strip().casefold().split()) for option in question.options]
        opposite_pairs = (
            ("smaller", "larger"),
            ("small", "large"),
            ("fewer", "more"),
            ("less", "more"),
            ("lower", "higher"),
            ("decrease", "increase"),
            ("decreases", "increases"),
            ("faster", "slower"),
            ("reduce", "increase"),
        )
        for left, right in opposite_pairs:
            if any(left in option for option in option_texts) and any(
                right in option for option in option_texts
            ):
                errors.append(
                    "MCQ distractors use an obvious opposite-word pair instead of four comparable technical alternatives."
                )
                break

    return errors


def _scenario_focus_matches(text: str, question_text: str) -> bool:
    """Match scenario/application intent without requiring canned phrases."""
    if _question_is_definition_like(question_text):
        return False

    normalized = " ".join(str(text or "").strip().casefold().split())

    # Local models legitimately phrase scenarios in many ways. Accept either an
    # explicit situation marker or a concrete actor/context, but still require
    # a decision/action task so generic conceptual MCQs do not pass just because
    # they mention a technical noun.
    situation_markers = (
        "when ", "while ", "during ", "after ", "before ", "if ", "once ",
        "whenever ", "following ", "suppose ", "consider ", "as soon as ",
        "in a ", "in an ", "on a ", "for a ", "for an ", "after a ",
        "before a ",
    )
    actor_or_context = (
        "a developer", "the developer", "an engineer", "the engineer",
        "a team", "the team", "a service", "the service", "an application",
        "the application", "a system", "the system", "a project", "the project",
        "a user", "the user", "a customer", "the customer", "a client", "the client",
        "a company", "the company", "an organization", "the organization",
        "an api", "the api", "your api", "an endpoint", "the endpoint",
        "a server", "the server", "a database", "the database", "a website",
        "the website", "a platform", "the platform", "a production environment",
        "a deployment", "the deployment", "a request", "the request",
        "a workflow", "the workflow",
        # Common concrete scenario settings. These are deliberately broader than
        # engineering role names because manager-provided examples may use a
        # store, warehouse, farm, delivery service, inventory flow, etc.
        "a store", "the store", "a shop", "the shop", "a farm", "the farm",
        "a warehouse", "the warehouse", "a delivery service", "the delivery service",
        "an inventory system", "the inventory system", "an order system", "the order system",
        "a business", "the business", "a product", "the product", "an order", "the order",
        "a restaurant", "the restaurant", "an office", "the office", "a school", "the school",
        "a hospital", "the hospital", "a pipeline", "the pipeline", "a database server",
        "the database server",
    )
    decision_signals = (
        "what should", "what would", "which should", "which would", "how should",
        "how would", "should the", "would the", "which option", "which approach",
        "best action", "best next step", "most appropriate", "best way",
        "what do you recommend", "which action", "what would you do",
        "what should be done", "recommend", "choose", "select",
    )

    has_situation = any(marker in normalized for marker in situation_markers)
    has_actor_or_context = any(marker in normalized for marker in actor_or_context)
    has_decision = any(marker in normalized for marker in decision_signals)
    has_question = "?" in str(question_text or "")

    return (has_situation or has_actor_or_context) and (has_decision or has_question)


def _debugging_focus_matches(text: str, question_text: str, section_type: str) -> bool:
    """Match debugging/diagnosis intent while respecting the section format."""
    if _question_is_definition_like(question_text):
        return False

    symptom_signals = (
        "error", "exception", "fails", "failure", "bug", "incorrect", "unexpected",
        "issue", "problem", "returns 4", "returns 5", "401", "403", "404", "422",
        "500", "timeout", "traceback", "not working", "stops working", "wrong result",
    )
    decision_signals = (
        "why", "cause", "root cause", "fix", "best fix", "should", "would",
        "diagnose", "identify", "address", "resolve", "first step", "what should",
    )

    has_symptom = any(token in text for token in symptom_signals)
    has_decision = any(token in text for token in decision_signals)

    # In conceptual sections, debugging is interpreted as diagnosis/troubleshooting
    # without requiring a code snippet. In implementation sections, a code/config/API
    # failure may be used as well.
    if section_type == "conceptual":
        scenario_signals = (
            "developer", "application", "service", "api", "endpoint", "request",
            "production", "team", "system", "suppose", "consider", "when "
        )
        return has_symptom and has_decision and any(token in text for token in scenario_signals)

    return has_symptom and has_decision


def _concept_focus_matches(
    question_text: str | None,
) -> bool:
    """Return True for short, direct conceptual questions without narrative framing."""
    text = " ".join(str(question_text or "").strip().casefold().split())
    if not text:
        return False

    # Easy conceptual questions should stay concise. This is deliberately a generous
    # ceiling so a valid short explanation or comparison is not rejected.
    if count_words(text) > 60:
        return False

    # Reject common narrative/operational framing while allowing normal conceptual
    # wording such as "When does FastAPI..." or "How does Pydantic...".
    actor_patterns = (
        r"\b(?:a|an|the)\s+(?:developer|engineer|team|company|customer|client|user|application|service|system|project)\b",
        r"\b(?:your|their)\s+(?:application|service|system|api|team|project)\b",
    )
    if any(re.search(pattern, text) for pattern in actor_patterns):
        return False

    narrative_markers = (
        "in production",
        "production incident",
        "production issue",
        "production outage",
        "traffic spike",
        "under heavy load",
        "during an outage",
        "users report",
        "the team notices",
        "the team needs",
        "the developer needs",
        "what should the developer",
        "what should your",
        "incident occurred",
        "an outage occurred",
        "marketplace",
        "workshop",
        "studio",
        "supplier",
        "roaster",
        "greenhouse",
        "warehouse",
        "order form",
        "customer submits",
    )
    if any(marker in text for marker in narrative_markers):
        return False

    return True


def _matches_manager_focus_strict(
    question: GeneratedQuestion,
    focus: str,
    section_type: str = "conceptual",
) -> bool:
    """Check whether a generated question visibly implements a requested subtype."""
    text = " ".join([question.question_text or "", *(question.options or [])]).casefold()
    focus = str(focus or "auto").strip().lower()

    if focus == "scenario":
        return _scenario_focus_matches(text, question.question_text or "")
    if focus == "debugging":
        return _debugging_focus_matches(text, question.question_text or "", section_type)
    if focus == "comparison":
        return any(token in text for token in (
            "compare", "difference", "versus", " vs ", "which approach", "when would you choose"
        ))
    if focus == "output":
        return (
            any(token in text for token in ("print(", "output", "return", "returned", "console"))
            and any(marker in question.question_text for marker in (
                "```", "\n", "def ", "async ", "for ", "if ", "="
            ))
        )
    if focus == "code":
        return any(marker in question.question_text for marker in (
            "```", "def ", "async ", "for ", "if ", "class ", "="
        ))
    if focus == "sql":
        return any(token in text for token in (
            "select ", " join ", " where ", "group by", "order by", "sql", "query"
        ))
    if focus == "design":
        return any(token in text for token in (
            "design", "architecture", "trade-off", "tradeoff", "which approach", "scalability"
        ))
    if focus == "applied":
        return (
            any(token in text for token in (
                "suppose", "consider", "production", "developer", "application", "service",
                "system", "when ", "how would", "your api", "endpoint"
            ))
            and not _question_is_definition_like(question.question_text)
        )
    if focus == "concept":
        return _concept_focus_matches(question.question_text)
    return True


_SKILL_DIVERSITY_SUBTOPICS = {
    "fastapi": [
        "request validation and Pydantic model behaviour",
        "dependency injection and dependency failures",
        "exception handling and HTTP error responses",
        "async versus sync endpoint behaviour",
        "response models and response serialization",
        "path/query/header/cookie parameter handling",
        "middleware and request lifecycle",
        "background task execution",
        "authentication/authorization failures",
        "file upload and request body handling",
    ],
    "docker": [
        "image layers and cache invalidation",
        "container networking and service discovery",
        "volumes and persistent data",
        "Docker Compose service dependencies",
        "healthchecks and startup ordering",
        "container resource limits",
        "multi-stage builds and image size",
        "environment variables and secrets",
        "port publishing and host/container mapping",
        "restart policies and container lifecycle",
    ],
    "python": [
        "iterators and generators",
        "exception handling",
        "context managers",
        "mutable versus immutable objects",
        "decorators and function behaviour",
        "list/dict/set comprehensions",
        "classes and inheritance",
        "typing and function contracts",
        "concurrency and async behaviour",
        "file/resource handling",
    ],
    "pytorch": [
        "tensor shapes and broadcasting",
        "autograd and gradient flow",
        "train versus eval mode",
        "optimizers and learning-rate behaviour",
        "Dataset/DataLoader behaviour",
        "CPU versus GPU device placement",
        "batch size and memory usage",
        "model parameters and freezing layers",
        "loss functions and target shapes",
        "profiling and performance bottlenecks",
    ],
    "postgresql": [
        "index selection and query performance",
        "joins and join cardinality",
        "transactions and commit/rollback behaviour",
        "isolation levels and concurrency",
        "constraints and data integrity",
        "query planning and EXPLAIN",
        "window functions",
        "aggregation and GROUP BY behaviour",
        "locking and contention",
        "schema design and normalization",
    ],
}


def build_generation_variation_instruction(
    manager_prompt: str | None,
    generation_focus: str,
    variation_start_index: int,
    variation_count: int,
    skill_name: str | None = None,
) -> str:
    """Build explicit per-candidate diversity targets for the configured model."""
    directives = _manager_prompt_directives(manager_prompt)
    topics = list(directives.get("topics") or [])
    examples = list(directives.get("examples") or [])
    requested_focuses = list(directives.get("focuses") or [])
    selected_focus = str(generation_focus or "auto").strip().lower()
    normalized_skill = _normalize_generation_skill_name(skill_name or "")

    if selected_focus != "auto":
        focus_cycle = [selected_focus]
    elif requested_focuses:
        focus_cycle = requested_focuses
    else:
        focus_cycle = ["scenario", "comparison", "applied", "concept"]

    skill_topics = _SKILL_DIVERSITY_SUBTOPICS.get(normalized_skill, [])
    if not topics and skill_topics:
        topics = skill_topics

    operations = [
        "mechanism or cause-and-effect reasoning",
        "best-action or best-next-step reasoning",
        "failure diagnosis or misconception detection",
        "when-to-use / limitation reasoning",
        "comparison of two closely related approaches",
        "practical decision under a simple constraint",
    ]

    lines = [
        "DIVERSITY PLAN FOR THIS BATCH:",
        "Every candidate must test a materially different underlying knowledge target.",
        "Do NOT repeat the same scenario, actor, failure mode, mechanism, or concept with different wording.",
        "Do NOT make several candidates about the same topic such as performance, memory, routing, or error handling unless the requested batch itself explicitly requires that single topic.",
        "A different option set is NOT a different question. The problem statement, scenario/context, failure mode or decision being tested must materially change.",
        "When several candidates use scenarios, vary the setting, actors, operational situation and problem statement—not only numbers, names or answer choices.",
    ]

    if examples:
        lines.append("MANAGER-PROVIDED EXAMPLES / CONTEXTS:")
        for example in examples:
            lines.append(f"- {example}")
        lines.append(
            "These examples are explicit manager guidance. Use them across different candidates where practical; do not reuse the first example as the setting for every candidate."
        )
        lines.append(
            "If an example already appears in an excluded question, do not reuse that setting. Move to another manager example or create a genuinely new context."
        )

    for offset in range(max(1, variation_count)):
        position = variation_start_index + offset
        focus = focus_cycle[position % len(focus_cycle)]
        topic = topics[position % len(topics)] if topics else "a genuinely different subtopic within the target skill"
        operation = operations[position % len(operations)]

        if examples and position < len(examples):
            example = examples[position]
            scenario_target = (
                f'use manager example/context "{example}" for this candidate; create a distinct problem statement around it'
            )
        elif examples:
            scenario_target = (
                "create a genuinely new scenario/context not reused by the other candidates; "
                "do not recycle a manager-provided example as the setting"
            )
        else:
            scenario_target = "choose a scenario/context not reused by the other candidates"

        lines.append(
            f"- Candidate {position + 1}: REQUIRED TARGET = {topic}; preferred pattern = {focus}; cognitive operation = {operation}; scenario instruction = {scenario_target}."
        )

    lines.append(
        "Before writing each candidate, silently check that its knowledge target and scenario context are different from every other candidate requested in this batch and from the excluded questions. If they are not different, choose another target or context."
    )

    if directives.get("avoid_definition"):
        lines.append(
            "- Manager explicitly rejected definition-only questions. Do not use generic stems such as 'What is...', 'What is the purpose...', 'What is the main benefit...', or 'What is the main goal...'."
        )

    if directives.get("current_requested"):
        lines.append(
            "- The manager requested current/recent material. Use only current details supplied by the manager or available context that are known with high confidence. Never invent versions, releases, APIs or announcements."
        )

    return "\n".join(lines)


def _manager_question_style_hint(manager_prompt: str | None) -> str:
    """Translate common manager wording into an explicit generation-style hint."""
    if not manager_prompt:
        return ""

    prompt = manager_prompt.casefold()
    hints: list[str] = []

    if any(token in prompt for token in ("code", "coding", "snippet", "program", "implementation")):
        hints.append("Prefer a code/implementation-oriented question rather than a definition-only question.")
    if any(token in prompt for token in ("output", "predict the output", "what will this print")):
        hints.append("Prefer a short code snippet followed by an output-prediction task.")
    if any(token in prompt for token in ("debug", "bug", "error", "failure", "fix")):
        hints.append("Prefer a realistic debugging/failure scenario and test diagnosis, root cause or the correct next step.")
    if any(token in prompt for token in ("scenario", "real-world", "real world", "production", "practical", "applied")):
        hints.append("Prefer an applied scenario with a concrete engineering decision instead of a textbook definition.")
    if any(token in prompt for token in ("compare", "comparison", "difference", "versus", "vs ")):
        hints.append("Prefer a comparison question that distinguishes two closely related approaches.")
    if any(token in prompt for token in ("avoid definition", "no definition", "not definition", "avoid basic")):
        hints.append("Avoid simple definition/recall questions unless the selected section makes that unavoidable.")

    if not hints:
        return ""

    return "Manager-requested style interpretation:\n- " + "\n- ".join(hints)


def _infer_generation_focus_from_prompt(manager_prompt: str | None) -> str:
    """Infer a structured question focus from clear manager language when focus is Auto."""
    prompt = " ".join(str(manager_prompt or "").strip().lower().split())
    if not prompt:
        return "auto"

    focus_signals = [
        ("output", ("output prediction", "predict the output", "what will this print", "what does this return")),
        ("debugging", ("debugging", "debug questions", "debug scenario", "root cause", "troubleshooting", "fix the bug", "diagnose")),
        ("code", ("code snippet", "code-based", "code based", "write code", "read the code", "implementation question")),
        ("comparison", ("comparison", "compare", "difference between", "versus", "vs ")),
        ("scenario", ("scenario-based", "scenario based", "real-world scenario", "real world scenario", "production scenario", "case study")),
        ("sql", ("sql questions", "sql queries", "query writing", "joins", "group by")),
        ("design", ("system design", "architecture", "trade-off", "tradeoff", "design questions")),
        ("applied", ("practical questions", "applied questions", "hands-on", "real world", "practical scenario")),
    ]

    for focus, signals in focus_signals:
        if any(signal in prompt for signal in signals):
            return focus

    return "auto"


def _matches_non_technical_generation_focus(
    question: GeneratedQuestion,
    generation_focus: str,
) -> bool:
    """Validate professional question patterns without coding-oriented assumptions."""
    focus = str(generation_focus or "auto").strip().lower()
    stem = " ".join(str(question.question_text or "").strip().casefold().split())
    combined = " ".join([stem, *(question.options or [])]).casefold()

    if not stem:
        return False
    if focus == "auto":
        return True
    if focus == "concept":
        # Role-aware relevance is validated separately; don't use the technical
        # concept matcher, which incorrectly treats words such as "customer" as narrative.
        return count_words(stem) <= 60 and stem.endswith("?")
    if focus == "comparison":
        return any(term in stem for term in (
            "compare", "difference", "distinguish", "versus", " vs ", "which is better",
        ))
    if focus == "scenario":
        role_cues = (
            "customer", "client", "prospect", "lead", "sales", "target", "colleague",
            "team", "manager", "order", "complaint", "follow-up", "follow up",
        )
        action_cues = (
            "what should", "which action", "how should", "what would", "best next step",
            "most appropriate", "what is the best", "how would you",
        )
        return any(term in stem for term in role_cues) and any(term in stem for term in action_cues)
    if focus in {"applied", "design"}:
        # Domain-specific context is also enforced by the non-technical leakage guard.
        return stem.endswith("?") and any(
            term in combined
            for term in (
                "customer", "client", "prospect", "lead", "sales", "target", "team",
                "colleague", "manager", "communication", "follow-up", "follow up",
                "professional", "workplace", "candidate", "customer need",
            )
        )
    # Technical-only patterns should have been remapped before validation.
    if focus in {"code", "output", "debugging", "sql"}:
        return False
    return True


def _matches_generation_focus(
    question: GeneratedQuestion,
    generation_focus: str,
    section_type: str = "conceptual",
) -> bool:
    """Reject candidates that clearly ignore a manager-selected question pattern."""
    focus = str(generation_focus or "auto").strip().lower()
    if focus == "auto":
        return True
    if focus == "concept":
        return _concept_focus_matches(question.question_text)

    text_value = " ".join(
        [question.question_text or "", *(question.options or [])]
    ).casefold()

    if focus == "debugging":
        return _debugging_focus_matches(text_value, question.question_text or "", section_type)

    if focus == "scenario":
        return _scenario_focus_matches(text_value, question.question_text or "")

    patterns = {
        "comparison": ("compare", "comparison", "difference", "versus", " vs ", "which approach"),
        "code": ("```", "def ", "function(", "class ", "code snippet", "following code", "code"),
        "output": ("output", "what will", "what does this print", "returns", "printed", "console"),
        "sql": ("select ", " from ", " join ", " where ", "group by", "order by", "sql", "query"),
        "design": ("design", "architecture", "trade-off", "tradeoff", "approach", "system", "scalability"),
        "applied": ("scenario", "production", "real-world", "real world", "developer", "application", "system", "when ", "how would", "endpoint"),
    }
    tokens = patterns.get(focus)
    if not tokens:
        return True
    return any(token in text_value for token in tokens)


def _generation_focus_guidance(
    generation_focus: str,
    section_type: str = "conceptual",
    question_type: str = "MCQ",
) -> str:
    """Translate the manager's structured question-focus choice into explicit LLM instructions."""
    guidance = {
        "auto": "No specific question pattern was selected. Choose the most suitable pattern for the section and manager guidance.",
        "concept": "Concept/principle focus: test understanding of a specific concept, mechanism, principle or comparison. Avoid pure wording-definition recall when a short reasoning task can test the concept.",
        "scenario": "Scenario/application focus: create a realistic software/product scenario where the technical problem actually occurs. Include a concrete operational symptom, workload, constraint or measurable condition, then ask for a specific technical action/decision. The business example must be the real application context, not a decorative analogy.",
        "comparison": "Comparison focus: compare closely related concepts, approaches, APIs or design choices and test the distinction that matters in practice.",
        "code": "Code interpretation focus: include a concise, relevant code/configuration snippet and ask the candidate to reason about behaviour, correctness or the appropriate change.",
        "output": "Output prediction focus: include a short executable-style snippet and ask what it will output/return and why. Do not make the task depend on obscure trivia.",
        "debugging": (
            "Debugging focus: test diagnosis, root cause or the best fix rather than definition recall. "
            + (
                "Because this is a conceptual section, use a short realistic failure/troubleshooting scenario without requiring code; ask what is causing the behaviour or what the developer should check/do first."
                if section_type == "conceptual"
                else "Use a realistic failure, incorrect implementation, code/config/API behaviour or troubleshooting scenario and ask for the diagnosis or best fix."
            )
        ),
        "sql": "SQL focus: use a realistic data/query task involving SQL logic, joins, filtering, aggregation, constraints or query behaviour appropriate to the selected skill.",
        "design": "Design/reasoning focus: present a constrained engineering problem and test architecture, trade-offs, design decisions or reasoning.",
        "applied": "Applied reasoning focus: test how the candidate would use the skill in a concrete situation rather than recalling a definition.",
    }
    return guidance.get(str(generation_focus or "auto").strip().lower(), guidance["auto"])


def _generation_plan_context(
    plan: QuestionGenerationPlan | None,
) -> str:
    """Render one candidate's semantic generation plan as compact instructions."""
    if plan is None:
        return ""

    lines = [
        "QUESTION PLAN FOR THIS CANDIDATE — FOLLOW THIS PLAN",
        f"- Candidate number: {plan.candidate_index}",
        f"- Pattern: {plan.pattern}",
        f"- Problem target: {plan.problem_target}",
        f"- Knowledge target: {plan.knowledge_target}",
        f"- Scenario/context: {plan.scenario_context}",
        f"- Cognitive operation: {plan.cognitive_operation}",
        f"- Storyline: {plan.storyline}",
        f"- Uniqueness anchor: {plan.uniqueness_anchor}",
    ]

    if plan.example_context:
        lines.append(
            f"- Preferred manager example/context: {plan.example_context} (use naturally when it fits the storyline)"
        )
    if plan.efficiency_focus:
        lines.append(f"- Efficiency/performance focus: {plan.efficiency_focus}")

    lines.extend([
        "This plan is for this candidate only. Do not silently replace it with a generic question about the skill.",
        "The problem target is more important than decorative story wording.",
        "The scenario/context should support the actual decision or task; do not add random characters or settings.",
        "Do not reuse the same problem, scenario, or knowledge target from excluded/reference questions.",
    ])

    return "\n".join(lines)


def _manager_interpretation_context(
    interpretation: ManagerPromptInterpretation | dict[str, object] | None,
) -> str:
    """Render structured manager intent into concise generation guidance."""
    if interpretation is None:
        return ""

    try:
        if isinstance(interpretation, ManagerPromptInterpretation):
            intent = interpretation
        else:
            intent = ManagerPromptInterpretation.model_validate(interpretation)
    except (ValidationError, TypeError, ValueError):
        return ""

    lines = [
        "STRUCTURED MANAGER INTENT — USE THIS TO UNDERSTAND THE MANAGER, NOT AS A NEW HARD CONSTRAINT:",
        f"- Intent summary: {intent.intent_summary}",
        f"- Manager feedback state: {intent.sentiment.label} (confidence {intent.sentiment.confidence:.2f}).",
    ]

    if intent.sentiment.evidence:
        lines.append(f"- Feedback evidence: {intent.sentiment.evidence}")

    if intent.requested_patterns:
        lines.append(
            "- Requested question patterns: "
            + ", ".join(intent.requested_patterns)
        )

    if intent.candidate_mix:
        mix_parts = []
        for item in intent.candidate_mix:
            if item.count is not None:
                mix_parts.append(f"{item.pattern} x{item.count}")
            elif item.share is not None:
                mix_parts.append(f"{item.pattern} {item.share:.0%}")
            else:
                mix_parts.append(item.pattern)
        lines.append("- Requested batch mix: " + ", ".join(mix_parts))

    if intent.requested_difficulty != "auto":
        lines.append(
            f"- Manager-requested difficulty preference: {intent.requested_difficulty}. "
            "The slot difficulty supplied by the backend remains authoritative."
        )

    if intent.must_include:
        lines.append(
            "- Manager emphasis / must-include ideas: "
            + "; ".join(intent.must_include[:12])
        )

    if intent.preferred_examples:
        example_parts = [
            f"{example.text} [{example.role}]"
            for example in intent.preferred_examples[:12]
        ]
        lines.append("- Manager examples/contexts: " + "; ".join(example_parts))

    if intent.avoid:
        lines.append(
            "- Manager wants to avoid: "
            + "; ".join(intent.avoid[:12])
        )

    lines.append(
        f"- Diversity level: {intent.diversity_level}; distinct problem statements required: {intent.distinct_problem_statements}; "
        f"vary scenario contexts: {intent.vary_scenario_contexts}."
    )

    if intent.requested_length != "auto":
        lines.append(f"- Desired question length: {intent.requested_length}.")

    if intent.requested_response_depth != "auto":
        lines.append(f"- Desired response depth: {intent.requested_response_depth}.")

    if intent.priority_notes:
        lines.append(
            "- Interpretation priorities: "
            + "; ".join(intent.priority_notes[:8])
        )

    lines.extend([
        "Interpret the manager's message holistically. Do not treat typos or missing words as separate requirements.",
        "Examples are contextual guidance unless the wording clearly makes them mandatory content.",
        "A dissatisfaction/frustration signal means improve the next generation in the requested direction; it does not change hard slot constraints.",
        "When the manager requests multiple patterns, distribute them across the batch when the requested count allows it.",
        "For scenarios, vary the actual story/problem/setting. Changing only numbers, names, or options is not meaningful diversity.",
    ])

    return "\n".join(lines)


def _hard_pattern_for_slot(section_type: str, difficulty: str) -> str | None:
    """Return the immutable generation pattern required by a slot, when one exists."""
    if section_type == "conceptual" and difficulty == "easy":
        return "concept"
    return None


def _experience_level_guidance(
    experience_required: str | None,
    skill_category: str = "technical",
) -> str:
    """Convert a JD experience requirement into category-aware authoring guidance.

    Experience calibrates sophistication only. It never overrides the slot's
    skill, section, difficulty, question type, job domain, manager guidance, or plan.
    """
    normalized = " ".join(
        str(experience_required or "").strip().lower().split()
    )

    if str(skill_category or "technical").strip().lower() == "non_technical":
        if not normalized:
            level = "unspecified"
            guidance = (
                "- Calibrate sophistication from the slot's section and difficulty only.\n"
                "- Use normal professional judgement without assuming prior sales experience."
            )
        elif any(
            marker in normalized
            for marker in ("fresher", "freshers", "fresh graduate", "entry level", "entry-level")
        ) or bool(re.search(r"\b0\s*(?:years?|yrs?)\b", normalized)):
            level = "early-career / fresher"
            guidance = (
                "- Use familiar workplace situations and straightforward professional judgement.\n"
                "- Assess the selected professional skill in the job's context.\n"
                "- Do not require specialist knowledge, technical implementation, coding, or algorithms."
            )
        else:
            level = "as specified by the JD"
            guidance = (
                "- Match professional judgement and scenario complexity to the experience stated in the JD.\n"
                "- Do not substitute technical complexity for role-appropriate difficulty."
            )
        return f"""
EXPERIENCE REQUIREMENT — JD
- Original requirement: {normalized[:100] or "not specified"}
- Derived experience band: {level}

EXPERIENCE CALIBRATION FOR A NON-TECHNICAL ROLE
{guidance}
- Experience controls expected depth only; it does not override job domain, skill, section,
  difficulty, question type, manager guidance, or the question plan.
""".strip()

    if not normalized:
        return """
EXPERIENCE LEVEL
- No explicit experience requirement was supplied in the JD.
- Calibrate sophistication from the slot's section and difficulty only.
""".strip()

    numbers = [int(value) for value in re.findall(r"\d+", normalized)]

    if any(
        marker in normalized
        for marker in (
            "fresher",
            "freshers",
            "entry level",
            "entry-level",
        )
    ) or (numbers and max(numbers) == 0):
        level = "early-career / fresher"
        guidance = """
- Target foundational professional readiness.
- Prefer familiar concepts, common APIs/mechanisms, straightforward implementation,
  and single-step or simple multi-step reasoning.
- Avoid specialist architecture, obscure edge cases, and senior-level ownership.
""".strip()
    elif any(value >= 6 for value in numbers):
        level = "senior"
        guidance = """
- Target senior-level technical judgment.
- Use complex production situations, failure analysis, architecture/reliability/performance
  trade-offs, and competing constraints where appropriate.
- Avoid trivial recall unless the slot's hard constraints explicitly require it.
""".strip()
    elif any(value >= 4 for value in numbers):
        level = "upper-mid / experienced"
        guidance = """
- Target experienced professional judgment.
- Use production-style constraints, deeper debugging, performance/reliability considerations,
  and meaningful technical trade-offs.
- Avoid trivia and purely introductory questions.
""".strip()
    elif any(value >= 2 for value in numbers):
        level = "mid-level"
        guidance = """
- Target independent professional implementation ability.
- Use realistic implementation, debugging, performance awareness, and practical trade-offs.
- Require more than rote recall, but avoid unusually specialized architecture.
""".strip()
    elif any(value == 1 for value in numbers):
        level = "early-career"
        guidance = """
- Target practical early-career competence.
- Use common implementation tasks, routine debugging, familiar APIs, and modest reasoning.
- Avoid deep architecture and highly specialized production trade-offs.
""".strip()
    else:
        level = "unspecified"
        guidance = """
- Do not invent a seniority level when the requirement is not numerically clear.
- Let the slot's section and difficulty determine complexity.
""".strip()

    return f"""
EXPERIENCE REQUIREMENT — JD
- Original requirement: {experience_required}
- Derived experience band: {level}

EXPERIENCE CALIBRATION
{guidance}

IMPORTANT:
- Experience calibration controls sophistication and expected professional judgment.
- It MUST NOT override the required skill, section type, difficulty, question type,
  manager request, question plan, or other hard assessment constraints.
""".strip()


def generate_questions_from_skills(
    skills: list[dict[str, object]],
    number_of_questions: int,
    difficulty: Literal["easy", "medium", "hard"],
    excluded_question_texts: list[str] | None = None,
    regeneration_mode: bool = False,
    section_type: Literal["conceptual", "implementation", "free_text"] = "conceptual",
    question_type: Literal["MCQ", "FREE_TEXT"] | None = None,
    reference_question_text: str | None = None,
    pattern_reference_question_texts: list[str] | None = None,
    manager_prompt: str | None = None,
    generation_strategy: Literal["pattern", "balanced", "current"] = "balanced",
    generation_focus: Literal["auto", "concept", "scenario", "comparison", "code", "output", "debugging", "sql", "design", "applied"] = "auto",
    variation_instruction: str | None = None,
    manager_interpretation: ManagerPromptInterpretation | dict[str, object] | None = None,
    generation_plan: QuestionGenerationPlan | dict[str, object] | None = None,
    experience_required: str | None = None,
    skill_category: str = "technical",
    job_title: str | None = None,
    job_description: str | None = None,
) -> list[GeneratedQuestion]:
    """
    Generate structured questions for one semantic section and difficulty.

    The section type, question type and difficulty are independent authoring
    dimensions. Conceptual and implementation sections default to MCQ; free_text
    sections can explicitly request MCQ or FREE_TEXT. The optional JD experience
    requirement calibrates sophistication without changing hard slot constraints.
    """
    if not skills:
        raise ValueError(
            "At least one confirmed skill is required to generate questions."
        )

    if not isinstance(number_of_questions, int):
        raise ValueError("Number of questions must be an integer.")

    if (
        number_of_questions < MIN_GENERATED_QUESTIONS
        or number_of_questions > MAX_GENERATED_QUESTIONS
    ):
        raise ValueError(
            f"Number of questions must be between {MIN_GENERATED_QUESTIONS} "
            f"and {MAX_GENERATED_QUESTIONS}."
        )

    normalized_difficulty = difficulty.strip().lower()

    if normalized_difficulty not in {"easy", "medium", "hard"}:
        raise ValueError("Difficulty must be easy, medium, or hard.")

    normalized_section_type = _normalize_section_type(section_type)
    expected_question_type = _expected_question_type_for_section(
        normalized_section_type, question_type
    )
    normalized_skill_category = (
        "non_technical"
        if str(skill_category or "").strip().lower() == "non_technical"
        else "technical"
    )
    normalized_job_title = " ".join(str(job_title or "").strip().split())[:255] or None
    normalized_job_description = " ".join(str(job_description or "").strip().split())[:3500] or None

    normalized_strategy = str(generation_strategy or "balanced").strip().lower()
    if normalized_strategy not in {"pattern", "balanced", "current"}:
        raise ValueError("Generation strategy must be pattern, balanced, or current.")

    normalized_focus = str(generation_focus or "auto").strip().lower()
    if normalized_focus not in {"auto", "concept", "scenario", "comparison", "code", "output", "debugging", "sql", "design", "applied"}:
        raise ValueError("Generation focus must be auto, concept, scenario, comparison, code, output, debugging, sql, design, or applied.")

    experience_guidance = _experience_level_guidance(
        experience_required,
        normalized_skill_category,
    )

    # Slot-level authoring constraints take precedence over manager-selected focus.
    # Conceptual + Easy is always a simple conceptual pattern; manager guidance can
    # still refine the topic and emphasis but cannot switch the question into a
    # scenario, debugging, SQL, code, or other incompatible pattern.
    hard_pattern = _hard_pattern_for_slot(
        normalized_section_type,
        normalized_difficulty,
    )
    if hard_pattern is not None:
        normalized_focus = hard_pattern

    normalized_manager_prompt = None
    if manager_prompt is not None:
        normalized_manager_prompt = " ".join(str(manager_prompt).strip().split())
        if len(normalized_manager_prompt) > MAX_MANAGER_PROMPT_LENGTH:
            raise ValueError(
                f"Manager generation guidance must be {MAX_MANAGER_PROMPT_LENGTH} characters or fewer."
            )
        if not normalized_manager_prompt:
            normalized_manager_prompt = None

    manager_directives = _manager_prompt_directives(normalized_manager_prompt)

    interpreted_manager_intent = None
    if manager_interpretation is not None:
        try:
            interpreted_manager_intent = (
                manager_interpretation
                if isinstance(manager_interpretation, ManagerPromptInterpretation)
                else ManagerPromptInterpretation.model_validate(manager_interpretation)
            )
        except (ValidationError, TypeError, ValueError):
            interpreted_manager_intent = None

        if interpreted_manager_intent is not None and normalized_focus == "auto":
            # A single interpreted pattern can safely become the generation focus.
            # Multiple patterns or an explicit batch mix remain flexible so the
            # model can distribute them across the requested candidates.
            if len(interpreted_manager_intent.requested_patterns) == 1 and not interpreted_manager_intent.candidate_mix:
                normalized_focus = interpreted_manager_intent.requested_patterns[0]

    normalized_generation_plan = None
    if generation_plan is not None:
        try:
            normalized_generation_plan = (
                generation_plan
                if isinstance(generation_plan, QuestionGenerationPlan)
                else QuestionGenerationPlan.model_validate(generation_plan)
            )
        except (ValidationError, TypeError, ValueError):
            normalized_generation_plan = None

    if normalized_focus == "auto":
        if normalized_generation_plan is not None:
            # The planner has already selected the pattern for this candidate.
            # Use it instead of letting keyword order in the manager message
            # collapse a mixed batch onto its first-mentioned pattern.
            normalized_focus = normalized_generation_plan.pattern
        elif interpreted_manager_intent is not None and len(interpreted_manager_intent.requested_patterns) == 1 and not interpreted_manager_intent.candidate_mix:
            normalized_focus = interpreted_manager_intent.requested_patterns[0]
        else:
            normalized_focus = _infer_generation_focus_from_prompt(manager_prompt)
    # Section + difficulty is a hard authoring constraint.
    # Conceptual + Easy is always concept-focused regardless of manager-selected
    # focus, prompt keywords, or planner intent.
    if normalized_section_type == "conceptual" and normalized_difficulty == "easy":
        normalized_focus = "concept"

    # Non-technical job-skill classification is a domain constraint: don't let a
    # focus keyword such as "debugging" silently turn a sales/HR/operations question
    # into a programming assessment. Applied reasoning remains available.
    if normalized_skill_category == "non_technical" and normalized_focus in {
        "code", "output", "debugging", "sql", "design"
    }:
        normalized_focus = "concept" if hard_pattern is not None else "applied"

    # A hard slot pattern (currently Easy + Conceptual) takes precedence over
    # generic manager style preferences; do not force code into that slot.
    effective_style_prompt = None if hard_pattern is not None else normalized_manager_prompt
    effective_variation_instruction = None if hard_pattern is not None else variation_instruction
    requires_code_snippet, requires_output_prediction, code_format_guidance = (
        _code_generation_requirements(
            normalized_focus,
            effective_style_prompt,
            effective_variation_instruction,
        )
    )

    easy_conceptual_guardrail = ""
    if normalized_section_type == "conceptual" and normalized_difficulty == "easy" and normalized_focus == "concept":
        easy_conceptual_guardrail = """
EASY CONCEPTUAL SECTION — AUTHORING STYLE OVERRIDE
- This section is automatically easy and conceptual.
- Write a SHORT, DIRECT, FOUNDATIONAL MCQ.
- Test one familiar concept, principle, basic behavior, simple relationship, or straightforward distinction.
- The stem should normally be one sentence or two short sentences.
- Use minimal context only when it is needed to identify the concept.
- Do NOT invent a bakery, company, engineering team, customer, production incident, workload, outage, bug, or other story merely to make the question interesting.
- Do NOT turn the question into scenario-based, applied-reasoning, debugging, code, SQL, output-prediction, or design assessment.
- Do NOT require multi-step reasoning or an operational decision.
- Manager-provided examples may still be used when explicitly requested, but they must not force a scenario structure.
""".strip()

    normalized_skills: list[QuestionGenerationRequestContext] = []
    allowed_skills: dict[str, QuestionGenerationRequestContext] = {}

    for skill in skills:
        skill_id = skill.get("skill_id")
        skill_name = skill.get("skill_name")
        category = skill.get("category")

        if not isinstance(skill_id, int):
            raise ValueError("Invalid skill id supplied for generation.")

        if not isinstance(skill_name, str) or not skill_name.strip():
            raise ValueError("Invalid skill name supplied for generation.")

        if not isinstance(category, str) or not category.strip():
            category = "Other"

        context = QuestionGenerationRequestContext(
            skill_id=skill_id,
            skill_name=" ".join(skill_name.strip().split()),
            category=" ".join(category.strip().split()),
        )

        key = _normalize_generation_skill_name(context.skill_name)

        if key in allowed_skills:
            continue

        normalized_skills.append(context)
        allowed_skills[key] = context

    if not normalized_skills:
        raise ValueError(
            "At least one confirmed skill is required to generate questions."
        )

    skills_context = "\n".join(
        f"- Skill ID: {skill.skill_id}; Skill: {skill.skill_name}; Category: {skill.category}"
        for skill in normalized_skills
    )

    section_guidance = _section_type_generation_guidance(
        normalized_section_type,
        expected_question_type,
    )
    if normalized_skill_category == "non_technical":
        section_guidance = {
            "conceptual": (
                "Test foundational concepts, principles, or distinctions that matter to the "
                "confirmed job role and selected professional skill. Easy conceptual questions "
                "should be direct and role-relevant, not programming or computer-science trivia."
            ),
            "implementation": (
                "Test practical execution of a responsibility from the confirmed job description. "
                "Use realistic work situations and professional decisions; do not require code, SQL, "
                "or software debugging unless the JD explicitly calls for it."
            ),
            "free_text": (
                "Assess a candidate's explanation, professional judgement, customer/workplace "
                "communication, prioritization, or role-specific problem-solving in an open response. "
                "Provide explicit, role-relevant rubric guidance."
            ),
        }.get(normalized_section_type, section_guidance)
    difficulty_guidance = _difficulty_generation_guidance(
        normalized_difficulty
    )

    excluded_context = ""

    if excluded_question_texts:
        cleaned_exclusions = []

        for text in excluded_question_texts:
            if not isinstance(text, str):
                continue

            cleaned = " ".join(text.strip().split())

            if cleaned:
                cleaned_exclusions.append(cleaned)

        if cleaned_exclusions:
            capped_exclusions = []
            total_chars = 0
            for text in cleaned_exclusions:
                shortened = text[:360]
                if total_chars + len(shortened) > 2600:
                    break
                capped_exclusions.append(shortened)
                total_chars += len(shortened)
                if len(capped_exclusions) >= 8:
                    break

            excluded_lines = "\n".join(
                f"- {text}" for text in capped_exclusions
            )

            excluded_context = f"""
Existing questions to avoid:
{excluded_lines}

For every generated question:
- Do NOT repeat the wording of an existing question.
- Do NOT ask the same underlying knowledge point in different words.
- Do NOT create a near-paraphrase by swapping a few words, command names, or option order.
- Do NOT preserve the same scenario while changing only values, variable names, or surface wording.
- Change the tested concept, role-specific decision, workplace situation, customer concern, professional action, or mechanism appropriate to the job domain.
- The replacement must feel like a genuinely different assessment question in the confirmed role.
""".strip()

    reference_context = ""

    if reference_question_text:
        cleaned_reference = " ".join(reference_question_text.strip().split())
        if cleaned_reference:
            if normalized_skill_category == "non_technical":
                reference_context = f"""
Reference question currently assigned to this slot (style reference only):
{cleaned_reference}

Use only its response shape and approximate difficulty. Ignore its subject matter if it
conflicts with the confirmed job title, job description, or professional skill. Create new
role-relevant content for the same selected skill, section type, difficulty, and response format.
Do not import technical trivia from an older question.
""".strip()
            else:
                reference_context = f"""
Reference question currently assigned to this slot:
{cleaned_reference}

Use this question as a pattern exemplar. Preserve its useful assessment structure,
cognitive operation, approximate complexity and response format. Do NOT copy or paraphrase
its wording, code, values, options or knowledge target. Create different content for the
same skill, section type, difficulty and requested question type.
""".strip()

    pattern_context = ""

    cleaned_patterns: list[str] = []
    for pattern in pattern_reference_question_texts or []:
        if not isinstance(pattern, str):
            continue
        cleaned = " ".join(pattern.strip().split())
        if cleaned and cleaned.lower() not in {item.lower() for item in cleaned_patterns}:
            cleaned_patterns.append(cleaned)
        if len(cleaned_patterns) >= 3:
            break

    if cleaned_patterns:
        pattern_lines = "\n".join(f"- {item}" for item in cleaned_patterns)
        if normalized_skill_category == "non_technical":
            pattern_context = f"""
Pattern/reference examples (style only):
{pattern_lines}

PATTERN RECOGNITION RULE:
Use only broad response shape and difficulty as a style reference. Do not preserve code, SQL,
debugging, algorithm, or other technical content when it conflicts with the confirmed job role.
Choose new, role-relevant professional content for the selected skill.

The goal is: consistent response format, role-relevant new content.
""".strip()
        else:
            pattern_context = f"""
Pattern/reference examples:
{pattern_lines}

PATTERN RECOGNITION RULE:
Use these examples to infer the assessment pattern, not to copy content.
Preserve useful structure, cognitive operation, approximate difficulty, response depth,
code/output/debugging shape, and MCQ distractor style when appropriate.
Do NOT copy or paraphrase wording, code, values, identifiers, options, or the same
knowledge target. Choose different content within the requested skill and constraints.

The goal is: same pattern, different content.
""".strip()

    manager_guidance_context = ""

    structured_manager_context = _manager_interpretation_context(
        interpreted_manager_intent
    )
    generation_plan_context = _generation_plan_context(
        normalized_generation_plan
    )

    if normalized_manager_prompt:
        manager_style_hint = _manager_question_style_hint(normalized_manager_prompt)
        manager_guidance_context = f"""
MANAGER GUIDANCE — HIGH-PRIORITY AUTHORING PREFERENCE
---
{normalized_manager_prompt}
---

The manager intentionally supplied this guidance for this batch. Treat it as an explicit authoring preference and prioritize it when
choosing the knowledge target, question pattern, scenario, examples, edge cases, emphasis and wording,
provided that the hard assessment constraints remain satisfied.

Do NOT ignore the manager guidance merely because the reference questions are easier or
more generic. Use the reference questions for pattern/style only, then create materially
different content that reflects the manager's requested focus.

For example, if the manager asks for practical questions, prefer realistic applied scenarios
or implementation reasoning within the selected section type instead of defaulting to simple
definition questions. If the manager asks to avoid a topic, exclude it unless doing so would
violate a hard assessment constraint.

Do not allow this guidance to override the required skill, section type, difficulty, question
type, validation rules, duplicate-avoidance rules, or JSON output contract.
If the guidance asks for current/latest technology, use only current facts the model can state
with high confidence; never invent versions, releases, APIs, benchmarks, or announcements.
A verified retrieval layer can be used later for freshness-critical assessments.

{manager_style_hint}
""".strip()

    focus_context = f"""
MANAGER QUESTION FOCUS — PRIORITIZE THIS PATTERN
{_generation_focus_guidance(normalized_focus, normalized_section_type, expected_question_type)}

When a specific question focus is selected, the generated question must visibly implement that pattern.
Do not fall back to a generic definition question simply because it is easier to generate.
For a batch, keep the selected focus consistent while varying the underlying knowledge target.
""".strip()

    variation_context = str(variation_instruction or "").strip()

    strategy_context = {
        "pattern": (
            "Pattern-focused: closely follow the structure, cognitive operation, response depth and "
            "assessment style inferred from the reference examples while keeping content genuinely new."
        ),
        "balanced": (
            "Balanced: preserve the established assessment pattern while introducing useful variation and "
            "current practices when supported by the supplied manager guidance."
        ),
        "current": (
            "Current-focus: prioritize modern, practically relevant concepts within the target skill, while "
            "still respecting the reference pattern and never inventing unsupported current facts."
        ),
    }[normalized_strategy]

    diversity_instruction = ""

    if regeneration_mode:
        diversity_instruction = """
REGENERATION MODE:
This is a replacement for a question the manager did not keep.
Generate a genuinely new assessment target rather than rewriting the old question.
Preserve the requested skill, section type, and difficulty.
Prioritize conceptual diversity over superficial wording changes.
""".strip()

    manager_instruction = normalized_manager_prompt or "No additional manager instruction was provided."
    reference_instruction = pattern_context or reference_context or "No reference question was supplied."
    excluded_instruction = excluded_context or "No prior question text was supplied for exclusion."

    if normalized_skill_category == "non_technical":
        candidate_specific_requirements = """
- Execute the supplied question plan and assess the confirmed professional skill in the stated job role.
- For broad skills such as problem-solving, test a real workplace decision in this occupation rather than a generic puzzle.
- Keep the stem, answer options, and explanation inside the confirmed job domain and selected skill.
- For Sales Executive, make sales/customer context visible in the question stem, not only in the explanation or options.
- When the selected skill is problem-solving, focus on a sales problem such as a customer objection, lead qualification, unanswered follow-up, target shortfall, or mismatch with customer needs where supported by the JD.
- Do not use algorithms, greedy-choice properties, recursion, permutations, memoization, graph traversal, programming syntax, code snippets, SQL, memory leaks, compilers, or technical debugging unless explicitly required by the JD.
- If manager examples are supplied, adapt them naturally to the role without turning them into a technical analogy.
- For scenarios, describe a realistic role-specific situation and ask for an appropriate professional action.
- Do not invent products, customer policies, legal rules, tools, or job duties absent from the JD.
""".strip()
        mcq_output_rules = """
MCQ OUTPUT RULES
- Exactly four distinct options and exactly one clearly defensible correct answer.
- All options must address the same professional decision or concept.
- Distractors must be plausible professional mistakes, not programming or computer-science trivia.
- Keep options comparable in specificity, length, and grammar; do not make the correct option obvious by style.
- The explanation must justify the selected answer for the role and situation.
- correct_answer must be ONE label only: A, B, C, or D.

FREE_TEXT OUTPUT RULES
- options=[]
- correct_answer=null
- explanation contains concise, role-relevant scoring guidance and expected key points.
""".strip()
        retry_quality_requirements = """
For non-technical roles:
- Keep the stem, options, and explanation inside the confirmed job domain and selected skill.
- For Sales Executive, make sales/customer context visible in the question stem.
- Do not mention algorithms, greedy-choice properties, recursion, permutations, memoization, graph traversal, programming syntax, code snippets, SQL, memory leaks, compilers, or technical debugging unless explicitly required by the JD.
- For scenario questions, describe a realistic sales/workplace situation and ask for an appropriate professional action.
- Provide four distinct, plausible alternatives for the same professional decision, with one defensible best answer.
- Set correct_answer to ONE label only: A, B, C, or D. The server resolves the label to option text.
- For FREE_TEXT use options=[] and correct_answer=null.
- Create a new role-relevant knowledge target on retries.
""".strip()
    else:
        candidate_specific_requirements = """
- Execute this candidate's QUESTION PLAN directly; do not substitute a generic skill question.
- Think problem-first for scenario/applied patterns: identify the constraint, symptom, goal, or trade-off, then write the shortest story that creates that problem.
- For scenario questions, the story must create the technical decision. Do not add a decorative story around a generic technical question.
- A problem-story may be an everyday/business situation or a software/operational situation, depending on the skill.
- Do not force every question into a "company/team/developer" template.
- If the manager gives an example such as fruits and vegetables, use it as meaningful problem context when relevant: inventory, orders, deliveries, stock, quantities, capacity, or workload.
- Do not use fruits and vegetables as a decorative word or as a physical analogy for the technical concept.
- If efficiency is requested, the scenario must contain a real efficiency objective or constraint, and the answer must affect it.
- For Docker, natural problem contexts include a grocery inventory service, order service, checkout system, delivery service, or another system whose containers have a concrete operational problem.
- For Docker, a produce story must not be about boxes, packaging, crates, baskets, or shipping as an analogy for Docker.
- Use LeetCode-style problem framing when appropriate: a simple story, a concrete constraint, and a technical decision that follows naturally from that constraint.
- Keep easy questions short, concrete, and easy to parse. Make questions interesting through the problem setup, not through unnecessary complexity or filler.
- Do not invent random actors or backstory unrelated to the planned problem.
- The final question must remain technically correct, unambiguous, role-relevant, and answerable from the information given.
""".strip()
        mcq_output_rules = """
MCQ OUTPUT RULES
- exactly four distinct options
- exactly one correct answer
- all options address the same technical decision
- all options are plausible and comparable in specificity, structure and length
- no "None of the above"
- no obvious opposite pairs used as fake distractors
- no unrelated technical changes
- do not make the correct option the longest, most detailed, or grammatically unique option
- solve the technical problem before assigning correct_answer
- verify the selected answer directly resolves the symptom/constraint in the stem
- verify the explanation supports that exact selected option
- correct_answer must be ONE label only: A, B, C, or D

FREE_TEXT OUTPUT RULES
- options=[]
- correct_answer=null
- explanation contains concise evaluation guidance / expected key points
""".strip()
        retry_quality_requirements = """
If the plan example is "fruits and vegetables", put "fruit" or "vegetable" naturally in the QUESTION STEM, preferably in the first sentence.
For scenario questions, make the example the REAL SOFTWARE/PRODUCT CONTEXT. Example: "A fruit-and-vegetable shop's inventory API runs in a Docker container and CPU reaches 95% during the evening order rush." Do NOT use the example as a physical analogy such as packaging produce or reducing shipping boxes. Include an operational symptom/constraint and a concrete technical decision.
For MCQ use exactly four distinct options. All four options must be plausible alternatives for the SAME technical decision and must be different techniques/approaches, not opposites. Do not make the correct option longer, more specific, or grammatically unique. Before returning JSON, solve the problem independently and verify that the selected answer actually resolves the stated symptom/constraint; the explanation must support the same answer. Do not choose an answer merely because it is generally useful. For Docker image-size optimization, options should be comparable image-building or image-content techniques (for example, smaller base image, multi-stage build, removing unnecessary packages/cache, or excluding files with .dockerignore), not "larger base image" or an unrelated runtime change.
Set correct_answer to ONE label only: A, B, C, or D. The server resolves the label to the option text.
For FREE_TEXT use options=[] and correct_answer=null.
Create a different knowledge target from previous attempts.
""".strip()

    # Keep this prompt compact for reliable API generation. The manager's free-form
    # instruction is first-class input, while hard product constraints stay explicit.
    generation_plan_repair = ""
    if normalized_generation_plan is not None:
        plan = normalized_generation_plan
        if (
            normalized_section_type == "conceptual"
            and normalized_difficulty == "easy"
            and normalized_focus == "concept"
            and plan.pattern == "concept"
        ):
            if normalized_skill_category == "non_technical":
                target_execution_instruction = (
                    "- Use the planned role-specific professional target directly. Keep it a direct, "
                    "foundational concept check; do not import a computer-science topic."
                )
            else:
                target_execution_instruction = (
                    "- Use the technical target directly; do NOT convert it into a story, incident, "
                    "character, workload, or operational scenario."
                )
            generation_plan_repair = f"""
NON-NEGOTIABLE PLAN EXECUTION FOR THIS CANDIDATE:
- Pattern: concept. The question stem MUST be a short, direct conceptual check with minimal context.
- Problem: {plan.problem_target}.
- Knowledge target: {plan.knowledge_target}.
{target_execution_instruction}
- Do not add decorative scenario/context or an invented business setting.
- Cognitive operation: {plan.cognitive_operation}.
- Efficiency decision: {plan.efficiency_focus or "none specified"}.
"""
        else:
            generation_plan_repair = f"""
NON-NEGOTIABLE PLAN EXECUTION FOR THIS CANDIDATE:
- Pattern: {plan.pattern}. The question stem MUST implement the planned assessment pattern.
- Problem: {plan.problem_target}.
- Knowledge target: {plan.knowledge_target}.
- Scenario/context: {plan.scenario_context}.
- Storyline: {plan.storyline}.
- Efficiency decision: {plan.efficiency_focus or "none specified"}.
"""
        if plan.example_context:
            generation_plan_repair += (
                f"- Preferred manager example/context: {plan.example_context}. "
                "Use this naturally in the QUESTION STEM when it fits the planned storyline; "
                "do not force it into unrelated technical details and do not invent a different example. "
                'For "fruits and vegetables", prefer a natural context such as fruit and vegetable orders.\n'
            )
        if normalized_skill_category == "non_technical":
            generation_plan_repair += (
                "- Do not replace the planned role-specific target with a generic computer-science "
                "or technical question.\n"
                "- Keep the assessment grounded in the confirmed job role and JD.\n"
            )
        else:
            generation_plan_repair += (
                "- Do not replace the planned scenario with a generic technical question.\n"
                "- Do not invent a random actor or background that is unrelated to the planned problem.\n"
            )

    base_prompt = f"""
{_role_appropriate_authoring_system_prompt(normalized_skill_category)}

SECTION REQUIREMENTS
{section_guidance}

DIFFICULTY REQUIREMENTS
{difficulty_guidance}

{easy_conceptual_guardrail}

TASK FOR THIS CANDIDATE
Create exactly {number_of_questions} NEW assessment question(s).

HARD CONSTRAINTS — NEVER OVERRIDE
- Skill: {normalized_skills[0].skill_name}
- Section: {normalized_section_type}
- Difficulty: {normalized_difficulty}
- Question type: {expected_question_type}

{_role_domain_generation_guidance(
    skill_category=normalized_skill_category,
    skill_name=normalized_skills[0].skill_name,
    job_title=normalized_job_title,
    job_description=normalized_job_description,
)}

{experience_guidance}

MANAGER REQUEST
{manager_instruction}

STRUCTURED MANAGER INTERPRETATION
{manager_guidance_context or "No additional style interpretation was detected; follow the manager request directly."}

{structured_manager_context}

{generation_plan_context}

{generation_plan_repair}

QUESTION PATTERN
{focus_context}

CODE AND DISPLAY FORMAT REQUIREMENTS
{code_format_guidance}

GENERATION STRATEGY
{strategy_context}

REFERENCE QUESTIONS / PATTERN EXAMPLES
{reference_instruction}

QUESTIONS TO AVOID
{excluded_instruction}

VARIATION
{variation_context or "Use a different subtopic or reasoning task for each candidate."}

CANDIDATE-SPECIFIC REQUIREMENTS
{candidate_specific_requirements}
{mcq_output_rules}

OUTPUT — RETURN ONLY VALID JSON, NO MARKDOWN, NO COMMENTARY:
{{
  "questions": [
    {{
      "question_text": "...",
      "options": ["...", "...", "...", "..."],
      "correct_answer": "...",
      "explanation": "..."
    }}
  ]
}}

For FREE_TEXT use options=[] and correct_answer=null. Do not include any fields other than the four fields above.
""".strip()


    prompt = base_prompt
    last_error = ""

    for attempt in range(MAX_QUESTION_GENERATION_ATTEMPTS):
        if attempt > 0:
            prompt = f"""
RETRY THIS AUTHORING REQUEST.
The previous response failed validation: {last_error}

{_role_appropriate_authoring_system_prompt(normalized_skill_category)}

Hard constraints: skill={normalized_skills[0].skill_name}; section={normalized_section_type}; difficulty={normalized_difficulty}; question_type={expected_question_type}.
{_role_domain_generation_guidance(
    skill_category=normalized_skill_category,
    skill_name=normalized_skills[0].skill_name,
    job_title=normalized_job_title,
    job_description=normalized_job_description,
)}
{experience_guidance}
Manager request: {manager_instruction}
Manager interpretation: {manager_guidance_context or "Follow the manager request directly."}
Question plan: {generation_plan_context or "No separate question plan was supplied; choose a genuinely different target."}
{generation_plan_repair}
Question pattern: {focus_context}
Code/display requirements:
{code_format_guidance}
{easy_conceptual_guardrail}
For Easy Conceptual questions, do not add a scenario merely to avoid a direct question; keep the stem short and foundational.
Do not fall back to a generic definition/purpose question when the manager explicitly requested scenario, troubleshooting, comparison or applied reasoning.
The repaired question MUST visibly execute the supplied plan.
{retry_quality_requirements}
""".strip()

        try:
            raw_text = _call_llm_chat(
                prompt,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "evalyn_question_generation",
                        "strict": True,
                        "schema": QUESTION_GENERATION_JSON_SCHEMA,
                    },
                },
                temperature=0.55 if regeneration_mode else 0.40,
                timeout=GROQ_QUESTION_TIMEOUT_SECONDS,
                reasoning_effort="low",
                max_completion_tokens=1500 if requires_code_snippet else 900,
            )

            parsed_data = _extract_json_payload(raw_text)

            if isinstance(parsed_data, dict) and isinstance(parsed_data.get("questions"), list):
                normalized_questions = []
                for item in parsed_data["questions"]:
                    if not isinstance(item, dict):
                        normalized_questions.append(item)
                        continue
                    candidate = dict(item)

                    # The backend owns hard authoring constraints. Do not make the
                    # local model repeat these correctly just to pass schema validation.
                    candidate["difficulty"] = normalized_difficulty
                    candidate["section_type"] = normalized_section_type
                    candidate["question_type"] = expected_question_type
                    candidate.setdefault("options", [])
                    candidate.setdefault("correct_answer", None)
                    candidate.setdefault("explanation", None)

                    if candidate.get("question_text") is not None and not isinstance(candidate.get("question_text"), str):
                        candidate["question_text"] = str(candidate["question_text"])

                    if candidate.get("skill_name") is None:
                        candidate["skill_name"] = normalized_skills[0].skill_name
                    elif not isinstance(candidate.get("skill_name"), str):
                        candidate["skill_name"] = str(candidate["skill_name"])

                    if candidate.get("correct_answer") is not None and not isinstance(candidate.get("correct_answer"), str):
                        candidate["correct_answer"] = str(candidate["correct_answer"])
                    if candidate.get("explanation") is not None and not isinstance(candidate.get("explanation"), str):
                        candidate["explanation"] = str(candidate["explanation"])

                    # Some model responses return MCQ options as an object keyed
                    # by A/B/C/D even when asked for an array. Convert that harmlessly.
                    if isinstance(candidate.get("options"), dict):
                        option_map = candidate["options"]
                        candidate["options"] = [
                            option_map[key]
                            for key in ("A", "B", "C", "D", "a", "b", "c", "d")
                            if key in option_map
                        ][:4]
                    elif not isinstance(candidate.get("options"), list):
                        candidate["options"] = []

                    candidate["options"] = [
                        value if isinstance(value, str) else str(value)
                        for value in candidate["options"]
                    ]
                    normalized_questions.append(candidate)
                parsed_data = {"questions": normalized_questions}

            raw_questions = parsed_data.get("questions") if isinstance(parsed_data, dict) else None
            if not isinstance(raw_questions, list):
                raise ValueError("Groq response did not contain a questions array.")

            normalized_questions: list[GeneratedQuestion] = []
            item_parse_errors: list[str] = []

            for index, item in enumerate(raw_questions):
                if not isinstance(item, dict):
                    item_parse_errors.append(f"Candidate {index + 1} was not a JSON object.")
                    continue

                candidate = dict(item)
                # The backend owns the hard constraints. The model does not need to
                # spend tokens repeating metadata that the server has already selected.
                candidate["difficulty"] = normalized_difficulty
                candidate["section_type"] = normalized_section_type
                candidate["question_type"] = expected_question_type
                candidate.setdefault("options", [])
                candidate.setdefault("correct_answer", None)
                candidate.setdefault("explanation", None)

                if candidate.get("question_text") is not None and not isinstance(candidate.get("question_text"), str):
                    candidate["question_text"] = str(candidate["question_text"])
                if candidate.get("skill_name") is None:
                    candidate["skill_name"] = normalized_skills[0].skill_name
                elif not isinstance(candidate.get("skill_name"), str):
                    candidate["skill_name"] = str(candidate["skill_name"])
                if candidate.get("correct_answer") is not None and not isinstance(candidate.get("correct_answer"), str):
                    candidate["correct_answer"] = str(candidate["correct_answer"])
                if candidate.get("explanation") is not None and not isinstance(candidate.get("explanation"), str):
                    candidate["explanation"] = str(candidate["explanation"])

                if isinstance(candidate.get("options"), dict):
                    option_map = candidate["options"]
                    candidate["options"] = [
                        option_map[key]
                        for key in ("A", "B", "C", "D", "a", "b", "c", "d")
                        if key in option_map
                    ][:4]
                elif not isinstance(candidate.get("options"), list):
                    candidate["options"] = []

                candidate["options"] = [
                    value if isinstance(value, str) else str(value)
                    for value in candidate["options"]
                ]

                try:
                    normalized_questions.append(
                        GeneratedQuestion.model_validate(candidate)
                    )
                except ValidationError as exc:
                    item_parse_errors.append(
                        f"Candidate {index + 1} schema validation failed: {exc}"
                    )

            if not normalized_questions:
                raise ValueError(
                    "No structurally valid candidates were present in the Groq response."
                )

        except (
            json.JSONDecodeError,
            ValidationError,
            TypeError,
            ValueError,
        ) as exc:
            last_error = f"Structured response parsing failed: {exc}"
            continue

        validated_questions: list[GeneratedQuestion] = []
        candidate_errors: list[str] = list(locals().get("item_parse_errors", []))
        directives = _manager_prompt_directives(normalized_manager_prompt)
        requested_focuses = (
            []
            if interpreted_manager_intent is not None or hard_pattern is not None
            else list(directives.get("focuses") or [])
        )

        for generated_question in normalized_questions:
            try:
                candidate_text = _normalize_question_text_for_storage(
                    generated_question.question_text
                )
                if normalized_skill_category == "non_technical":
                    stem_leakage = find_non_technical_domain_leakage(
                        candidate_text,
                        job_title=normalized_job_title,
                        job_description=normalized_job_description,
                    )
                    candidate_material = "\n".join(
                        [
                            candidate_text,
                            *generated_question.options,
                            generated_question.correct_answer or "",
                            generated_question.explanation or "",
                        ]
                    )
                    option_leakage = find_non_technical_domain_leakage(
                        candidate_material,
                        job_title=normalized_job_title,
                        job_description=normalized_job_description,
                    )
                    leakage = list(dict.fromkeys(stem_leakage + option_leakage))
                    if leakage:
                        raise LLMResponseError(
                            "Generated question is outside the confirmed non-technical role domain; "
                            "unrelated technical content detected: "
                            + ", ".join(leakage)
                            + "."
                        )
                if requires_code_snippet and not _has_fenced_code_snippet(candidate_text):
                    raise LLMResponseError(
                        "Generated coding question did not include a non-empty Markdown fenced code block."
                    )
                if requires_output_prediction and not re.search(
                    r"\b(output|print(?:ed|s)?|return(?:s|ed)?|result|query result)\b",
                    candidate_text,
                    flags=re.IGNORECASE,
                ):
                    raise LLMResponseError(
                        "Generated output-prediction question did not explicitly ask about the code's output or result."
                    )

                focus_matches = (
                    _matches_non_technical_generation_focus(
                        generated_question,
                        normalized_focus,
                    )
                    if normalized_skill_category == "non_technical"
                    else _matches_generation_focus(
                        generated_question,
                        normalized_focus,
                        normalized_section_type,
                    )
                )
                if not focus_matches:
                    raise LLMResponseError(
                        f"Generated question did not follow the requested {normalized_focus} question focus."
                    )

                if requested_focuses and not any(
                    _matches_manager_focus_strict(generated_question, focus, normalized_section_type)
                    for focus in requested_focuses
                ):
                    raise LLMResponseError(
                        "Generated question did not implement the manager-requested question pattern."
                    )

                practical_focuses = {
                    "scenario", "comparison", "code", "output",
                    "debugging", "sql", "design", "applied",
                }
                if normalized_focus in practical_focuses and _question_is_definition_like(
                    generated_question.question_text
                ):
                    raise LLMResponseError(
                        f"Generated question is definition-style, but the requested {normalized_focus} focus requires an applied assessment task."
                    )

                if directives.get("avoid_definition") and _question_is_definition_like(
                    generated_question.question_text
                ):
                    raise LLMResponseError(
                        "Generated question is definition-style, but the manager explicitly asked to avoid definition-only questions."
                    )

                # Quality checks that inspect a generation plan need the actual
                # selected MCQ answer text, not the compact A/B/C/D label that the
                # model is asked to return. Canonicalize only for quality inspection;
                # _validate_generated_question remains the final authoritative
                # normalizer and persistence contract.
                question_for_quality = generated_question
                if (
                    generated_question.question_type.strip().upper() == "MCQ"
                    and len(generated_question.options) == 4
                    and generated_question.correct_answer
                ):
                    answer_token = generated_question.correct_answer.strip()
                    letter_match = re.fullmatch(r"[A-Da-d]", answer_token)
                    numeric_match = re.fullmatch(r"[1-4]", answer_token)
                    answer_index = None
                    if letter_match:
                        answer_index = ord(answer_token.upper()) - ord("A")
                    elif numeric_match:
                        answer_index = int(answer_token) - 1

                    if answer_index is not None and 0 <= answer_index < 4:
                        question_for_quality = generated_question.model_copy(
                            update={"correct_answer": generated_question.options[answer_index]}
                        )

                plan_quality_errors = _generation_plan_quality_errors(
                    question_for_quality,
                    normalized_generation_plan,
                )
                if normalized_skill_category == "non_technical":
                    plan_quality_errors.extend(
                        _non_technical_question_quality_errors(
                            question_for_quality,
                            job_title=normalized_job_title,
                            excluded_question_texts=excluded_question_texts,
                        )
                    )
                if plan_quality_errors:
                    raise LLMResponseError("; ".join(dict.fromkeys(plan_quality_errors)))

                if _question_targets_are_too_similar(
                    generated_question.question_text,
                    excluded_question_texts,
                ):
                    raise LLMResponseError(
                        "Generated question is too close to an existing question's underlying knowledge target."
                    )

                validated_questions.append(
                    _validate_generated_question(
                        generated_question,
                        allowed_skills,
                        normalized_difficulty,
                        normalized_section_type,
                        expected_question_type,
                    )
                )
            except LLMResponseError as exc:
                candidate_errors.append(str(exc))

        if len(validated_questions) == number_of_questions:
            return validated_questions

        # Local models often produce one useful candidate and one malformed/repetitive
        # candidate. Preserve the useful output and let the authoring service ask for
        # the missing candidates rather than converting a partial response into a 503.
        if validated_questions:
            return validated_questions

        last_error = (
            "No generated candidates passed validation. Issues: "
            f"{', '.join(candidate_errors[:4]) or 'unknown validation error'}"
        )
        continue

    raise LLMResponseError(
        "Unable to generate questions that satisfy the requested structure after "
        f"{MAX_GENERATION_ATTEMPTS} attempts. Last issue: {last_error or 'unknown model response'}"
    )