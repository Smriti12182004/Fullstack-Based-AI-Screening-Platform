from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


# Supabase's transaction pooler can leave stale connections in a local
# long-running FastAPI process. Keep the pool small, recycle connections
# regularly, and fail fast when either connection acquisition or a PostgreSQL
# statement becomes unhealthy.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_timeout=5,
    connect_args={
        "connect_timeout": 5,
        "options": "-c statement_timeout=7000",
    },
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """Provide a database session for FastAPI requests."""
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()