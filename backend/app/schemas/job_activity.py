from datetime import datetime

from pydantic import BaseModel


class JobActivityResponse(BaseModel):
    id: int
    job_id: int
    user_id: int | None
    action: str
    entity_type: str
    entity_id: int | None
    details: str | None
    created_at: datetime