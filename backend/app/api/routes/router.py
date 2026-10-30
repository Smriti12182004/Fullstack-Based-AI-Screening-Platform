from fastapi import APIRouter

from app.api.routes.admin import router as admin_router
from app.api.routes.assessments import router as assessments_router
from app.api.routes.assessment_reviews import router as assessment_reviews_router
from app.api.routes.assessment_authoring import (
    router as assessment_authoring_router,
)
from app.api.routes.assessment_delivery import (
    router as assessment_delivery_router,
)
from app.api.routes.assessment_delivery_hr import (
    router as assessment_delivery_hr_router,
)
from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
from app.api.routes.job_collaboration import router as job_collaboration_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.proctoring import router as proctoring_router
from app.api.routes.question_banks import router as question_banks_router
from app.api.routes.question_set_configurations import (
    router as question_set_configurations_router,
)
from app.api.routes.question_sets import router as question_sets_router
from app.api.routes.questions import router as questions_router
from app.api.routes.question_ideas import router as question_ideas_router
from app.api.routes.sections import router as sections_router
from app.api.routes.skills import router as skills_router


from app.api.routes.ecompass import router as ecompass_router

api_router = APIRouter()

api_router.include_router(health_router)
api_router.include_router(job_collaboration_router)
api_router.include_router(notifications_router)
api_router.include_router(question_banks_router)
api_router.include_router(jobs_router)
api_router.include_router(auth_router)
api_router.include_router(assessments_router)
api_router.include_router(assessment_reviews_router)
api_router.include_router(assessment_authoring_router)
api_router.include_router(assessment_delivery_router)
api_router.include_router(assessment_delivery_hr_router)
api_router.include_router(proctoring_router)
api_router.include_router(admin_router)
api_router.include_router(questions_router)
api_router.include_router(question_ideas_router)
api_router.include_router(question_sets_router)
api_router.include_router(sections_router)
api_router.include_router(question_set_configurations_router)
api_router.include_router(skills_router)
api_router.include_router(ecompass_router)