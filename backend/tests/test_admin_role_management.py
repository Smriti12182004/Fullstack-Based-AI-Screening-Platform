import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.user import User


class FakeUser:
    def __init__(self, user_id, email, role):
        self.id = user_id
        self.email = email
        self.role = role
        self.created_at = None
        self.updated_at = None


class FakeDB:
    def __init__(self, target):
        self.target = target
        self.get_calls = 0
        self.commit_calls = 0

    def get(self, model, user_id):
        self.get_calls += 1
        assert model is User

        if self.target is not None and self.target.id == user_id:
            return self.target

        return None

    def commit(self):
        self.commit_calls += 1

    def refresh(self, user):
        pass


@pytest.fixture
def role_test_context():
    target = FakeUser(2, "test-target@example.com", "candidate")
    db = FakeDB(target)
    principal = {
        "user_id": 1,
        "role": "organization_admin",
    }

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: principal

    try:
        with TestClient(app) as client:
            yield client, db, target, principal
    finally:
        app.dependency_overrides.clear()


def test_admin_can_update_user_role(role_test_context):
    client, db, target, _ = role_test_context

    response = client.put(
        "/admin/users/2/role",
        json={"role": "assessment_manager"},
    )

    assert response.status_code == 200
    assert response.json()["role"] == "assessment_manager"
    assert target.role == "assessment_manager"
    assert db.commit_calls == 1


def test_non_admin_cannot_update_user_role(role_test_context):
    client, db, target, principal = role_test_context
    principal["role"] = "recruiter"

    response = client.put(
        "/admin/users/2/role",
        json={"role": "assessment_manager"},
    )

    assert response.status_code == 403
    assert target.role == "candidate"
    assert db.commit_calls == 0
    assert db.get_calls == 0


def test_invalid_role_is_rejected(role_test_context):
    client, db, target, _ = role_test_context

    response = client.put(
        "/admin/users/2/role",
        json={"role": "superuser"},
    )

    assert response.status_code == 422
    assert target.role == "candidate"
    assert db.commit_calls == 0
    assert db.get_calls == 0


def test_admin_cannot_change_own_role(role_test_context):
    client, db, _, _ = role_test_context

    response = client.put(
        "/admin/users/1/role",
        json={"role": "candidate"},
    )

    assert response.status_code == 400
    assert db.commit_calls == 0
    assert db.get_calls == 0


def test_missing_user_returns_404(role_test_context):
    client, db, _, _ = role_test_context

    response = client.put(
        "/admin/users/999/role",
        json={"role": "assessment_reviewer"},
    )

    assert response.status_code == 404
    assert db.commit_calls == 0
