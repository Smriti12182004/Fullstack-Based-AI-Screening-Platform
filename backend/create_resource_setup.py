from app.db.session import SessionLocal
from app.models import User, Assessment, Attempt
from app.core.security import hash_password

db = SessionLocal()

candidate2 = User(
    email="candidate2@test.com",
    password_hash=hash_password("candidate2"),
    role="candidate"
)

db.add(candidate2)
db.flush()

assessment2 = Assessment(
    job_id=726,
    title="ML Engineer - Candidate 2 Assessment",
    status="active"
)

db.add(assessment2)
db.flush()

attempt2 = Attempt(
    assessment_id=assessment2.id,
    candidate_id=candidate2.id
)

db.add(attempt2)
db.commit()

print("Candidate 2 ID:", candidate2.id)
print("Assessment 2 ID:", assessment2.id)
print("Attempt 2 ID:", attempt2.id)

db.close()
