import requests


BASE_URL = "http://127.0.0.1:8000"

MANAGER_EMAIL = "s4_assessment_manager@test.com"
REVIEWER_EMAIL = "s4_assessment_reviewer@test.com"
PASSWORD = "Test@12345"

# Existing rejected question from the previous test.
QUESTION_ID = 384


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
    # 1. Reviewer can view the Question Bank
    # ---------------------------------------------------------
    response = requests.get(
        f"{BASE_URL}/questions",
        headers=reviewer_headers,
        timeout=10,
    )

    print("\nREVIEWER VIEW QUESTION BANK")
    print(response.status_code)
    print(response.text[:1000])

    assert response.status_code == 200

    # ---------------------------------------------------------
    # 2. Reviewer cannot create a question
    # ---------------------------------------------------------
    response = requests.post(
        f"{BASE_URL}/questions",
        headers=reviewer_headers,
        json={
            "question_text": "Reviewer must not create this question.",
            "question_type": "MCQ",
            "skill_id": 4,
            "difficulty": "medium",
            "options": [
                "A",
                "B",
                "C",
                "D",
            ],
            "correct_answer": "A",
        },
        timeout=10,
    )

    print("\nREVIEWER CREATE QUESTION")
    print(response.status_code)
    print(response.text)

    assert response.status_code == 403

    # ---------------------------------------------------------
    # 3. Reviewer cannot edit a question
    # ---------------------------------------------------------
    response = requests.put(
        f"{BASE_URL}/questions/{QUESTION_ID}",
        headers=reviewer_headers,
        json={
            "question_text": "Reviewer must not edit this question.",
            "question_type": "MCQ",
            "skill_id": 4,
            "difficulty": "medium",
            "options": [
                "A",
                "B",
                "C",
                "D",
            ],
            "correct_answer": "A",
        },
        timeout=10,
    )

    print("\nREVIEWER UPDATE QUESTION")
    print(response.status_code)
    print(response.text)

    assert response.status_code == 403

    # ---------------------------------------------------------
    # 4. Manager cannot approve
    # ---------------------------------------------------------
    response = requests.post(
        f"{BASE_URL}/questions/{QUESTION_ID}/approve",
        headers=manager_headers,
        timeout=10,
    )

    print("\nMANAGER APPROVE QUESTION")
    print(response.status_code)
    print(response.text)

    assert response.status_code == 403

    # ---------------------------------------------------------
    # 5. Manager cannot reject
    # ---------------------------------------------------------
    response = requests.post(
        f"{BASE_URL}/questions/{QUESTION_ID}/reject",
        headers=manager_headers,
        json={
            "rejection_reason": "Manager must not reject questions.",
        },
        timeout=10,
    )

    print("\nMANAGER REJECT QUESTION")
    print(response.status_code)
    print(response.text)

    assert response.status_code == 403

    print("\n========================================")
    print("REVIEWER PERMISSIONS TEST PASSED")
    print("========================================")


if __name__ == "__main__":
    main()