from fastapi import APIRouter

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.assessments import router as assessments_router
from app.api.routes.admin import router as admin_router
from app.api.routes.questions import router as questions_router
from app.api.routes.question_sets import router as question_sets_router
from app.api.routes.sections import router as sections_router

from app.api.routes.question_set_configurations import (
    router as question_set_configurations_router,
)


api_router = APIRouter()


api_router.include_router(health_router)
api_router.include_router(jobs_router)
api_router.include_router(auth_router)
api_router.include_router(assessments_router)
api_router.include_router(admin_router)
api_router.include_router(questions_router)
api_router.include_router(question_sets_router)
api_router.include_router(sections_router)
api_router.include_router(
    question_set_configurations_router
)