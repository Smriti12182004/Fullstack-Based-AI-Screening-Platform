from typing import Literal


UserRole = Literal[
    "organization_admin",
    "recruiter",
    "assessment_manager",
    "assessment_reviewer",
    "candidate",
]


VALID_ROLES: tuple[str, ...] = (
    "organization_admin",
    "recruiter",
    "assessment_manager",
    "assessment_reviewer",
    "candidate",
)