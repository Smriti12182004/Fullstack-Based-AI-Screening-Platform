from app.db.base import Base
from app.db.session import engine
from app.models import Job, User  # noqa: F401


def init_db() -> None:
    """Create database tables that do not already exist."""
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully.")