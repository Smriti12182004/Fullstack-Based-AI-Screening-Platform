from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from html import escape
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.core.config import settings
from app.db.session import get_db
from app.schemas.assessment_hr_delivery import (
    HRDeliveryActivationRequest,
    HRDeliveryAddCandidatesRequest,
    HRDeliveryActivationResponse,
    HRCandidateListResponse,
    HRCandidateCreateRequest,
    HRCandidateCreateResponse,
    HRCandidateInvitationRevokeResponse,
    HRAssessmentInvitationResponse,
    CandidateInvitationValidationRequest,
    CandidateInvitationValidationResponse,
)
from app.schemas.assessment_hr_inbox import AssessmentHRInboxResponse
from app.services.assessment_delivery.hr_delivery_service import (
    HRDeliveryServiceError,
    activate_hr_assessment_delivery,
    add_candidates_to_active_hr_assessment,
    get_hr_candidates,
    create_hr_candidate,
    revoke_hr_candidate_invitation,
    send_hr_assessment_invitations,
    validate_candidate_assessment_invitation,
)
from app.services.assessment_delivery.hr_inbox_service import (
    AssessmentHRInboxServiceError,
    get_hr_assessment_inbox,
)


router = APIRouter(
    prefix="/assessment-delivery",
    tags=["Assessment Delivery - HR"],
)


@router.get(
    "/hr/assessments",
    response_model=AssessmentHRInboxResponse,
)
def get_hr_assessment_inbox_endpoint(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    """Return the approved assessment packages for the authenticated HR user."""
    try:
        items = get_hr_assessment_inbox(
            db=db,
            recruiter_id=current_user["user_id"],
        )
    except AssessmentHRInboxServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return AssessmentHRInboxResponse(items=items)


@router.get(
    "/hr/candidates",
    response_model=HRCandidateListResponse,
)
def get_hr_candidate_options(
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=100, ge=1, le=100),
    exclude_assessment_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    """List verified candidates and HR-invited accounts with active setup links."""
    try:
        items = get_hr_candidates(
            db=db,
            recruiter_id=current_user["user_id"],
            search=search,
            limit=limit,
            exclude_assessment_id=exclude_assessment_id,
        )
    except HRDeliveryServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc

    return HRCandidateListResponse(
        items=items,
        limit=min(limit, 100),
    )


@router.post(
    "/hr/candidates",
    response_model=HRCandidateCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_hr_candidate_endpoint(
    request: HRCandidateCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    """Add a candidate by full name and email and send an account-setup link."""
    try:
        result = create_hr_candidate(
            db=db,
            recruiter_id=current_user["user_id"],
            full_name=request.full_name,
            email=str(request.email),
        )
    except HRDeliveryServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc
    return HRCandidateCreateResponse(**result)


@router.delete(
    "/hr/candidates/{candidate_id}/invitation",
    response_model=HRCandidateInvitationRevokeResponse,
)
def revoke_hr_candidate_invitation_endpoint(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    """Revoke a pending invitation created by the authenticated recruiter."""
    try:
        result = revoke_hr_candidate_invitation(
            db=db,
            recruiter_id=current_user["user_id"],
            candidate_id=candidate_id,
        )
    except HRDeliveryServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc

    return HRCandidateInvitationRevokeResponse(**result)


@router.post(
    "/hr/assessments/{assessment_id}/activate",
    response_model=HRDeliveryActivationResponse,
    status_code=status.HTTP_200_OK,
)
def activate_hr_assessment_delivery_endpoint(
    assessment_id: int,
    request: HRDeliveryActivationRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    """Activate a reviewer-handed-off assessment and create selected assignments."""
    try:
        result = activate_hr_assessment_delivery(
            db=db,
            assessment_id=assessment_id,
            recruiter_id=current_user["user_id"],
            candidate_ids=request.candidate_ids,
            opens_at=request.opens_at,
            closes_at=request.closes_at,
        )
    except HRDeliveryServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc

    return HRDeliveryActivationResponse(**result)


@router.post(
    "/hr/assessments/{assessment_id}/add-candidates",
    response_model=HRDeliveryActivationResponse,
    status_code=status.HTTP_200_OK,
)
def add_candidates_to_active_hr_assessment_endpoint(
    assessment_id: int,
    request: HRDeliveryAddCandidatesRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    """Add missed candidates to active delivery using the original schedule."""
    try:
        result = add_candidates_to_active_hr_assessment(
            db=db,
            assessment_id=assessment_id,
            recruiter_id=current_user["user_id"],
            candidate_ids=request.candidate_ids,
        )
    except HRDeliveryServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc

    return HRDeliveryActivationResponse(**result)


@router.post(
    "/hr/assessments/{assessment_id}/send-invitations",
    response_model=HRAssessmentInvitationResponse,
)
def send_hr_assessment_invitations_endpoint(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("recruiter")),
):
    """Send or resend emails for existing assignments without recreating them."""
    try:
        result = send_hr_assessment_invitations(
            db=db,
            assessment_id=assessment_id,
            recruiter_id=current_user["user_id"],
        )
    except HRDeliveryServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc
    return HRAssessmentInvitationResponse(**result)


@router.get(
    "/candidate-invitation-page",
    response_class=HTMLResponse,
    include_in_schema=False,
)
def candidate_assessment_invitation_page():
    """Serve a token-in-fragment landing page so the token is not in access logs."""
    login_url = escape(f"{settings.frontend_base_url.rstrip('/')}/login", quote=True)
    html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evalyn Assessment Invitation</title>
<style>body{{margin:0;padding:24px;background:#f5f7fc;font-family:Arial,Helvetica,sans-serif;color:#26284f}}main{{max-width:620px;margin:6vh auto;background:white;border:1px solid #e2e5ef;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(38,40,79,.08)}}header{{padding:24px 30px;background:#26284f;color:white;font-size:24px;font-weight:700}}section{{padding:30px}}.eyebrow{{font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#5658e8;font-weight:700}}h1{{margin:8px 0 12px;font-size:26px}}p{{font-size:14px;line-height:1.7;color:#667085}}.details{{margin:24px 0;padding:18px;border:1px solid #e3e5fa;border-radius:12px;background:#f8f8ff}}.line{{display:flex;justify-content:space-between;gap:20px;padding:8px 0;font-size:14px;border-bottom:1px solid #e9eafa}}.line:last-child{{border-bottom:0}}.value{{font-weight:700;color:#26284f;text-align:right}}.button{{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:10px;background:#5658e8;color:white;text-decoration:none;font-weight:700}}.status{{margin:14px 0;padding:12px;border-radius:10px;background:#f3f4f8;color:#555b72}}</style></head>
<body><main><header>Evalyn</header><section><div class="eyebrow">Candidate assessment invitation</div><h1 id="heading">Checking your invitation…</h1><p id="intro">This secure link checks the assessment assigned to you. It will not start a timed attempt.</p><div id="status" class="status" role="status">Validating invitation…</div><div id="details" class="details" hidden><div class="line"><span>Assessment</span><span id="title" class="value"></span></div><div class="line"><span>Role</span><span id="job" class="value"></span></div><div class="line"><span>Questions</span><span id="questions" class="value"></span></div><div class="line"><span>Duration</span><span id="duration" class="value"></span></div><div class="line"><span>Opens (UTC)</span><span id="opens" class="value"></span></div><div class="line"><span>Closes (UTC)</span><span id="closes" class="value"></span></div></div><p id="instructions" hidden>Before you begin, make sure you have a stable internet connection and enough uninterrupted time. Sign in to Evalyn and open My Assessments. Your timer begins only after you explicitly select Start Assessment.</p><a id="login" class="button" href="{login_url}" hidden>Sign in to Evalyn</a></section></main>
<script>
const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
window.history.replaceState(null, '', window.location.pathname);
const $ = (id) => document.getElementById(id);
const formatDate = (value) => new Date(value).toLocaleString(undefined, {{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}}) + ' UTC';
(async () => {{
  if (!token) {{ $('heading').textContent='Invitation link is missing'; $('status').textContent='Open the complete invitation link from your email.'; return; }}
  try {{
    const response = await fetch('/assessment-delivery/candidate-invitations/validate', {{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{token}})}});
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'This invitation is invalid or expired.');
    $('heading').textContent=data.assessment_title;
    $('intro').textContent=data.job_title;
    $('title').textContent=data.assessment_title;
    $('job').textContent=data.job_title;
    $('questions').textContent=data.question_count + ' questions';
    $('duration').textContent=data.duration_minutes ? data.duration_minutes + ' minutes' : 'See instructions after signing in';
    $('opens').textContent=formatDate(data.opens_at);
    $('closes').textContent=formatDate(data.closes_at);
    $('details').hidden=false;
    $('status').textContent=data.message;
    $('instructions').hidden=false;
    $('login').hidden=false;
    if (data.window_status === 'closed') {{ $('login').hidden=true; }}
  }} catch (error) {{ $('heading').textContent='Invitation unavailable'; $('status').textContent=error.message || 'This invitation is invalid or expired. Contact your recruiter for help.'; }}
}})();
</script></body></html>'''
    return HTMLResponse(
        html,
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post(
    "/candidate-invitations/validate",
    response_model=CandidateInvitationValidationResponse,
    include_in_schema=False,
)
def validate_candidate_assessment_invitation_endpoint(
    request: CandidateInvitationValidationRequest,
    db: Session = Depends(get_db),
):
    """Validate the unique invitation token; this does not authenticate or start an attempt."""
    try:
        result = validate_candidate_assessment_invitation(
            db=db,
            token=request.token,
        )
    except HRDeliveryServiceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc
    return CandidateInvitationValidationResponse(**result)
