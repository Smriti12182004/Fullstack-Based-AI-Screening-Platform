import sys
from pathlib import Path
from uuid import uuid4

import requests

# Allow imports from backend/app
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

    data = response.json()

    assert data["access_token"]
    return data["access_token"]


def main() -> None:
    # ---------------------------------------------------------
    # 1. Login as Assessment Manager
    # ---------------------------------------------------------
    manager_token = login(MANAGER_EMAIL)

    manager_headers = {
        "Authorization": f"Bearer {manager_token}",
    }

    # ---------------------------------------------------------
    # 2. Login as Assessment Reviewer
    # ---------------------------------------------------------
    reviewer_token = login(REVIEWER_EMAIL)

    reviewer_headers = {
        "Authorization": f"Bearer {reviewer_token}",
    }

    # ---------------------------------------------------------
    # 3. Assessment Manager creates a question
    # ---------------------------------------------------------
    unique_id = uuid4().hex[:8]

    payload = {
        "question_text": (
            f"Maker checker test question {unique_id}: "
            "Which Python collection stores unique values?"
        ),
        "question_type": "MCQ",
        "skill_id": SKILL_ID,
        "difficulty": "easy",
        "options": [
            "List",
            "Tuple",
            "Set",
            "Dictionary",
        ],
        "correct_answer": "Set",
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

    assert create_response.status_code == 201, (
        f"Question creation failed: "
        f"{create_response.status_code} {create_response.text}"
    )

    created_question = create_response.json()

    question_id = created_question["id"]

    assert created_question["status"] == "pending_review"
    assert created_question["created_by"] is not None
    assert created_question["reviewed_by"] is None
    assert created_question["reviewed_at"] is None

    print(f"\nCreated Question ID: {question_id}")
    print("Status: pending_review")
    print(f"Created By: {created_question['created_by']}")

    # ---------------------------------------------------------
    # 4. Assessment Manager must NOT approve own question
    # ---------------------------------------------------------
    manager_approve_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/approve",
        headers=manager_headers,
        timeout=10,
    )

    print("\nMANAGER SELF-APPROVAL")
    print(manager_approve_response.status_code)
    print(manager_approve_response.text)

    assert manager_approve_response.status_code == 403

    # ---------------------------------------------------------
    # 5. Assessment Reviewer approves the question
    # ---------------------------------------------------------
    reviewer_approve_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/approve",
        headers=reviewer_headers,
        timeout=10,
    )

    print("\nREVIEWER APPROVAL")
    print(reviewer_approve_response.status_code)
    print(reviewer_approve_response.text)

    assert reviewer_approve_response.status_code == 200

    approved_question = reviewer_approve_response.json()

    assert approved_question["status"] == "approved"
    assert approved_question["reviewed_by"] is not None
    assert approved_question["reviewed_at"] is not None

    print("\nApproval successful.")
    print(f"Status: {approved_question['status']}")
    print(f"Created By: {approved_question['created_by']}")
    print(f"Reviewed By: {approved_question['reviewed_by']}")
    print(f"Reviewed At: {approved_question['reviewed_at']}")

    # ---------------------------------------------------------
    # 6. Verify audit fields directly in database
    # ---------------------------------------------------------
    db = SessionLocal()

    try:
        question = db.get(Question, question_id)

        assert question is not None

        print("\nDATABASE VERIFICATION")
        print(f"Question ID: {question.id}")
        print(f"Status: {question.status}")
        print(f"Created By: {question.created_by}")
        print(f"Reviewed By: {question.reviewed_by}")
        print(f"Reviewed At: {question.reviewed_at}")

        assert question.status == "approved"
        assert question.created_by is not None
        assert question.reviewed_by is not None
        assert question.reviewed_at is not None
        assert question.created_by != question.reviewed_by

    finally:
        db.close()

    print("\n========================================")
    print("MAKER-CHECKER TEST PASSED")
    print("========================================")


if __name__ == "__main__":
    main()