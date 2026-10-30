from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.api.routes import auth as auth_route
from app.db.session import get_db
from app.main import app
from app.models.user import User


class FakeInvitedUser:
    def __init__(self, role="assessment_manager"):
        self.id = 77
        self.username = "test_manager_77"
        self.full_name = "Test Manager"
        self.email = "manager-activation@example.com"
        self.role = role
        self.is_email_verified = False
        self.password_hash = "temporary-hash"
        self.invitation_token_hash = "stored-token-hash"
        self.invitation_token_expires_at = (
            datetime.now(timezone.utc) + timedelta(days=1)
        )
        self.invitation_token_sent_at = datetime.now(timezone.utc)
        self.verification_otp_hash = "old-otp-hash"
        self.verification_otp_expires_at = datetime.now(timezone.utc)
        self.verification_otp_sent_at = datetime.now(timezone.utc)
        self.verification_otp_attempts = 0


class FakeQuery:
    def __init__(self, user):
        self.user = user

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def one_or_none(self):
        return self.user


class FakeDB:
    def __init__(self, user):
        self.user = user
        self.commit_calls = 0
        self.refresh_calls = 0

    def query(self, model):
        assert model is User
        return FakeQuery(self.user)

    def commit(self):
        self.commit_calls += 1

    def refresh(self, user):
        self.refresh_calls += 1


@pytest.fixture
def activation_context(monkeypatch):
    user = FakeInvitedUser()
    db = FakeDB(user)

    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(
        auth_route,
        "hash_password",
        lambda password: "test-hash",
    )

    try:
        with TestClient(app) as client:
            yield client, db, user
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_invited_manager_keeps_role_after_activation(activation_context):
    client, db, user = activation_context

    response = client.post(
        "/auth/activate-candidate-invitation",
        json={
            "token": "test-invitation-token-long-enough",
            "password": "SecureTestPassword123!",
        },
    )

    assert response.status_code == 200
    assert response.json()["role"] == "assessment_manager"
    assert user.role == "assessment_manager"
    assert user.is_email_verified is True
    assert user.password_hash == "test-hash"
    assert user.invitation_token_hash is None
    assert user.invitation_token_expires_at is None
    assert db.commit_calls == 1
    assert db.refresh_calls == 1


def test_unknown_invitation_is_rejected(monkeypatch):
    db = FakeDB(None)
    app.dependency_overrides[get_db] = lambda: db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/activate-candidate-invitation",
                json={
                    "token": "unknown-invitation-token-long-enough",
                    "password": "SecureTestPassword123!",
                },
            )

        assert response.status_code == 400
        assert db.commit_calls == 0
    finally:
        app.dependency_overrides.pop(get_db, None)
