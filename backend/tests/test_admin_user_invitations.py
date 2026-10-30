import pytest
from fastapi.testclient import TestClient

from app.api.routes import admin as admin_route
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.services.email_service import EmailServiceError


class FakeQuery:
    def __init__(self, db, entity):
        self.db = db
        self.entity = entity

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        if self.entity is User:
            return self.db.existing_user
        return None


class FakeDB:
    def __init__(self, existing_user=None):
        self.existing_user = existing_user
        self.added_user = None
        self.deleted_user = None
        self.commit_calls = 0

    def query(self, entity):
        return FakeQuery(self, entity)

    def add(self, user):
        self.added_user = user

    def commit(self):
        self.commit_calls += 1
        if self.added_user is not None and self.added_user.id is None:
            self.added_user.id = 501

    def refresh(self, user):
        if user.id is None:
            user.id = 501

    def delete(self, user):
        self.deleted_user = user


class ExistingUser:
    def __init__(self):
        self.id = 42
        self.email = "existing@example.com"


@pytest.fixture
def invitation_context(monkeypatch):
    db = FakeDB()
    principal = {
        "user_id": 1,
        "role": "organization_admin",
    }
    sent_emails = []

    def fake_send_email(**kwargs):
        sent_emails.append(kwargs)

    monkeypatch.setattr(
        admin_route,
        "send_role_activation_email",
        fake_send_email,
    )

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: principal

    try:
        yield TestClient(app), db, principal, sent_emails
    finally:
        app.dependency_overrides.clear()


def test_admin_can_invite_assessment_manager(invitation_context):
    client, db, _, sent_emails = invitation_context

    response = client.post(
        "/admin/users/invite",
        json={
            "full_name": "Test Manager",
            "email": "manager-test@example.com",
            "role": "assessment_manager",
        },
    )

    assert response.status_code == 201
    assert response.json()["role"] == "assessment_manager"
    assert db.added_user is not None
    assert db.added_user.role == "assessment_manager"
    assert db.added_user.invitation_token_hash
    assert db.added_user.invitation_token_sent_at is not None
    assert len(sent_emails) == 1
    assert sent_emails[0]["user_role"] == "assessment_manager"


def test_non_admin_cannot_invite_users(invitation_context):
    client, db, principal, sent_emails = invitation_context
    principal["role"] = "recruiter"

    response = client.post(
        "/admin/users/invite",
        json={
            "full_name": "Test Manager",
            "email": "manager-test@example.com",
            "role": "assessment_manager",
        },
    )

    assert response.status_code == 403
    assert db.added_user is None
    assert sent_emails == []


def test_invitation_rejects_invalid_role(invitation_context):
    client, db, _, sent_emails = invitation_context

    response = client.post(
        "/admin/users/invite",
        json={
            "full_name": "Test User",
            "email": "invalid-role@example.com",
            "role": "superuser",
        },
    )

    assert response.status_code == 422
    assert db.added_user is None
    assert sent_emails == []


def test_invitation_rejects_existing_email(invitation_context):
    client, db, _, sent_emails = invitation_context
    db.existing_user = ExistingUser()

    response = client.post(
        "/admin/users/invite",
        json={
            "full_name": "Existing User",
            "email": "existing@example.com",
            "role": "assessment_reviewer",
        },
    )

    assert response.status_code == 409
    assert db.added_user is None
    assert sent_emails == []


def test_failed_invitation_email_returns_service_error(
    invitation_context,
    monkeypatch,
):
    client, db, _, _ = invitation_context

    def fail_email(**kwargs):
        raise EmailServiceError("Simulated email failure")

    monkeypatch.setattr(
        admin_route,
        "send_role_activation_email",
        fail_email,
    )

    response = client.post(
        "/admin/users/invite",
        json={
            "full_name": "Test Reviewer",
            "email": "reviewer-test@example.com",
            "role": "assessment_reviewer",
        },
    )

    assert response.status_code == 503
    assert db.deleted_user is not None
