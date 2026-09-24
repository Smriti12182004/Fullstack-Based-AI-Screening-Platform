import requests

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

    print(f"\nLOGIN: {email}")
    print("Status:", response.status_code)
    print(response.json())

    response.raise_for_status()

    return response.json()["access_token"]


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
    # 3. Manager creates a new question
    # ---------------------------------------------------------
    payload = {
        "question_text": (
            "Maker checker rejection test: "
            "What does len() return for a Python list?"
        ),
        "question_type": "MCQ",
        "skill_id": SKILL_ID,
        "difficulty": "medium",
        "options": [
            "Number of elements",
            "Memory size in bytes",
            "Last index",
            "Number of methods",
        ],
        "correct_answer": "Number of elements",
    }

    create_response = requests.post(
        f"{BASE_URL}/questions",
        headers=manager_headers,
        json=payload,
        timeout=10,
    )

    print("\nCREATE QUESTION")
    print("Status:", create_response.status_code)
    print(create_response.json())

    assert create_response.status_code == 201

    question = create_response.json()

    question_id = question["id"]

    assert question["status"] == "pending_review"
    assert question["created_by"] == 44
    assert question["reviewed_by"] is None
    assert question["reviewed_at"] is None

    print("Created Question ID:", question_id)

    # ---------------------------------------------------------
    # 4. Manager must NOT reject own question
    # ---------------------------------------------------------
    self_reject_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/reject",
        headers=manager_headers,
        json={
            "rejection_reason": "Manager self-rejection test.",
        },
        timeout=10,
    )

    print("\nMANAGER SELF-REJECTION")
    print("Status:", self_reject_response.status_code)
    print(self_reject_response.json())

    assert self_reject_response.status_code == 403

    # ---------------------------------------------------------
    # 5. Reviewer rejects the question
    # ---------------------------------------------------------
    rejection_reason = (
        "Question wording is ambiguous and should be revised "
        "before it is included in the assessment."
    )

    reject_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/reject",
        headers=reviewer_headers,
        json={
            "rejection_reason": rejection_reason,
        },
        timeout=10,
    )

    print("\nREVIEWER REJECTION")
    print("Status:", reject_response.status_code)
    print(reject_response.json())

    assert reject_response.status_code == 200

    rejected_question = reject_response.json()

    assert rejected_question["status"] == "rejected"
    assert rejected_question["created_by"] == 44
    assert rejected_question["reviewed_by"] == 45
    assert rejected_question["reviewed_at"] is not None
    assert rejected_question["rejection_reason"] == rejection_reason

    print("\nRejection successful.")
    print("Status:", rejected_question["status"])
    print("Created By:", rejected_question["created_by"])
    print("Reviewed By:", rejected_question["reviewed_by"])
    print("Reviewed At:", rejected_question["reviewed_at"])
    print("Rejection Reason:", rejected_question["rejection_reason"])

    # ---------------------------------------------------------
    # 6. Verify directly in database
    # ---------------------------------------------------------
    db = SessionLocal()

    try:
        stored_question = db.get(
            Question,
            question_id,
        )

        assert stored_question is not None

        print("\nDATABASE VERIFICATION")
        print("Question ID:", stored_question.id)
        print("Status:", stored_question.status)
        print("Created By:", stored_question.created_by)
        print("Reviewed By:", stored_question.reviewed_by)
        print("Reviewed At:", stored_question.reviewed_at)
        print(
            "Rejection Reason:",
            stored_question.rejection_reason,
        )

        assert stored_question.status == "rejected"
        assert stored_question.created_by == 44
        assert stored_question.reviewed_by == 45
        assert stored_question.reviewed_at is not None
        assert stored_question.rejection_reason == rejection_reason

    finally:
        db.close()

    print("\n========================================")
    print("MAKER-CHECKER REJECTION TEST PASSED")
    print("========================================")


if __name__ == "__main__":
    main()