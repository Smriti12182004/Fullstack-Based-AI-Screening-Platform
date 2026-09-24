import logging
import smtplib
from datetime import datetime
from email.message import EmailMessage
from html import escape

from app.core.config import settings


logger = logging.getLogger(__name__)


class EmailServiceError(Exception):
    """Raised when an email cannot be sent."""


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

    personalized_greeting = (
        f"{greeting}, {candidate_name},"
    )

    message = EmailMessage()

    message["Subject"] = "Verify Your Email – Evalyn"
    message["From"] = (
        f"{settings.smtp_from_name} "
        f"<{settings.smtp_from_email}>"
    )
    message["To"] = to_email

    # Plain-text fallback
    plain_text = f"""
{personalized_greeting}

Welcome to Evalyn!

Thank you for creating your account. To complete your registration, please verify your email address using the verification code below.

Verification Code: {otp}

This verification code is valid for 1 minute only.

For your security, please do not share this code with anyone.

If you did not create an account with Evalyn, you can safely ignore this email.

Best regards,
Evalyn
AI Screening Platform
""".strip()

    # HTML version
    html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Verify Your Email - Evalyn</title>
</head>

<body style="
    margin: 0;
    padding: 0;
    background-color: #f5f8f8;
    font-family: Arial, Helvetica, sans-serif;
    color: #123434;
">

    <div style="
        max-width: 600px;
        margin: 40px auto;
        background-color: #ffffff;
        border: 1px solid #d9e5e5;
        border-radius: 12px;
        overflow: hidden;
    ">

        <div style="
            background-color: #004040;
            padding: 24px 32px;
        ">
            <h1 style="
                margin: 0;
                color: #ffffff;
                font-size: 24px;
                font-weight: 700;
            ">
                Evalyn
            </h1>
        </div>

        <div style="
            padding: 32px;
        ">

            <h2 style="
                margin-top: 0;
                margin-bottom: 20px;
                font-size: 22px;
                color: #0b2020;
            ">
                Verify Your Email
            </h2>

            <p style="
                font-size: 15px;
                line-height: 1.7;
                margin-bottom: 18px;
            ">
                <strong>
                    {escape(personalized_greeting)}
                </strong>
            </p>

            <p style="
                font-size: 15px;
                line-height: 1.7;
                margin-bottom: 24px;
            ">
                Welcome to Evalyn!
            </p>

            <p style="
                font-size: 15px;
                line-height: 1.7;
                margin-bottom: 24px;
            ">
                Thank you for creating your account. To complete your
                registration, please verify your email address using the
                verification code below.
            </p>

            <div style="
                background-color: #eef7f7;
                border: 1px solid #c7dddd;
                border-radius: 10px;
                padding: 24px;
                text-align: center;
                margin: 24px 0;
            ">

                <p style="
                    margin: 0 0 10px 0;
                    font-size: 13px;
                    color: #557070;
                    font-weight: 600;
                ">
                    Verification Code
                </p>

                <p style="
                    margin: 0;
                    font-size: 38px;
                    line-height: 1.2;
                    font-weight: 700;
                    letter-spacing: 8px;
                    color: #004040;
                ">
                    {escape(otp)}
                </p>

            </div>

            <p style="
                font-size: 14px;
                line-height: 1.7;
                margin-bottom: 16px;
            ">
                This verification code is
                <strong>valid for 1 minute only.</strong>
            </p>

            <p style="
                font-size: 14px;
                line-height: 1.7;
                margin-bottom: 16px;
            ">
                For your security, please
                <strong>do not share this code with anyone.</strong>
            </p>

            <p style="
                font-size: 14px;
                line-height: 1.7;
                margin-bottom: 24px;
            ">
                If you did not create an account with Evalyn,
                you can safely ignore this email.
            </p>

            <p style="
                font-size: 14px;
                line-height: 1.7;
                margin-bottom: 0;
            ">
                Best regards,<br>
                <strong>Evalyn</strong><br>
                AI Screening Platform
            </p>

        </div>

    </div>

</body>
</html>
""".strip()

    message.set_content(plain_text)
    message.add_alternative(
        html_content,
        subtype="html",
    )

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
        logger.exception(
            "Failed to send verification email to %s",
            to_email,
        )

        raise EmailServiceError(
            "Unable to send verification email."
        ) from exc