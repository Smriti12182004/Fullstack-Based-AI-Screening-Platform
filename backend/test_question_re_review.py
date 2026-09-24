import requests
from uuid import uuid4


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

    unique_id = uuid4().hex[:8]

    # ---------------------------------------------------------
    # 1. Manager creates question
    # ---------------------------------------------------------
    create_response = requests.post(
        f"{BASE_URL}/questions",
        headers=manager_headers,
        json={
            "question_text": (
                f"Re-review lifecycle test {unique_id}: "
                "Which keyword defines a Python function?"
            ),
            "question_type": "MCQ",
            "skill_id": SKILL_ID,
            "difficulty": "medium",
            "options": [
                "def",
                "func",
                "define",
                "function",
            ],
            "correct_answer": "def",
        },
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

    # ---------------------------------------------------------
    # 2. Reviewer approves it
    # ---------------------------------------------------------
    approve_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/approve",
        headers=reviewer_headers,
        timeout=10,
    )

    print("\nINITIAL APPROVAL")
    print(approve_response.status_code)
    print(approve_response.text)

    assert approve_response.status_code == 200

    approved = approve_response.json()

    assert approved["status"] == "approved"
    assert approved["reviewed_by"] == 45
    assert approved["reviewed_at"] is not None

    # ---------------------------------------------------------
    # 3. Manager edits approved question
    # ---------------------------------------------------------
    update_response = requests.put(
        f"{BASE_URL}/questions/{question_id}",
        headers=manager_headers,
        json={
            "question_text": (
                f"UPDATED re-review lifecycle test {unique_id}: "
                "Which Python keyword is used to define a function?"
            ),
            "question_type": "MCQ",
            "skill_id": SKILL_ID,
            "difficulty": "medium",
            "options": [
                "def",
                "func",
                "define",
                "function",
            ],
            "correct_answer": "def",
        },
        timeout=10,
    )

    print("\nMANAGER EDITS APPROVED QUESTION")
    print(update_response.status_code)
    print(update_response.text)

    assert update_response.status_code == 200

    updated = update_response.json()

    assert updated["status"] == "pending_review"
    assert updated["reviewed_by"] is None
    assert updated["reviewed_at"] is None
    assert updated["rejection_reason"] is None

    print("\nREVIEW RESET SUCCESSFUL")
    print(f"Status: {updated['status']}")
    print(f"Reviewed By: {updated['reviewed_by']}")
    print(f"Reviewed At: {updated['reviewed_at']}")
    print(f"Rejection Reason: {updated['rejection_reason']}")

    # ---------------------------------------------------------
    # 4. Reviewer approves edited question again
    # ---------------------------------------------------------
    second_approval_response = requests.post(
        f"{BASE_URL}/questions/{question_id}/approve",
        headers=reviewer_headers,
        timeout=10,
    )

    print("\nSECOND REVIEWER APPROVAL")
    print(second_approval_response.status_code)
    print(second_approval_response.text)

    assert second_approval_response.status_code == 200

    final_question = second_approval_response.json()

    assert final_question["status"] == "approved"
    assert final_question["reviewed_by"] == 45
    assert final_question["reviewed_at"] is not None

    print("\n========================================")
    print("RE-REVIEW LIFECYCLE TEST PASSED")
    print("========================================")


if __name__ == "__main__":
    main()