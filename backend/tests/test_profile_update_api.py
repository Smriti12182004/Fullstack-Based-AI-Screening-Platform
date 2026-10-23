
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import auth
from app.schemas.auth import ProfileUpdateRequest


class FakeSession:
    def __init__(self, user):
        self.user = user
        self.committed = False
        self.refreshed = False

    def get(self, model, user_id):
        assert user_id == self.user.id
        return self.user

    def query(self, _entity):
        return self

    def filter(self, *_conditions):
        return self

    def first(self):
        return None

    def commit(self):
        self.committed = True

    def refresh(self, user):
        assert user is self.user
        self.refreshed = True


def make_user(**overrides):
    values = {
        "id": 7,
        "username": "evalyn_user",
        "full_name": "Evalyn User",
        "phone_number": None,
        "job_title": None,
        "department": None,
        "location": None,
        "bio": None,
        "email": "evalyn@example.com",
        "role": "recruiter",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_profile_update_schema_accepts_all_editable_profile_fields():
    payload = ProfileUpdateRequest(
        full_name="Evalyn User",
        username="evalyn_user",
        phone_number="+91 98765 43210",
        job_title="Talent Acquisition Manager",
        department="People Operations",
        location="Pune, India",
        bio="A short professional introduction.",
    )

    assert payload.phone_number == "+91 98765 43210"
    assert payload.job_title == "Talent Acquisition Manager"
    assert payload.department == "People Operations"
    assert payload.location == "Pune, India"
    assert payload.bio == "A short professional introduction."


def test_profile_update_schema_enforces_optional_field_limits():
    with pytest.raises(ValidationError):
        ProfileUpdateRequest(phone_number="1" * 31)
    with pytest.raises(ValidationError):
        ProfileUpdateRequest(job_title="x" * 101)
    with pytest.raises(ValidationError):
        ProfileUpdateRequest(department="x" * 101)
    with pytest.raises(ValidationError):
        ProfileUpdateRequest(location="x" * 121)
    with pytest.raises(ValidationError):
        ProfileUpdateRequest(bio="x" * 501)


def test_profile_response_includes_persisted_optional_details(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(
        auth,
        "_profile_photo_path",
        lambda _user_id: tmp_path / "missing.webp",
    )
    user = make_user(
        phone_number="+91 98765 43210",
        job_title="Talent Acquisition Manager",
        department="People Operations",
        location="Pune, India",
        bio="Professional introduction.",
    )

    response = auth._profile_response(user)

    assert response["phone_number"] == "+91 98765 43210"
    assert response["job_title"] == "Talent Acquisition Manager"
    assert response["department"] == "People Operations"
    assert response["location"] == "Pune, India"
    assert response["bio"] == "Professional introduction."
    assert response["email"] == "evalyn@example.com"
    assert response["role"] == "recruiter"
    assert response["has_profile_photo"] is False


def test_profile_update_persists_all_fields_and_normalizes_whitespace(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(
        auth,
        "_profile_photo_path",
        lambda _user_id: tmp_path / "missing.webp",
    )
    user = make_user()
    db = FakeSession(user)
    payload = ProfileUpdateRequest(
        full_name="  Evalyn User  ",
        username="evalyn_user",
        phone_number="  +91 98765 43210  ",
        job_title="  Talent Acquisition Manager  ",
        department="  People Operations  ",
        location="  Pune, India  ",
        bio="  First line.\nSecond line.  ",
    )

    response = auth.update_my_profile(
        payload,
        db=db,
        current_user={"user_id": user.id},
    )

    assert user.full_name == "Evalyn User"
    assert user.phone_number == "+91 98765 43210"
    assert user.job_title == "Talent Acquisition Manager"
    assert user.department == "People Operations"
    assert user.location == "Pune, India"
    assert user.bio == "First line.\nSecond line."
    assert response["bio"] == "First line.\nSecond line."
    assert db.committed is True
    assert db.refreshed is True


def test_omitted_profile_fields_are_preserved_and_blank_values_clear_fields(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(
        auth,
        "_profile_photo_path",
        lambda _user_id: tmp_path / "missing.webp",
    )
    user = make_user(
        phone_number="+91 98765 43210",
        job_title="Existing title",
        department="Existing department",
        location="Existing location",
        bio="Existing bio",
    )
    db = FakeSession(user)

    response = auth.update_my_profile(
        ProfileUpdateRequest(
            job_title="  Updated title  ",
            phone_number="   ",
        ),
        db=db,
        current_user={"user_id": user.id},
    )

    assert user.job_title == "Updated title"
    assert user.phone_number is None
    assert user.department == "Existing department"
    assert user.location == "Existing location"
    assert user.bio == "Existing bio"
    assert response["department"] == "Existing department"


def test_profile_update_rejects_empty_patch(monkeypatch, tmp_path):
    monkeypatch.setattr(
        auth,
        "_profile_photo_path",
        lambda _user_id: tmp_path / "missing.webp",
    )
    user = make_user()
    db = FakeSession(user)

    with pytest.raises(HTTPException) as exc_info:
        auth.update_my_profile(
            ProfileUpdateRequest(),
            db=db,
            current_user={"user_id": user.id},
        )

    assert exc_info.value.status_code == 400
    assert db.committed is False
