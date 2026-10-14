import logging
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from html import escape

from app.core.config import settings


logger = logging.getLogger(__name__)


class EmailServiceError(Exception):
    """Raised when an email cannot be sent."""


def _send_email(message: EmailMessage) -> None:
    """Send an email using the configured SMTP server."""
    try:
        with smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=15,
        ) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(
                settings.smtp_username,
                settings.smtp_password,
            )
            server.send_message(message)

    except (smtplib.SMTPException, OSError) as exc:
        raise EmailServiceError(
            "Unable to send email."
        ) from exc


def _build_message(
    *,
    to_email: str,
    subject: str,
    plain_text: str,
    html_content: str,
) -> EmailMessage:
    """Build a multipart email with plain-text and HTML alternatives."""
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = (
        f"{settings.smtp_from_name} "
        f"<{settings.smtp_from_email}>"
    )
    message["To"] = to_email
    message.set_content(plain_text)
    message.add_alternative(
        html_content,
        subtype="html",
    )
    return message


def _brand_email(
    *,
    heading: str,
    body_html: str,
) -> str:
    """Return the shared Evalyn email layout."""
    safe_heading = escape(heading)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_heading}</title>
</head>
<body style="margin:0;padding:28px;background:#f5f7fc;font-family:Arial,Helvetica,sans-serif;color:#242747;">
  <main style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e5ef;border-radius:16px;overflow:hidden;">
    <header style="padding:24px 30px;background:#26284f;color:white;font-size:24px;font-weight:700;">Evalyn</header>
    <section style="padding:30px;">
      <h1 style="margin:0 0 20px;font-size:25px;line-height:1.3;color:#26284f;">{safe_heading}</h1>
      {body_html}
      <p style="font-size:14px;line-height:1.7;margin:28px 0 0;">Best regards,<br><strong>Evalyn</strong><br>AI Screening Platform</p>
    </section>
  </main>
</body>
</html>"""


def send_verification_email(
    to_email: str,
    candidate_name: str,
    otp: str,
) -> None:
    """Send a one-minute email verification OTP."""
    current_hour = datetime.now().hour

    if current_hour < 12:
        greeting = "Good morning"
    elif current_hour < 17:
        greeting = "Good afternoon"
    else:
        greeting = "Good evening"

    name = candidate_name or "Candidate"
    personalized_greeting = f"{greeting}, {name},"
    safe_greeting = escape(personalized_greeting)
    safe_otp = escape(otp)

    plain_text = f"""
{personalized_greeting}

Welcome to Evalyn!

Thank you for creating your account. To complete your registration,
verify your email address using this code:

Verification code: {otp}

This code is valid for 1 minute only. Do not share it with anyone.

If you did not create an account with Evalyn, you can ignore this email.

Best regards,
Evalyn
AI Screening Platform
""".strip()

    html_content = _brand_email(
        heading="Verify your email",
        body_html=f"""
<p style="font-size:15px;line-height:1.7;">{safe_greeting}</p>
<p style="font-size:15px;line-height:1.7;">Welcome to Evalyn. Use the verification code below to complete your registration.</p>
<div style="margin:24px 0;padding:24px;text-align:center;border:1px solid #c7dddd;border-radius:12px;background:#eef7f7;">
  <p style="margin:0 0 10px;font-size:13px;color:#557070;font-weight:600;">Verification code</p>
  <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;color:#004040;">{safe_otp}</p>
</div>
<p style="font-size:14px;line-height:1.7;">This code is <strong>valid for 1 minute only</strong>. Do not share it with anyone.</p>
<p style="font-size:14px;line-height:1.7;">If you did not create an account with Evalyn, you can safely ignore this email.</p>
""",
    )

    try:
        _send_email(
            _build_message(
                to_email=to_email,
                subject="Verify Your Email - Evalyn",
                plain_text=plain_text,
                html_content=html_content,
            )
        )
    except EmailServiceError as exc:
        logger.exception(
            "Failed to send verification email to %s",
            to_email,
        )
        raise EmailServiceError(
            "Unable to send verification email."
        ) from exc


def send_job_collaboration_email(
    to_email: str,
    recipient_name: str,
    job_title: str,
    collaborator_role: str,
) -> None:
    """Send a notification email when a user is assigned to a job."""
    role_labels = {
        "assessment_manager": "Assessment Manager",
        "assessment_reviewer": "Assessment Reviewer",
    }
    role_label = role_labels.get(
        collaborator_role,
        "Assessment Collaborator",
    )

    name = recipient_name or "there"
    safe_name = escape(name)
    safe_job_title = escape(job_title or "Untitled job")
    safe_role = escape(role_label)

    plain_text = f"""
Hello {name},

You have been assigned as {role_label} for this job in Evalyn:

Job: {job_title}

Please log in to Evalyn to continue with the assessment workflow.

Best regards,
Evalyn
AI Screening Platform
""".strip()

    html_content = _brand_email(
        heading="New job assignment",
        body_html=f"""
<p style="font-size:15px;line-height:1.7;">Hello <strong>{safe_name}</strong>,</p>
<p style="font-size:15px;line-height:1.7;">You have been assigned as <strong>{safe_role}</strong> for a job in Evalyn.</p>
<div style="margin:24px 0;padding:20px;border:1px solid #c7dddd;border-radius:12px;background:#eef7f7;">
  <p style="margin:0 0 8px;font-size:13px;color:#557070;font-weight:600;">Job</p>
  <p style="margin:0;font-size:18px;font-weight:700;color:#004040;">{safe_job_title}</p>
</div>
<p style="font-size:15px;line-height:1.7;">Please log in to Evalyn to continue with the assessment workflow.</p>
""",
    )

    try:
        _send_email(
            _build_message(
                to_email=to_email,
                subject=f"Evalyn - New {role_label} Assignment",
                plain_text=plain_text,
                html_content=html_content,
            )
        )
    except EmailServiceError as exc:
        logger.exception(
            "Failed to send job collaboration email to %s",
            to_email,
        )
        raise EmailServiceError(
            "Unable to send job collaboration email."
        ) from exc


def send_candidate_activation_email(
    to_email: str,
    candidate_name: str,
    activation_url: str,
    expires_at: datetime,
) -> None:
    """Send a single-use, expiring link for candidate password setup."""
    safe_name = escape(candidate_name or "Candidate")
    safe_url = escape(activation_url, quote=True)

    if expires_at.tzinfo is None or expires_at.utcoffset() is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    expiry_label = expires_at.astimezone(timezone.utc).strftime(
        "%d %b %Y at %H:%M UTC"
    )

    plain_text = f"""
Hello {candidate_name or "Candidate"},

An HR team member added you as a candidate in Evalyn.

Activate your account and set your password using this link:
{activation_url}

This single-use link expires on {expiry_label}. If you were not expecting
this invitation, you can ignore this email.

Do not share this link with anyone.

Best regards,
Evalyn
AI Screening Platform
""".strip()

    html_content = _brand_email(
        heading="Complete your candidate account",
        body_html=f"""
<p style="font-size:15px;line-height:1.7;">Hello <strong>{safe_name}</strong>,</p>
<p style="font-size:15px;line-height:1.7;">An HR team member added you as a candidate in Evalyn. Use the secure link below to verify your email address and set your password.</p>
<p style="margin:28px 0;text-align:center;">
  <a href="{safe_url}" style="display:inline-block;padding:14px 24px;background:#5658e8;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">Activate account</a>
</p>
<p style="font-size:13px;line-height:1.7;color:#667085;">This single-use link expires on <strong>{escape(expiry_label)}</strong>.</p>
<p style="font-size:13px;line-height:1.7;color:#667085;">If you were not expecting this invitation, ignore the email. Do not forward or share the link.</p>
""",
    )

    try:
        _send_email(
            _build_message(
                to_email=to_email,
                subject="Complete Your Evalyn Candidate Account Setup",
                plain_text=plain_text,
                html_content=html_content,
            )
        )
    except EmailServiceError as exc:
        logger.exception(
            "Failed to send candidate activation email to %s",
            to_email,
        )
        raise EmailServiceError(
            "Unable to send candidate activation email."
        ) from exc


def _format_assessment_invitation_time(value: datetime) -> str:
    """Format schedule timestamps explicitly in UTC to avoid ambiguity."""
    if value.tzinfo is None or value.utcoffset() is None:
        value = value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc).strftime(
        "%d %b %Y, %I:%M %p UTC"
    )


def send_assessment_invitation_email(
    *,
    to_email: str,
    candidate_name: str,
    assessment_title: str,
    job_title: str,
    opens_at: datetime,
    closes_at: datetime,
    duration_minutes: int | None,
    question_count: int,
    invitation_url: str,
) -> None:
    """Email a candidate a unique link to their assigned assessment introduction page."""
    name = candidate_name or "Candidate"
    title = assessment_title or "Assessment"
    role = job_title or "Role assessment"

    safe_name = escape(name)
    safe_title = escape(title)
    safe_job = escape(role)
    safe_url = escape(invitation_url, quote=True)

    opens_label = _format_assessment_invitation_time(opens_at)
    closes_label = _format_assessment_invitation_time(closes_at)

    duration_label = (
        f"{int(duration_minutes)} minutes"
        if duration_minutes is not None and int(duration_minutes) > 0
        else "See the assessment instructions after signing in"
    )

    question_label = (
        f"{int(question_count)} questions"
        if question_count > 0
        else "Question count shown in Evalyn"
    )

    safe_duration = escape(duration_label)
    safe_questions = escape(question_label)
    safe_opens = escape(opens_label)
    safe_closes = escape(closes_label)

    plain_text = f"""
Hello {name},

You have been invited to complete an assessment in Evalyn.

Assessment: {title}
Role: {role}
Questions: {question_label}
Attempt duration: {duration_label}
Opens: {opens_label}
Closes: {closes_label}

Open your unique assessment invitation:
{invitation_url}

Please sign in to Evalyn when prompted. If you have not activated your
candidate account yet, complete the separate account-setup email first.

This link opens your assessment introduction page. It does not start your
timed attempt. The timer starts only after you explicitly choose Start Assessment.

Before you begin, make sure you have a stable internet connection and enough
uninterrupted time to complete the assessment.

If you were not expecting this invitation, contact the recruiting team.

Best regards,
Evalyn
AI Screening Platform
""".strip()

    html_content = _brand_email(
        heading="Your assessment is ready",
        body_html=f"""
<p style="margin:0 0 8px;color:#5658e8;font-size:11px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;">Assessment invitation</p>
<p style="font-size:15px;line-height:1.7;">Hello <strong>{safe_name}</strong>,</p>
<p style="font-size:15px;line-height:1.7;">You have been invited to complete an assessment in Evalyn. Review the details below and open your unique invitation when you are ready.</p>
<div style="margin:24px 0;padding:20px;border:1px solid #e3e5fa;border-radius:12px;background:#f8f8ff;">
  <p style="margin:0 0 6px;color:#666b86;font-size:12px;font-weight:700;">ASSESSMENT</p>
  <p style="margin:0;font-size:19px;font-weight:700;color:#26284f;">{safe_title}</p>
  <p style="margin:5px 0 18px;font-size:14px;color:#5658e8;">{safe_job}</p>
  <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.7;">
    <tr><td style="padding:7px 0;color:#667085;">Questions</td><td style="padding:7px 0;text-align:right;font-weight:700;">{safe_questions}</td></tr>
    <tr><td style="padding:7px 0;color:#667085;">Attempt duration</td><td style="padding:7px 0;text-align:right;font-weight:700;">{safe_duration}</td></tr>
    <tr><td style="padding:7px 0;color:#667085;">Opens</td><td style="padding:7px 0;text-align:right;font-weight:700;">{safe_opens}</td></tr>
    <tr><td style="padding:7px 0;color:#667085;">Closes</td><td style="padding:7px 0;text-align:right;font-weight:700;">{safe_closes}</td></tr>
  </table>
</div>
<p style="margin:28px 0;text-align:center;">
  <a href="{safe_url}" style="display:inline-block;padding:14px 24px;background:#5658e8;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">Open my assessment invitation</a>
</p>
<p style="font-size:14px;line-height:1.7;"><strong>Before you begin</strong><br>Make sure you have a stable internet connection and enough uninterrupted time. The invitation page shows the assessment window and instructions. Your timed attempt does <strong>not</strong> begin until you explicitly select <strong>Start Assessment</strong>.</p>
<p style="font-size:13px;line-height:1.7;color:#667085;">If you have not activated your candidate account yet, complete the separate account-setup email before signing in. If you were not expecting this invitation, contact the recruiting team.</p>
""",
    )

    try:
        _send_email(
            _build_message(
                to_email=to_email,
                subject=f"Your Evalyn assessment invitation: {title}",
                plain_text=plain_text,
                html_content=html_content,
            )
        )
    except EmailServiceError as exc:
        logger.exception(
            "Failed to send assessment invitation email to %s",
            to_email,
        )
        raise EmailServiceError(
            "Unable to send assessment invitation email."
        ) from exc