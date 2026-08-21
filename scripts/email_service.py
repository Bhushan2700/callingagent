import os
import base64
import logging
import httpx
from datetime import datetime, timezone
from email.message import EmailMessage

app_logger = logging.getLogger("loggix.email")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")
MAIL_FROM = os.getenv("MAIL_FROM", "nik68199@gmail.com")
ADMIN_EMAIL = os.getenv("ADMIN_NOTIFY_EMAIL", "")
PUBLIC_DOMAIN = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")


def _get_gmail_token() -> str:
    r = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": GMAIL_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        },
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _send(to: str, subject: str, html: str) -> bool:
    if not all([GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_REFRESH_TOKEN]):
        app_logger.warning("Gmail API credentials not set — skipping email to %s", to)
        return False
    try:
        token = _get_gmail_token()
        msg = EmailMessage()
        msg["From"] = MAIL_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(html, subtype="html")
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        r = httpx.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}"},
            json={"raw": raw},
            timeout=15,
        )
        if r.status_code not in (200, 201):
            app_logger.warning("Gmail API send rejected to %s: %d %s", to, r.status_code, r.text[:300])
            return False
        return True
    except Exception as e:
        app_logger.warning("Email send failed to %s: %s", to, e)
        return False

BRAND_HEADER = """
<div style="text-align:center;padding:32px 0 24px;border-bottom:2px solid #2563eb">
  <div style="display:inline-block;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#14B8A6);line-height:48px;font-size:1.5rem;font-weight:800;color:#fff">L</div>
  <div style="font-size:1.4rem;font-weight:800;color:#0f172a;margin-top:8px;letter-spacing:-0.5px">Loggix AI</div>
</div>
"""

FOOTER = """
<div style="text-align:center;padding:24px 0 0;border-top:1px solid #e2e8f0;margin-top:32px;color:#94a3b8;font-size:0.8rem">
  <p>Loggix AI &mdash; Your AI Receptionist</p>
  <p>Need help? Contact us at support@loggix.ai</p>
</div>
"""


def send_otp_email(name: str, email: str, otp: str) -> bool:
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      {BRAND_HEADER}
      <div style="padding:32px 24px">
        <h2 style="font-size:1.3rem;font-weight:700;margin:0 0 8px">Verify your email</h2>
        <p style="color:#64748b;font-size:0.95rem;margin:0 0 24px">Hi {name}, use the code below to verify your account.</p>
        <div style="text-align:center;padding:24px;background:#f1f5f9;border-radius:12px;margin:0 0 24px">
          <span style="font-size:2rem;font-weight:800;letter-spacing:8px;color:#2563eb">{otp}</span>
        </div>
        <p style="color:#64748b;font-size:0.85rem;margin:0 0 8px">This code expires in <strong>15 minutes</strong>.</p>
        <p style="color:#94a3b8;font-size:0.8rem;margin:0">If you didn't create an account, you can safely ignore this email.</p>
      </div>
      {FOOTER}
    </div>
    """
    return _send(email, "Verify your email — Loggix AI", html)


def send_welcome_email(name: str, email: str) -> bool:
    cta = f"{PUBLIC_DOMAIN}/onboarding" if PUBLIC_DOMAIN else "#"
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      {BRAND_HEADER}
      <div style="padding:32px 24px">
        <h2 style="font-size:1.3rem;font-weight:700;margin:0 0 8px">Welcome to Loggix AI!</h2>
        <p style="color:#64748b;font-size:0.95rem;margin:0 0 24px">Hi {name}, your account is ready. Let's get your AI receptionist set up.</p>
        <div style="text-align:center;margin:0 0 28px">
          <a href="{cta}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563eb,#14B8A6);color:#fff;font-weight:700;font-size:0.95rem;border-radius:10px;text-decoration:none">Complete Setup &rarr;</a>
        </div>
        <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:0 0 16px">
          <p style="font-size:0.85rem;font-weight:600;margin:0 0 12px;color:#0f172a">What you'll configure:</p>
          <div style="color:#64748b;font-size:0.85rem;line-height:1.8">
            <p style="margin:0">&#10003; Business info &amp; greeting</p>
            <p style="margin:0">&#10003; Voice &amp; language preference</p>
            <p style="margin:0">&#10003; Phone number (buy new or bring your own)</p>
            <p style="margin:0">&#10003; Tools: bookings, knowledge search, tickets</p>
          </div>
        </div>
        <p style="color:#94a3b8;font-size:0.8rem;margin:0">Takes about 3 minutes. No code required.</p>
      </div>
      {FOOTER}
    </div>
    """
    return _send(email, "Welcome to Loggix AI — Complete your setup", html)


def send_admin_notification(name: str, email: str, tenant_id: str) -> bool:
    if not ADMIN_EMAIL:
        return False
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      {BRAND_HEADER}
      <div style="padding:32px 24px">
        <h2 style="font-size:1.1rem;font-weight:700;margin:0 0 16px">New user signed up</h2>
        <table style="width:100%;font-size:0.9rem;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#64748b;width:120px">Name</td><td style="padding:8px 0;font-weight:600">{name}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Email</td><td style="padding:8px 0;font-weight:600">{email}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Tenant ID</td><td style="padding:8px 0;font-family:monospace;font-size:0.8rem">{tenant_id}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Time</td><td style="padding:8px 0">{now}</td></tr>
        </table>
        <p style="color:#94a3b8;font-size:0.8rem;margin:24px 0 0">This user has not completed onboarding yet.</p>
      </div>
      {FOOTER}
    </div>
    """
    return _send(ADMIN_EMAIL, f"New signup: {name}", html)


def send_phone_request_notification(company_name: str, tenant_email: str, provider: str, phone_number: str) -> bool:
    if not ADMIN_EMAIL:
        return False
    masked_number = phone_number[:4] + "****" + phone_number[-4:] if len(phone_number) > 8 else "****"
    html = f"""
    <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      {BRAND_HEADER}
      <div style="padding:32px 24px">
        <h2 style="font-size:1.1rem;font-weight:700;margin:0 0 16px">New phone request from {company_name}</h2>
        <table style="width:100%;font-size:0.9rem;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#64748b;width:120px">Business</td><td style="padding:8px 0;font-weight:600">{company_name}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Contact</td><td style="padding:8px 0;font-weight:600">{tenant_email}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Provider</td><td style="padding:8px 0;font-weight:600">{provider}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b">Phone</td><td style="padding:8px 0;font-family:monospace;font-size:0.8rem">{masked_number}</td></tr>
        </table>
        <p style="color:#94a3b8;font-size:0.8rem;margin:24px 0 0">Log into the super-admin panel to configure this phone number.</p>
      </div>
      {FOOTER}
    </div>
    """
    return _send(ADMIN_EMAIL, f"New phone request: {company_name}", html)
