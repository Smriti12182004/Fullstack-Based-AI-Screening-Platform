
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.router import api_router
from app.core.config import settings


app = FastAPI(
    title=settings.app_name,
    description="Backend API for the Fullstack-Based AI Screening Platform",
    version=settings.app_version,
)


# Preserve local development origins and allow the configured frontend URL.
# Set FRONTEND_BASE_URL in the deployed backend environment.
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

frontend_origin = settings.frontend_base_url.rstrip("/")

if frontend_origin and frontend_origin not in allowed_origins:
    allowed_origins.append(frontend_origin)


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(api_router)
