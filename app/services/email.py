"""
Email service — sends transactional emails via SMTP.
Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM in .env
Works with Gmail (use App Password), SendGrid SMTP, Mailgun SMTP, etc.
"""
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str) -> bool:
    """Send an email. Returns True on success, False on failure."""
    if not settings.smtp_host or not settings.smtp_user:
        logger.warning("SMTP not configured — skipping email send. Code will be logged below.")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = settings.smtp_from or settings.smtp_user
        msg["To"]      = to
        msg.attach(MIMEText(html, "html"))

        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port) as server:
                server.ehlo()
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(msg["From"], [to], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(msg["From"], [to], msg.as_string())

        logger.info(f"Email sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


def send_verification_email(to: str, code: str, name: str) -> bool:
    subject = "Verify your CUVR Reality account"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="background: #080d1a; padding: 32px; border-radius: 12px;">
        <h1 style="color: #ffffff; font-size: 24px; margin-bottom: 8px;">
          CUVR <span style="color: #bf00ff;">Reality</span>
        </h1>
        <p style="color: #8899bb; margin-bottom: 32px;">Verify your email address</p>

        <p style="color: #ffffff;">Hi {name},</p>
        <p style="color: #8899bb;">
          Enter the verification code below to complete your registration.
          This code expires in <strong style="color: #ffffff;">10 minutes</strong>.
        </p>

        <div style="background: #111827; border: 1px solid #1f2937; border-radius: 8px;
                    padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #bf00ff;">
            {code}
          </span>
        </div>

        <p style="color: #8899bb; font-size: 13px;">
          If you didn't create a CUVR Reality account, you can safely ignore this email.
        </p>
      </div>
    </div>
    """
    return send_email(to, subject, html)
