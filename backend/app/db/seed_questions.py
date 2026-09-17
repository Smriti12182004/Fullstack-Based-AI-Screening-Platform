from app.db.session import SessionLocal
from app.models import Question, Skill
from app.services.question_service import create_question


SEED_SKILLS = [
    "python",
    "sql",
    "machine learning",
    "deep learning",
    "statistics",
]


SEED_QUESTIONS = [
    {
        "skill": "python",
        "question_text": "Which data type is immutable in Python?",
        "question_type": "MCQ",
        "difficulty": "easy",
        "options": ["List", "Dictionary", "Tuple", "Set"],
        "correct_answer": "Tuple",
    },
    {
        "skill": "python",
        "question_text": "What does the len() function return for a Python list?",
        "question_type": "MCQ",
        "difficulty": "medium",
        "options": [
            "The last index",
            "The number of elements",
            "The memory address",
            "The data type",
        ],
        "correct_answer": "The number of elements",
    },
    {
        "skill": "sql",
        "question_text": "Which SQL clause is used to filter rows?",
        "question_type": "MCQ",
        "difficulty": "easy",
        "options": ["ORDER BY", "WHERE", "GROUP BY", "JOIN"],
        "correct_answer": "WHERE",
    },
    {
        "skill": "sql",
        "question_text": "Which SQL function returns the number of rows in a result set?",
        "question_type": "MCQ",
        "difficulty": "medium",
        "options": ["SUM()", "COUNT()", "TOTAL()", "ROWS()"],
        "correct_answer": "COUNT()",
    },
    {
        "skill": "machine learning",
        "question_text": "Which type of learning uses labeled training data?",
        "question_type": "MCQ",
        "difficulty": "easy",
        "options": [
            "Supervised learning",
            "Unsupervised learning",
            "Reinforcement learning",
            "Random learning",
        ],
        "correct_answer": "Supervised learning",
    },
    {
        "skill": "machine learning",
        "question_text": "Which metric is commonly used to evaluate a classification model?",
        "question_type": "MCQ",
        "difficulty": "medium",
        "options": ["Accuracy", "Mean", "Variance", "Range"],
        "correct_answer": "Accuracy",
    },
    {
        "skill": "deep learning",
        "question_text": "Which structure is commonly used to represent layers in a neural network?",
        "question_type": "MCQ",
        "difficulty": "easy",
        "options": [
            "Neurons",
            "Tables",
            "Queries",
            "Indexes",
        ],
        "correct_answer": "Neurons",
    },
    {
        "skill": "deep learning",
        "question_text": "Which activation function is commonly used in hidden layers of neural networks?",
        "question_type": "MCQ",
        "difficulty": "medium",
        "options": ["ReLU", "COUNT", "JOIN", "SORT"],
        "correct_answer": "ReLU",
    },
    {
        "skill": "statistics",
        "question_text": "Which measure represents the middle value of an ordered dataset?",
        "question_type": "MCQ",
        "difficulty": "easy",
        "options": ["Mean", "Median", "Variance", "Range"],
        "correct_answer": "Median",
    },
    {
        "skill": "statistics",
        "question_text": "What does standard deviation measure?",
        "question_type": "MCQ",
        "difficulty": "medium",
        "options": [
            "Central tendency",
            "Data dispersion",
            "Sample size",
            "Data type",
        ],
        "correct_answer": "Data dispersion",
    },
]


def get_or_create_skill(db, skill_name: str) -> Skill:
    """Return an existing skill or create it when missing."""
    skill = (
        db.query(Skill)
        .filter(Skill.name == skill_name)
        .first()
    )

    if skill is None:
        skill = Skill(name=skill_name)
        db.add(skill)
        db.flush()

    return skill


def seed_questions() -> None:
    """Load the curated S2-04 question set into the question bank."""
    db = SessionLocal()
    inserted_count = 0
    skipped_count = 0

    try:
        skills = {
            skill_name: get_or_create_skill(db, skill_name)
            for skill_name in SEED_SKILLS
        }

        for seed in SEED_QUESTIONS:
            skill = skills[seed["skill"]]

            existing = (
                db.query(Question)
                .filter(
                    Question.skill_id == skill.id,
                    Question.question_text
                    == seed["question_text"],
                )
                .first()
            )

            if existing is not None:
                skipped_count += 1
                continue

            create_question(
                db=db,
                question_text=seed["question_text"],
                question_type=seed["question_type"],
                skill_id=skill.id,
                difficulty=seed["difficulty"],
                options=seed["options"],
                correct_answer=seed["correct_answer"],
            )
            inserted_count += 1

        print(
            "Seed process completed. "
            f"Inserted: {inserted_count}, "
            f"Skipped: {skipped_count}."
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed_questions()