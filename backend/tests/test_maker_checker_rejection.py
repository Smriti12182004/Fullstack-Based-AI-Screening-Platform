import sys
from pathlib import Path
from uuid import uuid4

import requests

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import SessionLocal
from app.models import Question


BASE_URL = "http://127.0.0.1:8000"

MANAGER_EMAIL = "s4_assessment_manager@test.com"
REVIEWER_EMAIL = "s4_assessment_reviewer@test.com"
PASSWORD = "Test@12345"

SKILL_ID = 4


def login(email: str) -> str:
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "email": email,
            "password": PASSWORD,
        },
        timeout=10,
    )

    print(f"LOGIN {email}: {response.status_code}")
    print(response.text)

    response.raise_for_status()

    return response.json()["access_token"]


def main() -> None:
    manager_token = login(MANAGER_EMAIL)
    reviewer_token = login(REVIEWER_EMAIL)

    manager_headers = {
        "Authorization": f"Bearer {manager_token}",
    }

    reviewer_headers = {
        "Authorization": f"Bearer {reviewer_token}",
    }

    # ---------------------------------------------------------
    # 1. Manager creates a question
    # ---------------------------------------------------------
    unique_id = uuid4().hex[:8]

    payload = {
        "question_text": (
            f"Rejection test {unique_id}: "
            "Which Python keyword defines a function?"
        ),
        "question_type": "MCQ",
        "skill_id": SKILL_ID,
        "difficulty": "easy",
        "options": [
            "def",
            "class",
            "return",
            "import",
        ],
        "correct_answer": "def",
    }

    create_response = requests.post(
        f"{BASE_URL}/questions",
        headers=manager_headers,
        json=payload,
        timeout=10,
    )

    print("\nCREATE QUESTION")
    print(create_response.status_code)
    print(create_response.text)

    assert create_response.status_code == 201

    question = create_response.json()
    question_id = question["id"]

    assert question["status"] == "pending_review"
    assert question["created_by"] == 44
    assert question["reviewed_by"] is None
    assert question["reviewed_at"] is None
    assert question["rejection_reason"] is None

    print(f"\nCreated Question ID: {question_id}")

    # ---------------------------------------------------------
    # 2. Manager cannot reject own question
    # ---------------------------------------------------------
    self_reject_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/reject",
        headers=manager_headers,
        json={
            "rejection_reason": "Manager must not reject own question.",
        },
        timeout=10,
    )

    print("\nMANAGER SELF-REJECTION")
    print(self_reject_response.status_code)
    print(self_reject_response.text)

    assert self_reject_response.status_code == 403

    # ---------------------------------------------------------
    # 3. Reviewer rejects the question
    # ---------------------------------------------------------
    rejection_reason = (
        "The question is too basic for the configured assessment "
        "difficulty."
    )

    reviewer_reject_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/reject",
        headers=reviewer_headers,
        json={
            "rejection_reason": rejection_reason,
        },
        timeout=10,
    )

    print("\nREVIEWER REJECTION")
    print(reviewer_reject_response.status_code)
    print(reviewer_reject_response.text)

    assert reviewer_reject_response.status_code == 200

    rejected_question = reviewer_reject_response.json()

    assert rejected_question["status"] == "rejected"
    assert rejected_question["created_by"] == 44
    assert rejected_question["reviewed_by"] == 45
    assert rejected_question["reviewed_at"] is not None
    assert rejected_question["rejection_reason"] == rejection_reason

    print("\nRejection successful.")
    print(f"Status: {rejected_question['status']}")
    print(f"Created By: {rejected_question['created_by']}")
    print(f"Reviewed By: {rejected_question['reviewed_by']}")
    print(f"Reviewed At: {rejected_question['reviewed_at']}")
    print(f"Reason: {rejected_question['rejection_reason']}")

    # ---------------------------------------------------------
    # 4. Verify directly in database
    # ---------------------------------------------------------
    db = SessionLocal()

    try:
        db_question = db.get(Question, question_id)

        assert db_question is not None
        assert db_question.status == "rejected"
        assert db_question.created_by == 44
        assert db_question.reviewed_by == 45
        assert db_question.reviewed_at is not None
        assert db_question.rejection_reason == rejection_reason

        print("\nDATABASE VERIFICATION")
        print(f"Question ID: {db_question.id}")
        print(f"Status: {db_question.status}")
        print(f"Created By: {db_question.created_by}")
        print(f"Reviewed By: {db_question.reviewed_by}")
        print(f"Reviewed At: {db_question.reviewed_at}")
        print(f"Rejection Reason: {db_question.rejection_reason}")

    finally:
        db.close()

    print("\n========================================")
    print("MAKER-CHECKER REJECTION TEST PASSED")
    print("========================================")


if __name__ == "__main__":
    main()