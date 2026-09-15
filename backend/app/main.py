from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    description="Backend API for the Fullstack-Based AI Screening Platform",
    version=settings.app_version,
)

app.include_router(api_router)