from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    notification_type: str
    title: str
    message: str
    entity_type: str | None = None
    entity_id: int | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int


class NotificationReadAllResponse(BaseModel):
    updated_count: int


class NotificationListQuery(BaseModel):
    unread_only: bool = False
    limit: int = Field(
        default=50,
        ge=1,
        le=100,
    )