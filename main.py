import os
import re
import sys
import json
import hmac
import hashlib
import asyncio
import logging
import httpx
import redis as redis_module
import psycopg2
from pathlib import Path
from datetime import datetime, date, timezone, timedelta
from uuid import uuid4
from random import randint
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File, Depends
from fastapi.responses import PlainTextResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import dateparser
try:
    from email_validator import validate_email, EmailNotValidError
except ImportError:
    validate_email = None
    EmailNotValidError = None

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))

from receptionist import LoggixReceptionist
from scripts.pgvector_writer import PGVectorWriter
from scripts.unified_ingest import UnifiedIngest
from scripts.cal_client import CalClient
from scripts.auth import hash_password, verify_password, create_token, decode_token, create_admin_token, decode_admin_token
from scripts.vapi_client import (
    create_assistant, update_assistant, delete_assistant, create_credential,
    buy_phone_number, import_phone_number, assign_phone_number, delete_phone_number,
    build_system_prompt, TOOL_SCHEMAS, list_calls, get_call, list_phone_numbers,
    get_assistant,
)
from scripts.storage import storage
from scripts.email_service import send_otp_email, send_welcome_email, send_admin_notification

app = FastAPI()
cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=cors_origins, allow_credentials=False if "*" in cors_origins else True, allow_methods=["*"], allow_headers=["*"])
app_logger = logging.getLogger("app_logger")


@app.on_event("startup")
async def startup_migrate():
    try:
        from scripts.db_migrations import run_migrations
        run_migrations()
    except Exception as e:
        app_logger.warning(f"Auto-migration failed: {e}")
receptionist = LoggixReceptionist()
writer = PGVectorWriter()
ingest = UnifiedIngest()
cal_client = CalClient()

redis_client = None
redis_url = os.getenv("REDIS_URL", "")
if redis_url:
    try:
        redis_client = redis_module.from_url(redis_url, decode_responses=True)
    except Exception:
        pass

DEFAULT_WIDGET_CONFIG = {
    "title": "Loggix AI Support",
    "greeting": "Hi! I'm the Loggix AI assistant. How can I help you today?",
    "primaryColor": "#8B5CF6",
    "primaryHover": "#A855F7",
    "backgroundColor": "#0A0A1A",
    "headerBg": "rgba(255,255,255,0.03)",
    "textColor": "#ffffff",
    "botMessageBg": "rgba(255,255,255,0.06)",
    "icon": "",
    "position": "bottom-right",
}

VAPI_KEY = os.getenv("VAPI_PRIVATE_KEY")
VAPI_BASE = "https://api.vapi.ai"

SHARED_ASSISTANT_ID = "cdc4601d-364c-4d0a-a515-d4d39feb9fa6"
SHARED_ASSISTANT_EMAIL = "nik68199@gmail.com"

class ToolRequest(BaseModel):
    query: str

class DeleteRequest(BaseModel):
    doc_id: str


# ==================== AUTH & DB HELPERS ====================


class RateLimiter:
    """Minimal in-memory sliding-window limiter. Fine for a single instance."""
    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window = window_seconds
        self.hits = {}

    def allow(self, key: str) -> bool:
        now = datetime.now(timezone.utc).timestamp()
        bucket = self.hits.setdefault(key, [])
        bucket[:] = [t for t in bucket if now - t < self.window]
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


login_limiter = RateLimiter(limit=10, window_seconds=60)
register_limiter = RateLimiter(limit=5, window_seconds=60)
otp_limiter = RateLimiter(limit=3, window_seconds=900)
chat_limiter = RateLimiter(limit=30, window_seconds=60)
search_limiter = RateLimiter(limit=20, window_seconds=60)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def get_db():
    url = os.getenv("DATABASE_URL", "")
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if "?" not in url:
        url += "?sslmode=require"
    elif "sslmode" not in url:
        url += "&sslmode=require"
    return psycopg2.connect(url)


def get_current_tenant(request: Request) -> str:
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    tenant_id = decode_token(token)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return tenant_id


def get_current_admin(request: Request) -> str:
    """Validate admin JWT and return admin_id."""
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    admin_id = decode_admin_token(token)
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")
    return admin_id


def tenant_exists(tenant_id: str) -> bool:
    if not tenant_id:
        return False
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM tenants WHERE id = %s", (tenant_id,))
            return cur.fetchone() is not None
    except Exception:
        return False


def shared_tenant_id() -> str:
    """Resolve the shared admin tenant id (used for tool-created tickets)."""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM tenants WHERE email = %s LIMIT 1", (SHARED_ASSISTANT_EMAIL,))
            row = cur.fetchone()
            if row:
                return row[0]
            cur.execute("SELECT id FROM tenants ORDER BY created_at LIMIT 1")
            row = cur.fetchone()
            return row[0] if row else ""
    except Exception:
        return ""


def tenant_id_by_assistant(assistant_id: str) -> str:
    """Map a Vapi assistant_id back to its owning tenant."""
    if not assistant_id:
        return ""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM tenants WHERE assistant_id = %s", (assistant_id,))
            row = cur.fetchone()
            return row[0] if row else ""
    except Exception:
        return ""


def _resolve_tenant_from_raw(raw: dict) -> str:
    """Resolve tenant from the Vapi tool payload via assistant_id, fallback to tenant_id."""
    assistant_id = str(raw.get("assistant_id", "") or "").strip()
    if assistant_id:
        tid = tenant_id_by_assistant(assistant_id)
        if tid:
            return tid

    ten_id = str(raw.get("tenant_id", "")).strip()
    if ten_id and tenant_exists(ten_id):
        return ten_id
    return ""


# ==================== AUTH ENDPOINTS ====================


@app.post("/api/auth/register")
async def register(request: Request):
    if not register_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many registration attempts. Try again later.")
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    password = raw.get("password", "")
    name = raw.get("name", "").strip()
    if not email or not password or not name:
        raise HTTPException(status_code=400, detail="email, password, and name are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    hashed = hash_password(password)
    tenant_id = str(uuid4())
    assistant_id = ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM tenants WHERE email = %s", (email,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Email already registered")

    if email == SHARED_ASSISTANT_EMAIL:
        assistant_id = SHARED_ASSISTANT_ID
    # All other tenants get their Vapi assistant provisioned during onboarding.

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO tenants (id, email, password_hash, name, assistant_id) VALUES (%s, %s, %s, %s, %s)",
            (tenant_id, email, hashed, name, assistant_id),
        )
        conn.commit()

    token = create_token(tenant_id)
    return {"token": token, "tenant_id": tenant_id, "name": name, "email": email, "assistant_id": assistant_id, "onboarding_complete": False}


OTP_TTL_MINUTES = 15
MAX_OTP_ATTEMPTS = 5


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


@app.post("/api/auth/request-otp")
async def request_otp(request: Request):
    if not otp_limiter.allow("otp:" + client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Wait a few minutes.")
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    password = raw.get("password", "")
    name = raw.get("name", "").strip()
    if not email or not password or not name:
        raise HTTPException(status_code=400, detail="email, password, and name are required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM tenants WHERE email = %s", (email,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Email already registered")

    otp = str(randint(100000, 999999))
    otp_hash = _hash_otp(otp)
    hashed_pw = hash_password(password)
    expires = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO pending_verifications (email, otp_hash, name, password_hash, expires_at) "
            "VALUES (%s, %s, %s, %s, %s) "
            "ON CONFLICT (email) DO UPDATE SET otp_hash=%s, name=%s, password_hash=%s, expires_at=%s, attempts=0",
            (email, otp_hash, name, hashed_pw, expires, otp_hash, name, hashed_pw, expires),
        )
        conn.commit()

    if not send_otp_email(name, email, otp):
        raise HTTPException(status_code=500, detail="Failed to send OTP email. Please try again.")
    return {"status": "sent", "email": email}


@app.post("/api/auth/verify-otp")
async def verify_otp(request: Request):
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    otp = raw.get("otp", "").strip()
    if not email or not otp:
        raise HTTPException(status_code=400, detail="email and otp are required")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT otp_hash, name, password_hash, attempts, expires_at FROM pending_verifications WHERE email = %s",
            (email,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="No verification pending for this email. Request a new code.")

    otp_hash, name, password_hash, attempts, expires_at = row

    if attempts >= MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many failed attempts. Request a new code.")

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")

    if not hmac.compare_digest(otp_hash, _hash_otp(otp)):
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE pending_verifications SET attempts = attempts + 1 WHERE email = %s", (email,))
            conn.commit()
        remaining = MAX_OTP_ATTEMPTS - attempts - 1
        raise HTTPException(status_code=400, detail=f"Invalid code. {remaining} attempts remaining.")

    tenant_id = str(uuid4())
    assistant_id = SHARED_ASSISTANT_ID if email == SHARED_ASSISTANT_EMAIL else ""

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO tenants (id, email, password_hash, name, assistant_id, email_verified) "
            "VALUES (%s, %s, %s, %s, %s, TRUE)",
            (tenant_id, email, password_hash, name, assistant_id),
        )
        cur.execute("DELETE FROM pending_verifications WHERE email = %s", (email,))
        conn.commit()

    token = create_token(tenant_id)

    asyncio.create_task(_post_register_emails(name, email, tenant_id))

    return {"token": token, "tenant_id": tenant_id, "name": name, "email": email, "assistant_id": assistant_id, "onboarding_complete": False}


async def _post_register_emails(name: str, email: str, tenant_id: str):
    try:
        send_welcome_email(name, email)
        send_admin_notification(name, email, tenant_id)
    except Exception as e:
        app_logger.warning("Post-register email failed for %s: %s", email, e)


@app.post("/api/auth/resend-otp")
async def resend_otp(request: Request):
    if not otp_limiter.allow("otp:" + client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Wait a few minutes.")
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM pending_verifications WHERE email = %s", (email,))
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="No verification pending. Please register first.")

    otp = str(randint(100000, 999999))
    otp_hash = _hash_otp(otp)
    expires = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE pending_verifications SET otp_hash=%s, expires_at=%s, attempts=0 WHERE email=%s",
            (otp_hash, expires, email),
        )
        conn.commit()

    if not send_otp_email(row[0], email, otp):
        raise HTTPException(status_code=500, detail="Failed to send OTP email. Please try again.")
    return {"status": "sent", "email": email}


@app.post("/api/auth/forgot-password")
async def forgot_password(request: Request):
    if not otp_limiter.allow("otp:" + client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests. Wait a few minutes.")
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM tenants WHERE email = %s", (email,))
        row = cur.fetchone()

    if not row:
        return {"status": "sent"}

    name = row[0]
    otp = str(randint(100000, 999999))
    otp_hash = _hash_otp(otp)
    expires = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO pending_verifications (email, otp_hash, name, password_hash, purpose, expires_at) "
            "VALUES (%s, %s, %s, %s, 'password_reset', %s) "
            "ON CONFLICT (email) DO UPDATE SET otp_hash=%s, name=%s, password_hash=%s, purpose='password_reset', expires_at=%s, attempts=0",
            (email, otp_hash, name, "", expires, otp_hash, name, "", expires),
        )
        conn.commit()

    if not send_otp_email(name, email, otp):
        raise HTTPException(status_code=500, detail="Failed to send OTP email. Please try again.")
    return {"status": "sent", "email": email}


@app.post("/api/auth/reset-password")
async def reset_password(request: Request):
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    otp = raw.get("otp", "").strip()
    new_password = raw.get("new_password", "")
    if not email or not otp or not new_password:
        raise HTTPException(status_code=400, detail="email, otp, and new_password are required")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT otp_hash, attempts, expires_at FROM pending_verifications WHERE email = %s AND purpose = 'password_reset'",
            (email,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="No reset requested for this email. Request a new code.")

    otp_hash, attempts, expires_at = row

    if attempts >= MAX_OTP_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many failed attempts. Request a new code.")

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Code expired. Request a new one.")

    if not hmac.compare_digest(otp_hash, _hash_otp(otp)):
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute(
                "UPDATE pending_verifications SET attempts = attempts + 1 WHERE email = %s AND purpose = 'password_reset'",
                (email,),
            )
            conn.commit()
        remaining = MAX_OTP_ATTEMPTS - attempts - 1
        raise HTTPException(status_code=400, detail=f"Invalid code. {remaining} attempts remaining.")

    new_hash = hash_password(new_password)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE tenants SET password_hash = %s WHERE email = %s", (new_hash, email))
        cur.execute("DELETE FROM pending_verifications WHERE email = %s AND purpose = 'password_reset'", (email,))
        conn.commit()

    return {"status": "reset"}


def _ensure_assistant(tenant_id: str, email: str, assistant_id: str) -> str:
    """Backfill the shared assistant for the admin account if missing."""
    if assistant_id or email != SHARED_ASSISTANT_EMAIL:
        return assistant_id
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE tenants SET assistant_id = %s WHERE id = %s AND (assistant_id = '' OR assistant_id IS NULL)", (SHARED_ASSISTANT_ID, tenant_id))
            conn.commit()
    except Exception as e:
        app_logger.warning(f"Failed to backfill assistant for {email}: {e}")
    return SHARED_ASSISTANT_ID


@app.post("/api/auth/login")
async def login(request: Request):
    if not login_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    password = raw.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, password_hash, name, assistant_id, onboarding_complete FROM tenants WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        tenant_id, password_hash, name, assistant_id, onboarding_complete = row

    if not verify_password(password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    assistant_id = _ensure_assistant(tenant_id, email, assistant_id or "")
    token = create_token(tenant_id)
    return {"token": token, "tenant_id": tenant_id, "name": name, "email": email, "assistant_id": assistant_id, "onboarding_complete": bool(onboarding_complete)}


@app.get("/api/auth/me")
async def me(request: Request):
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, email, name, assistant_id, onboarding_complete, email_verified, created_at FROM tenants WHERE id = %s", (tenant_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tenant not found")
        assistant_id = _ensure_assistant(row[0], row[1], row[3] or "")
        return {"tenant_id": row[0], "email": row[1], "name": row[2], "assistant_id": assistant_id, "onboarding_complete": bool(row[4]), "email_verified": bool(row[5]), "created_at": row[6].isoformat()}


# ==================== RAG SEARCH TOOL ====================

async def _parse_body(request: Request) -> dict:
    """Parse request body as JSON, falling back to form-encoded (Vapi sends both)."""
    content_type = request.headers.get("content-type", "")
    if "json" in content_type:
        return await request.json()
    try:
        form = await request.form()
        body_str = form.get("body", "")
        if body_str:
            try:
                return json.loads(body_str)
            except (json.JSONDecodeError, TypeError):
                pass
        return dict(form)
    except Exception:
        return {}

@app.post("/tool/search_knowledge")
async def search_knowledge(request: Request):
    """Tool endpoint for Vapi voice agent to search the knowledge base."""
    raw = await _parse_body(request)
    query = raw.get("query", "")

    tenant_id = _resolve_tenant_from_raw(raw) or shared_tenant_id()
    if not tenant_id:
        return {"result": "Sorry, I couldn't identify your account. Please try again."}

    try:
        result = await receptionist.search(query, tenant_id=tenant_id)
    except Exception as e:
        app_logger.error(f"SEARCH ERROR: {e}", exc_info=True)
        return {"result": "Search temporarily unavailable. Please try again."}
    chunks = result.get("chunks", [])

    formatted = []
    for i, c in enumerate(chunks):
        section = c.get("section", "General")
        if c.get("subsection"):
            section = f"{section} > {c.get('subsection')}"
        doc_id = c.get("doc_id", "unknown")
        formatted.append(f"[Source {i+1}: {doc_id} - {section}] {c['text']}")

    text = "; ".join(formatted) if formatted else "No relevant information found in knowledge base."
    text = text.replace("\n", " ").replace("\r", " ")

    return {"result": text}


# ==================== BOOKING TOOL ====================

def _parse_vapi_request(raw: dict) -> tuple:
    """Extract query/params and tool_call_id from Vapi request."""
    # Format 1: Flat params (Vapi sends directly)
    known_fields = {"name", "phone", "email", "enquiry_topic", "appointment_date", "appointment_time", "notes", "date", "time", "query"}
    if known_fields.intersection(raw.keys()):
        tool_call_id = None
        msg = raw.get("message", {})
        if isinstance(msg, dict):
            tcs = msg.get("toolCalls", [])
            if tcs and isinstance(tcs, list):
                tool_call_id = tcs[0].get("id")
        return raw, tool_call_id

    # Format 2: Nested in message.toolCalls
    if "query" in raw:
        return raw["query"], None
    tc = raw.get("message", {}).get("toolCalls", [{}])[0]
    args = tc.get("function", {}).get("arguments", "{}")
    if isinstance(args, str):
        args = json.loads(args)
    return args, tc.get("id")


def _validate_name(name: str) -> str | None:
    name = name.strip()
    if len(name) < 2 or len(name) > 100:
        return None
    return name


def _parse_phone(phone: str) -> str | None:
    phone = phone.strip()
    # Remove common separators
    phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace(".", "").replace(",", "")
    # Convert spoken words to digits
    word_to_digit = {
        "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
        "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
        "oh": "0", "o": "0", "to": "2", "too": "2", "for": "4",
        "ate": "8", "won": "1", "tree": "3", "fiver": "5", "niner": "9"
    }
    for word, digit in word_to_digit.items():
        phone = phone.replace(word, digit)
    result = ""
    for c in phone:
        if c.isdigit() or c == "+":
            result += c
    if len(result) > 10 and not result.startswith("+"):
        result = "+" + result
    return result if len(result) >= 7 else None


def _parse_email(email: str) -> str | None:
    email = email.strip().lower()
    # Handle spoken email patterns
    email = email.replace(" at the rate ", "@").replace(" at the rate of ", "@")
    email = email.replace(" at ", "@").replace("atat", "@").replace(" at at ", "@")
    email = email.replace(" dot ", ".").replace(" dotdot ", "..").replace(" dot dot ", "..")
    email = email.replace(" underscore ", "_").replace(" dash ", "-").replace(" hyphen ", "-")
    email = email.replace(" ", "").replace(",", "").replace(";", "")
    # Fix common domain misspellings
    domain_fixes = {
        "gmaill.com": "gmail.com", "gmial.com": "gmail.com", "gamil.com": "gmail.com",
        "g mail.com": "gmail.com", "gmail.con": "gmail.com", "gmail.cmo": "gmail.com",
        "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com",
        "hotmal.com": "hotmail.com", "hotmail.con": "hotmail.com",
        "outlok.com": "outlook.com", "outlook.con": "outlook.com",
        "icloud.con": "icloud.com",
    }
    for wrong, correct in domain_fixes.items():
        email = email.replace(wrong, correct)
    if "@" not in email:
        return None
    parts = email.split("@")
    if len(parts) != 2 or not parts[0] or not parts[1] or "." not in parts[1]:
        return None
    return email


def _validate_enquiry(enquiry: str) -> str | None:
    enquiry = enquiry.strip()
    if len(enquiry) < 2 or len(enquiry) > 500:
        return None
    return enquiry


def _validate_date(date_str: str) -> str | None:
    date_str = date_str.strip()
    if not date_str:
        return None
    date_lower = date_str.lower()
    now = datetime.now(timezone.utc)
    if date_lower in ["today", "now"]:
        return now.strftime("%Y-%m-%d")
    elif date_lower in ["tomorrow", "tmrw", "tmr"]:
        from datetime import timedelta
        return (now + timedelta(days=1)).strftime("%Y-%m-%d")
    parsed = dateparser.parse(date_str, settings={'TIMEZONE': 'UTC', 'RETURN_AS_TIMEZONE_AWARE': True, 'PREFER_DATES_FROM': 'future'})
    if not parsed:
        return None
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if parsed < today_start:
        return None
    return parsed.strftime("%Y-%m-%d")


def _validate_time(time_str: str) -> str | None:
    time_str = time_str.strip()
    if not time_str:
        return None
    time_str = time_str.lower()
    time_str = time_str.replace("o'clock", ":00").replace("oclock", ":00")
    time_str = time_str.replace("in the morning", "am").replace("in the afternoon", "pm")
    time_str = time_str.replace("in the evening", "pm").replace("at night", "pm")
    time_str = time_str.replace("quarter past", ":15").replace("quarter to", ":45")
    time_str = time_str.replace("half past", ":30")
    parsed = dateparser.parse(time_str, settings={'TIMEZONE': 'UTC', 'RETURN_AS_TIMEZONE_AWARE': True})
    if not parsed:
        return None
    return parsed.strftime("%H:%M")


@app.post("/tool/book_appointment")
async def book_appointment(request: Request):
    """Book appointment using Cal.com API."""
    raw = await _parse_body(request)

    # Log the raw Vapi request for debugging
    print(f"BOOKING_RAW_REQUEST: {json.dumps(raw, indent=2, default=str)}")

    params, tool_call_id = _parse_vapi_request(raw)

    # Log extracted parameters
    print(f"BOOKING_EXTRACTED_PARAMS: {json.dumps(params, indent=2, default=str)}")

    name = params.get("name", "").strip()
    phone = params.get("phone", "").strip()
    email = params.get("email", "").strip()
    enquiry_topic = params.get("enquiry_topic", params.get("notes", "")).strip()
    appointment_date = params.get("appointment_date", params.get("date", "")).strip()
    appointment_time = params.get("appointment_time", params.get("time", "")).strip()

    # Log raw values before parsing
    print(f"BOOKING_RAW_VALUES: name='{name}', phone='{phone}', email='{email}', topic='{enquiry_topic}', date='{appointment_date}', time='{appointment_time}'")

    valid_name = _validate_name(name)
    if not valid_name:
        err = "Please provide your name."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    if phone:
        phone = _parse_phone(phone)
        if not phone or len(phone) < 7:
            err = "Please provide a valid phone number with at least 7 digits."
            if tool_call_id:
                return {"results": [{"toolCallId": tool_call_id, "error": err}]}
            return {"error": err}
    else:
        err = "Please provide your phone number."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    if email:
        email = _parse_email(email)
        if not email:
            err = "Please provide a valid email address."
            if tool_call_id:
                return {"results": [{"toolCallId": tool_call_id, "error": err}]}
            return {"error": err}
    else:
        err = "Please provide your email address."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    valid_enquiry = _validate_enquiry(enquiry_topic)
    if not valid_enquiry:
        err = "Please provide details about your enquiry."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    print(f"BOOKING_PARSED: name='{valid_name}', phone='{phone}', email='{email}', date='{appointment_date}', time='{appointment_time}', topic='{valid_enquiry}'")

    valid_date = _validate_date(appointment_date)
    if not valid_date:
        err = f"Please provide a valid future date. Got: {appointment_date}"
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    valid_time = _validate_time(appointment_time)
    if not valid_time:
        err = "Please provide a valid time."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    start_iso = f"{valid_date}T{valid_time}:00Z"

    try:
        result = await cal_client.create_booking(start=start_iso, attendee_name=valid_name, attendee_email=email, phone=phone, notes=f"Enquiry: {valid_enquiry}")

        if result.get("status") == "success":
            booking = result["data"]
            meeting_url = booking.get("location", "Cal Video")
            result_text = f"Your consultation is booked! You'll receive a calendar invite at {email} with the meeting link. We'll call you at {phone} on {valid_date} at {valid_time} UTC."
        else:
            error = result.get("error", {})
            error_msg = error.get("message", "Unknown error") if isinstance(error, dict) else str(error)
            if "already has booking" in error_msg.lower() or "not available" in error_msg.lower():
                result_text = "Sorry, that time slot is not available. Please try a different date or time."
            else:
                result_text = "Sorry, I couldn't book that appointment. Please try a different time or contact us directly."

    except Exception as e:
        result_text = "Sorry, there was a technical issue with the booking system. Please try again later."

    if tool_call_id:
        return {"results": [{"toolCallId": tool_call_id, "result": result_text}]}
    return {"result": result_text}


# ==================== TICKETING SYSTEM ====================


@app.post("/tool/raise_ticket")
async def raise_ticket(request: Request):
    raw = await _parse_body(request)
    params, tool_call_id = _parse_vapi_request(raw)
    tenant_id = _resolve_tenant_from_raw(raw) or shared_tenant_id()
    name = params.get("name", "").strip()
    phone = params.get("phone", "").strip()
    email = params.get("email", "").strip()
    issue = params.get("issue", "").strip()

    if not name:
        err = "Please provide your name."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    if not issue or len(issue) < 5:
        err = "Please describe your issue in detail."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    if email:
        email = _parse_email(email) or email

    ticket_id = f"TKT-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO tickets (tenant_id, ticket_id, name, phone, email, issue) VALUES (%s, %s, %s, %s, %s, %s)",
            (tenant_id, ticket_id, name, phone, email, issue),
        )
        conn.commit()

    result_text = f"Your ticket has been created successfully! Ticket ID: {ticket_id}. Our team will review your issue and get back to you soon."

    if tool_call_id:
        return {"results": [{"toolCallId": tool_call_id, "result": result_text}]}
    return {"result": result_text}


@app.get("/tickets", response_class=HTMLResponse)
async def tickets_page():
    if frontend_index:
        return FileResponse(frontend_index)
    tickets_html = static_dir / "tickets.html"
    if tickets_html.exists():
        return HTMLResponse(content=tickets_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Tickets page not found</h1>", status_code=404)


@app.get("/api/tickets")
async def list_tickets(request: Request):
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT ticket_id, name, phone, email, issue, status, created_at FROM tickets WHERE tenant_id = %s ORDER BY created_at DESC",
            (tenant_id,),
        )
        rows = cur.fetchall()
        tickets = [
            {"id": r[0], "name": r[1], "phone": r[2], "email": r[3], "issue": r[4], "status": r[5], "created_at": r[6].isoformat()}
            for r in rows
        ]
    return {"tickets": tickets, "total": len(tickets)}


@app.get("/api/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, request: Request):
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT ticket_id, name, phone, email, issue, status, created_at FROM tickets WHERE tenant_id = %s AND ticket_id = %s",
            (tenant_id, ticket_id),
        )
        r = cur.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail=f"Ticket not found: {ticket_id}")
        return {"id": r[0], "name": r[1], "phone": r[2], "email": r[3], "issue": r[4], "status": r[5], "created_at": r[6].isoformat()}


@app.patch("/api/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, request: Request):
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    new_status = raw.get("status", "")
    if new_status not in ["open", "in_progress", "closed"]:
        raise HTTPException(status_code=400, detail="Status must be open, in_progress, or closed")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE tickets SET status = %s WHERE tenant_id = %s AND ticket_id = %s RETURNING ticket_id, name, phone, email, issue, status, created_at",
            (new_status, tenant_id, ticket_id),
        )
        r = cur.fetchone()
        conn.commit()
        if not r:
            raise HTTPException(status_code=404, detail=f"Ticket not found: {ticket_id}")
        return {"id": r[0], "name": r[1], "phone": r[2], "email": r[3], "issue": r[4], "status": r[5], "created_at": r[6].isoformat()}


# ==================== ADMIN ENDPOINTS ====================

@app.get("/admin/docs")
async def list_documents(request: Request):
    tenant_id = get_current_tenant(request)
    docs = writer.list_documents(tenant_id=tenant_id)
    return {"documents": docs, "total": len(docs)}


@app.get("/admin/diagnostic")
async def diagnostic(request: Request):
    tenant_id = get_current_tenant(request)
    docs = writer.list_documents(tenant_id=tenant_id)
    total_chunks = 0
    for d in docs:
        total_chunks += d.get("chunk_count", 0)
    return {
        "tenant_id": tenant_id,
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "database_url_configured": bool(os.getenv("DATABASE_URL")),
        "document_count": len(docs),
        "total_chunks": total_chunks,
        "documents": [{"doc_id": d["doc_id"], "chunks": d["chunk_count"], "doc_type": d["doc_type"]} for d in docs],
    }


@app.get("/admin/docs/{doc_id}")
async def get_document(doc_id: str, request: Request):
    tenant_id = get_current_tenant(request)
    info = writer.get_document_info(doc_id, tenant_id=tenant_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    return info


@app.delete("/admin/docs/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    tenant_id = get_current_tenant(request)
    count = writer.delete_document(doc_id, tenant_id=tenant_id)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    return {"deleted_chunks": count, "doc_id": doc_id}


@app.post("/admin/docs/{doc_id}/reindex")
async def reindex_document(doc_id: str, request: Request):
    tenant_id = get_current_tenant(request)
    from workers.ingestion_worker import RedisQueue
    queue = RedisQueue()
    job = {"action": "reindex", "doc_id": doc_id, "tenant_id": tenant_id}
    job_id = queue.enqueue(job)
    return {"status": "queued", "job_id": job_id, "doc_id": doc_id}


@app.post("/admin/ingest/trigger")
async def trigger_ingest(request: Request):
    tenant_id = get_current_tenant(request)
    folder_path = Path(__file__).parent / "knowledge" / "documents" / "incoming" / tenant_id
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder not found: knowledge/documents/incoming/{tenant_id}")
    results = await ingest.ingest_directory(folder_path, recursive=False, tenant_id=tenant_id)
    total_chunks = sum(results.values())
    return {"status": "completed", "files_processed": len(results), "total_chunks": total_chunks, "details": results}


@app.post("/admin/ingest/reindex")
async def full_reindex(request: Request, confirm: bool = False):
    tenant_id = get_current_tenant(request)
    if not confirm:
        return {"status": "confirmation_required", "message": "Set confirm=true to proceed"}
    results = await ingest.full_reindex(tenant_id=tenant_id)
    total_chunks = sum(results.values())
    return {"status": "completed", "files_processed": len(results), "total_chunks": total_chunks, "details": results}


@app.post("/admin/upload")
async def upload_document(request: Request, file: UploadFile = File(...)):
    tenant_id = get_current_tenant(request)
    allowed_ext = {".md", ".pdf", ".txt", ".json"}
    filename = Path(file.filename).name  # strip any directory components
    ext = Path(filename).suffix.lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"File type {ext} not supported. Use: {', '.join(allowed_ext)}")

    content = await file.read()
    try:
        storage.upload(tenant_id, filename, content)
    except Exception as e:
        app_logger.warning(f"B2 upload failed, file saved locally only: {e}")

    incoming_dir = Path(__file__).parent / "knowledge" / "documents" / "incoming" / tenant_id
    incoming_dir.mkdir(parents=True, exist_ok=True)
    local_path = incoming_dir / filename
    with open(local_path, "wb") as f:
        f.write(content)

    try:
        result = await ingest.ingest_file(local_path, tenant_id=tenant_id)
        return {"status": "success", "filename": filename, "chunks": result, "message": f"Successfully ingested {filename}: {result} chunks"}
    except Exception as e:
        app_logger.warning(f"Ingestion error for {filename}: {e}")
        return {"status": "error", "filename": filename, "message": f"File saved but ingestion failed: {str(e)}"}


# ==================== WIDGET CONFIG ====================


def _get_widget_db(tenant_id: str) -> dict:
    config = dict(DEFAULT_WIDGET_CONFIG)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT config FROM widget_configs WHERE tenant_id = %s", (tenant_id,))
        row = cur.fetchone()
        if row:
            stored = row[0] if isinstance(row[0], dict) else json.loads(row[0])
            config = {**config, **stored}
        cur.execute("SELECT assistant_id FROM tenants WHERE id = %s", (tenant_id,))
        t = cur.fetchone()
        if t and t[0]:
            config["vapiAssistant"] = t[0]
    config["vapiKey"] = os.getenv("VAPI_PUBLIC_KEY", "")
    return config


def _save_widget_db(tenant_id: str, config: dict):
    merged = dict(DEFAULT_WIDGET_CONFIG)
    merged.update(config)
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO widget_configs (tenant_id, config) VALUES (%s, %s) "
            "ON CONFLICT (tenant_id) DO UPDATE SET config = %s, updated_at = NOW()",
            (tenant_id, json.dumps(merged), json.dumps(merged)),
        )
        conn.commit()
    finally:
        conn.close()


ALLOWED_POSITIONS = ["bottom-right", "bottom-left"]


@app.get("/api/admin/widget-config")
async def get_widget_config(request: Request):
    tenant_id = get_current_tenant(request)
    return _get_widget_db(tenant_id)


@app.put("/api/admin/widget-config")
async def update_widget_config(request: Request):
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Invalid config")
    pos = raw.get("position", "bottom-right")
    if pos not in ALLOWED_POSITIONS:
        raise HTTPException(status_code=400, detail=f"position must be one of {ALLOWED_POSITIONS}")
    try:
        _save_widget_db(tenant_id, raw)
        return {"status": "ok", "config": _get_widget_db(tenant_id)}
    except Exception as e:
        app_logger.error(f"widget-config save failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save widget config: {e}")


@app.get("/admin/widget", response_class=HTMLResponse)
async def admin_widget_page():
    if frontend_index:
        return FileResponse(frontend_index)
    admin_html = static_dir / "admin-widget.html"
    if admin_html.exists():
        return HTMLResponse(content=admin_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Admin Widget page not found</h1>", status_code=404)


# ==================== SUPER ADMIN ENDPOINTS ====================

@app.post("/super-admin/login")
async def super_admin_login(request: Request):
    """Admin login — returns admin JWT."""
    raw = await request.json()
    email = raw.get("email", "").strip().lower()
    password = raw.get("password", "")
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password required")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, password_hash, name FROM admin_users WHERE email = %s", (email,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    admin_id, pw_hash, name = row
    if not verify_password(password, pw_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_admin_token(admin_id)
    return {"token": token, "admin_id": admin_id, "name": name, "email": email}


@app.get("/super-admin/me")
async def super_admin_me(admin_id: str = Depends(get_current_admin)):
    """Get current admin info."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, email, name, created_at FROM admin_users WHERE id = %s", (admin_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Admin not found")
    return {"id": row[0], "email": row[1], "name": row[2], "created_at": row[3].isoformat()}


@app.post("/super-admin/phone-requests")
async def create_phone_request(request: Request):
    """Save phone request from onboarding wizard."""
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    provider = raw.get("provider", "").strip()
    phone_number = raw.get("phone_number", "").strip()
    credentials = raw.get("credentials", {}) or {}
    if not provider or not phone_number:
        raise HTTPException(status_code=400, detail="provider and phone_number required")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO phone_requests (tenant_id, provider, phone_number, credentials, status)
               VALUES (%s, %s, %s, %s, 'pending')
               RETURNING id, created_at""",
            (tenant_id, provider, phone_number, json.dumps(credentials)),
        )
        row = cur.fetchone()
        conn.commit()
    # Notify admin
    try:
        with get_db() as conn:
            cur = conn.cursor()
        cur.execute("SELECT company_name, email FROM tenants WHERE id = %s", (tenant_id,))
        trow = cur.fetchone()
        company = trow[0] if trow else "Unknown"
        tenant_email = trow[1] if trow and len(trow) > 1 else ""
        send_phone_request_notification(company, tenant_email, provider, phone_number)
    except Exception:
        pass
    return {"status": "ok", "request_id": row[0], "created_at": row[1].isoformat()}


@app.get("/super-admin/phone-requests")
async def list_phone_requests(admin_id: str = Depends(get_current_admin)):
    """List all phone requests with optional status filter."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT pr.id, pr.tenant_id, pr.provider, pr.phone_number, pr.credentials,
                   pr.status, pr.admin_notes, pr.created_at, pr.updated_at,
                   t.company_name, t.email as tenant_email
            FROM phone_requests pr
            JOIN tenants t ON t.id = pr.tenant_id
            ORDER BY pr.created_at DESC
        """)
        rows = cur.fetchall()
    return {
        "requests": [
            {
                "id": r[0],
                "tenant_id": r[1],
                "provider": r[2],
                "phone_number": r[3],
                "credentials": r[4],
                "status": r[5],
                "admin_notes": r[6],
                "created_at": r[7].isoformat(),
                "updated_at": r[8].isoformat(),
                "company_name": r[9],
                "tenant_email": r[10],
            }
            for r in rows
        ]
    }


@app.get("/super-admin/phone-requests/{request_id}")
async def get_phone_request(request_id: int, admin_id: str = Depends(get_current_admin)):
    """Get single phone request detail."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT pr.id, pr.tenant_id, pr.provider, pr.phone_number, pr.credentials,
                   pr.status, pr.admin_notes, pr.created_at, pr.updated_at,
                   t.company_name, t.email as tenant_email
            FROM phone_requests pr
            JOIN tenants t ON t.id = pr.tenant_id
            WHERE pr.id = %s
        """, (request_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Phone request not found")
    return {
        "id": row[0],
        "tenant_id": row[1],
        "provider": row[2],
        "phone_number": row[3],
        "credentials": row[4],
        "status": row[5],
        "admin_notes": row[6],
        "created_at": row[7].isoformat(),
        "updated_at": row[8].isoformat(),
        "company_name": row[9],
        "tenant_email": row[10],
    }


@app.patch("/super-admin/phone-requests/{request_id}")
async def update_phone_request(request_id: int, request: Request, admin_id: str = Depends(get_current_admin)):
    """Update phone request status/notes."""
    raw = await request.json()
    status = raw.get("status")
    admin_notes = raw.get("admin_notes", "")
    if status not in ("pending", "in_progress", "completed"):
        raise HTTPException(status_code=400, detail="status must be pending, in_progress, or completed")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE phone_requests SET status = %s, admin_notes = %s, updated_at = NOW() WHERE id = %s RETURNING id",
            (status, admin_notes, request_id),
        )
        row = cur.fetchone()
        conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Phone request not found")
    return {"status": "ok", "request_id": row[0]}


@app.get("/super-admin/tenants")
async def list_all_tenants(admin_id: str = Depends(get_current_admin)):
    """List all tenants for admin context."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, email, name, company_name, onboarding_complete, created_at
            FROM tenants
            ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
    return {
        "tenants": [
            {
                "id": r[0],
                "email": r[1],
                "name": r[2],
                "company_name": r[3],
                "onboarding_complete": r[4],
                "created_at": r[5].isoformat(),
            }
            for r in rows
        ]
    }


@app.delete("/super-admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, admin_id: str = Depends(get_current_admin)):
    """Delete a tenant and all associated data, including Vapi assistant."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT assistant_id FROM tenants WHERE id = %s", (tenant_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    assistant_id = row[0]

    deleted = {}
    with get_db() as conn:
        cur = conn.cursor()
        for table in [
            "widget_configs", "phone_requests", "messages", "appointments",
            "tickets", "calls", "conversations", "knowledge_gaps",
            "assistant_versions", "loggix_knowledge",
        ]:
            try:
                cur.execute(f"DELETE FROM {table} WHERE tenant_id = %s", (tenant_id,))
                deleted[table] = cur.rowcount
            except Exception:
                conn.rollback()
                cur = conn.cursor()
                deleted[table] = "skipped"
        cur.execute("DELETE FROM tenants WHERE id = %s", (tenant_id,))
        deleted["tenants"] = cur.rowcount
        conn.commit()

    vapi_deleted = False
    if assistant_id:
        try:
            vapi_deleted = await delete_assistant(assistant_id)
        except Exception as e:
            app_logger.error(f"Vapi assistant delete failed for {assistant_id}: {e}")

    return {"status": "ok", "deleted": deleted, "vapi_assistant_deleted": vapi_deleted}


# ==================== ONBOARDING ====================


def _onboarding_cfg(raw: dict) -> dict:
    tools = [t for t in raw.get("tools_enabled", []) if t in TOOL_SCHEMAS]
    if not tools:
        tools = ["search_knowledge", "raise_ticket"]
    return {
        "company_name": raw.get("company_name", "").strip(),
        "industry": raw.get("industry", "").strip(),
        "description": raw.get("description", "").strip(),
        "languages": raw.get("languages") or ["English"],
        "timezone": raw.get("timezone", "UTC").strip(),
        "business_hours": raw.get("business_hours", "").strip(),
        "voice_id": raw.get("voice_id", "").strip(),
        "greeting": raw.get("greeting", "").strip(),
        "tools_enabled": tools,
    }


@app.get("/api/admin/onboarding/status")
async def onboarding_status(request: Request):
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT assistant_id, phone_number, onboarding_complete, company_name, voice_id, languages, tools_enabled "
            "FROM tenants WHERE id = %s",
            (tenant_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "assistant_id": row[0] or "",
        "phone_number": row[1] or "",
        "onboarding_complete": bool(row[2]),
        "company_name": row[3] or "",
        "voice_id": row[4] or "",
        "languages": row[5] or ["English"],
        "tools_enabled": row[6] or [],
    }


@app.post("/api/admin/onboarding")
async def save_onboarding(request: Request):
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    cfg = _onboarding_cfg(raw)
    if not cfg["company_name"]:
        raise HTTPException(status_code=400, detail="company_name is required")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT assistant_id, phone_number_id, phone_number FROM tenants WHERE id = %s",
            (tenant_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tenant not found")
        assistant_id, phone_number_id, phone_number = row

    # 1. Create or update the Vapi assistant
    if assistant_id:
        if not await update_assistant(assistant_id, cfg):
            return {"status": "error", "step": "assistant", "message": "Failed to update your voice assistant. Please try again."}
    else:
        assistant_id = await create_assistant(cfg)
        if not assistant_id:
            return {"status": "error", "step": "assistant", "message": "Failed to create your voice assistant. Please try again."}

    # 2. Phone number (buy new / import own / none)
    phone_cfg = raw.get("phone", {}) or {}
    mode = phone_cfg.get("mode", "none")
    new_phone_id, new_phone_number = phone_number_id, phone_number

    if mode == "buy":
        if not phone_number_id:
            bought = await buy_phone_number(
                f"{cfg['company_name']} AI Receptionist",
                str(phone_cfg.get("area_code", "") or "").strip() or "415",
                assistant_id,
            )
            if not bought:
                detail = bought.get("error", "") if isinstance(bought, dict) else ""
                # Assistant was created but the number couldn't be bought — persist it and flag phone pending
                try:
                    with get_db() as conn:
                        cur = conn.cursor()
                        cur.execute(
                            "UPDATE tenants SET assistant_id=%s, phone_number_id=NULL, phone_number='', onboarding_complete=TRUE WHERE id=%s",
                            (assistant_id, tenant_id),
                        )
                        conn.commit()
                except Exception:
                    pass
                try:
                    with get_db() as conn:
                        cur = conn.cursor()
                        cur.execute(
                            "INSERT INTO phone_requests (tenant_id, provider, phone_number, credentials, status) "
                            "VALUES (%s, %s, %s, %s, 'pending')",
                            (tenant_id, "vapi", "", json.dumps({"error": detail or "buy failed"})),
                        )
                        conn.commit()
                except Exception:
                    pass
                return {"status": "error", "step": "phone", "assistant_id": assistant_id, "message": detail or "Couldn't buy a phone number. Check your Vapi account settings."}
            new_phone_id, new_phone_number = bought["id"], bought["number"]
        else:
            await assign_phone_number(phone_number_id, assistant_id)

    elif mode == "import":
        provider = str(phone_cfg.get("provider", "")).strip()
        number = str(phone_cfg.get("number", "")).strip()
        if provider not in ("twilio", "vonage", "telnyx", "byo-phone-number"):
            raise HTTPException(status_code=400, detail="phone.provider must be twilio, vonage, telnyx, or byo-phone-number")
        if not number:
            raise HTTPException(status_code=400, detail="phone.number is required")
        credential_id = await create_credential(provider, phone_cfg.get("credentials", {}) or {})
        if not credential_id:
            return {"status": "error", "step": "phone", "message": "Couldn't save your provider credentials in Vapi. Check them and try again."}
        imported = await import_phone_number(
            f"{cfg['company_name']} AI Receptionist", provider, credential_id, number, assistant_id
        )
        if not imported:
            return {"status": "error", "step": "phone", "message": "Couldn't import that phone number. Check the number and credentials."}
        if phone_number_id and phone_number_id != imported["id"]:
            await delete_phone_number(phone_number_id)
        new_phone_id, new_phone_number = imported["id"], imported["number"]

    # 3. Persist settings
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE tenants SET assistant_id=%s, phone_number_id=%s, phone_number=%s, company_name=%s, "
            "industry=%s, description=%s, languages=%s, timezone=%s, business_hours=%s, voice_id=%s, "
            "greeting=%s, tools_enabled=%s, onboarding_complete=TRUE WHERE id=%s",
            (
                assistant_id, new_phone_id, new_phone_number, cfg["company_name"], cfg["industry"],
                cfg["description"], json.dumps(cfg["languages"]), cfg["timezone"], cfg["business_hours"],
                cfg["voice_id"], cfg["greeting"], json.dumps(cfg["tools_enabled"]), tenant_id,
            ),
        )
        conn.commit()

    # 4. Seed widget branding
    widget = raw.get("widget", {}) or {}
    if any(widget.get(k) for k in ("title", "greeting", "primaryColor", "primaryHover", "backgroundColor", "textColor", "position", "icon")):
        existing = _get_widget_db(tenant_id)
        for k in ("title", "greeting", "primaryColor", "primaryHover", "backgroundColor", "textColor", "position", "icon"):
            if widget.get(k):
                existing[k] = widget[k]
        existing.pop("vapiAssistant", None)
        existing.pop("vapiKey", None)
        _save_widget_db(tenant_id, existing)

    return {"status": "ok", "assistant_id": assistant_id, "phone_number_id": new_phone_id, "phone_number": new_phone_number}


# ==================== VAPI CLIENT CONFIG ====================


@app.get("/api/config/vapi")
async def config_vapi(request: Request):
    tenant_id = get_current_tenant(request)
    assistant_id = ""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT assistant_id FROM tenants WHERE id = %s", (tenant_id,))
        row = cur.fetchone()
        if row and row[0]:
            assistant_id = row[0]
    return {"vapiKey": os.getenv("VAPI_PUBLIC_KEY", ""), "assistantId": assistant_id}


# ==================== VAPI PHONE DETAIL ====================


def _tenant_vapi_ids(request: Request) -> tuple:
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT assistant_id, phone_number_id FROM tenants WHERE id = %s", (tenant_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return row[0] or "", row[1] or ""


@app.get("/api/admin/phone-numbers")
async def admin_phone_numbers(request: Request):
    assistant_id, _ = _tenant_vapi_ids(request)
    if not assistant_id:
        return {"phones": []}
    phones = await list_phone_numbers(assistant_id)
    return {"phones": phones}


# ==================== PUBLIC WIDGET API ====================


@app.get("/api/public/widget-config")
async def public_widget_config(tenant_id: str = ""):
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id is required")
    config = _get_widget_db(tenant_id)
    return {"config": config, "tenant_id": tenant_id}


@app.post("/api/public/chat")
async def public_chat(request: Request):
    if not chat_limiter.allow(client_ip(request)):
        return {"error": "Too many requests. Please try again later."}
    raw = await request.json()
    message = raw.get("message", "").strip()
    history = raw.get("history", [])
    tenant_id = raw.get("tenant_id", "").strip()

    if not message:
        return {"error": "Message is required"}
    if not tenant_id or not tenant_exists(tenant_id):
        return {"error": "Invalid tenant_id"}

    try:
        result = await receptionist.get_response(message, history, tenant_id=tenant_id)
        if result.get("confidence_level") == "low" and result.get("intent") != "appointment_booking":
            _record_knowledge_gap(tenant_id, message, result.get("confidence", 0))
        return {
            "response": result["answer"],
            "confidence": result.get("confidence", 0),
            "confidence_level": result.get("confidence_level", "low"),
            "resolved": result.get("resolved", False),
            "intent": result.get("intent", "general"),
            "sources": result.get("sources", []),
            "resolved_by": result.get("resolved_by", ""),
        }
    except Exception as e:
        app_logger.error(f"Chat error for tenant {tenant_id}: {e}")
        return {"response": "Sorry, I encountered an error. Please try again."}


@app.post("/api/public/search")
async def public_search(request: Request):
    if not search_limiter.allow(client_ip(request)):
        return {"error": "Too many requests. Please try again later."}
    raw = await request.json()
    query = raw.get("query", "").strip()
    tenant_id = raw.get("tenant_id", "").strip()

    if not query:
        return {"error": "Query is required"}
    if not tenant_id or not tenant_exists(tenant_id):
        return {"error": "Invalid tenant_id"}

    try:
        result = await receptionist.search(query, tenant_id=tenant_id)
        chunks = result.get("chunks", [])
        formatted = []
        for i, c in enumerate(chunks):
            section = c.get("section", "General")
            if c.get("subsection"):
                section = f"{section} > {c.get('subsection')}"
            formatted.append({
                "text": c["text"],
                "doc_id": c.get("doc_id", ""),
                "section": section,
                "similarity": round(c.get("similarity", 0), 3)
            })
        return {"results": formatted, "count": len(formatted)}
    except Exception as e:
        app_logger.error(f"Search error for tenant {tenant_id}: {e}")
        return {"results": [], "count": 0}


# ==================== STATIC FILES ====================

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Mount the built SPA frontend
frontend_dist = Path(__file__).parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="spa_assets")


@app.get("/upload", response_class=HTMLResponse)
async def upload_page():
    if frontend_index:
        return FileResponse(frontend_index)
    upload_html = static_dir / "upload.html"
    if upload_html.exists():
        return HTMLResponse(content=upload_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Upload page not found</h1>", status_code=404)


@app.get("/voice", response_class=HTMLResponse)
async def voice_page():
    if frontend_index:
        return FileResponse(frontend_index)
    voice_html = static_dir / "voice.html"
    if voice_html.exists():
        return HTMLResponse(content=voice_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Voice page not found</h1>", status_code=404)


@app.get("/widget", response_class=HTMLResponse)
async def widget_page():
    if frontend_index:
        return FileResponse(frontend_index)
    widget_html = static_dir / "widget.html"
    if widget_html.exists():
        return HTMLResponse(content=widget_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Widget page not found</h1>", status_code=404)


# ==================== WIDGET API ENDPOINTS ====================

@app.post("/api/chat")
async def api_chat(request: Request):
    """Text chat endpoint for the embeddable widget."""
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    message = raw.get("message", "").strip()
    history = raw.get("history", [])

    if not message:
        return {"error": "Message is required"}

    try:
        result = await receptionist.get_response(message, history, tenant_id=tenant_id)
        if result.get("confidence_level") == "low" and result.get("intent") != "appointment_booking":
            _record_knowledge_gap(tenant_id, message, result.get("confidence", 0))
        return {
            "response": result["answer"],
            "confidence": result.get("confidence", 0),
            "confidence_level": result.get("confidence_level", "low"),
            "resolved": result.get("resolved", False),
            "intent": result.get("intent", "general"),
            "sources": result.get("sources", []),
            "resolved_by": result.get("resolved_by", ""),
        }
    except Exception as e:
        app_logger.error(f"Chat error for tenant {tenant_id}: {e}")
        return {"response": "Sorry, I encountered an error. Please try again."}


@app.post("/api/search")
async def api_search(request: Request):
    """Search endpoint for the embeddable widget."""
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    query = raw.get("query", "").strip()

    if not query:
        return {"error": "Query is required"}

    try:
        result = await receptionist.search(query, tenant_id=tenant_id)
        chunks = result.get("chunks", [])
        formatted = []
        for i, c in enumerate(chunks):
            section = c.get("section", "General")
            if c.get("subsection"):
                section = f"{section} > {c.get('subsection')}"
            formatted.append({
                "text": c["text"],
                "doc_id": c.get("doc_id", ""),
                "section": section,
                "similarity": round(c.get("similarity", 0), 3)
            })
        return {"results": formatted, "count": len(formatted)}
    except Exception as e:
        app_logger.error(f"Search error for tenant {tenant_id}: {e}")
        return {"results": [], "count": 0}


# ==================== VAPI WEBHOOK (Assistant events + tool calls) ====================

class _VapiRequest:
    """Minimal Request stand-in so tool handlers work with _parse_body()."""
    def __init__(self, data: dict):
        self._data = data

    @property
    def headers(self):
        return {}

    async def json(self):
        return self._data

    async def form(self):
        return self._data


# ---- Local storage helpers for calls/conversations/messages/appointments ----

RESOLUTION_ORDER = {
    "appointment_completed": 1,
    "ticket_created": 2,
    "ai_resolved": 3,
    "human_resolved": 4,
    "escalated": 5,
    "abandoned": 6,
    "unresolved": 7,
}


def _transcript_tool_calls(transcript: list) -> list:
    """Extract tool calls from Vapi transcript function messages."""
    tools = []
    for m in transcript or []:
        if not isinstance(m, dict) or m.get("role") != "function":
            continue
        content = m.get("content") or []
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and item.get("function"):
                    if (item["function"].get("name") or "").startswith("."):
                        item["function"]["name"] = item["function"]["name"][1:]
                    tools.append(item)
    return tools


_CLOSING_ASSISTANT = re.compile(
    r"(anything else|is there anything else|have a (great|good|nice|wonderful) day|"
    r"thank you for calling|thanks? for calling|goodbye|bye now|happy to help|"
    r"glad to help|let me know if you need|feel free to (reach out|call|ask))",
    re.IGNORECASE,
)

_CALLER_FAREWELL = re.compile(
    r"(^|\W)(bye|goodbye|thank you|thanks|that'?s all|that is all|no thanks?|"
    r"no thank you|have a good day|have a great day)(\W|$)",
    re.IGNORECASE,
)


def _transcript_text(transcript: list, role: str) -> list:
    """Return normalized text utterances for a role from a Vapi transcript."""
    out = []
    for m in transcript or []:
        if not isinstance(m, dict) or m.get("role") != role:
            continue
        content = m.get("content")
        if isinstance(content, list):
            text = " ".join(
                str(part.get("text", "")) for part in content if isinstance(part, dict)
            )
        else:
            text = str(content or "")
        text = " ".join(text.split())
        if text:
            out.append(text)
    return out


def classify_call_resolution(call_data: dict, tool_calls: list) -> tuple:
    """Deterministic, rule-based resolution classification for a Vapi call.
    Priority: appointment_completed > ticket_created > escalated > abandoned
    > ai_resolved (transcript closing rules) > unresolved."""
    tools = [t.get("function", {}).get("name", "") for t in tool_calls if isinstance(t, dict)]
    status = str(call_data.get("status", ""))

    if "book_appointment" in tools:
        return "appointment_completed", "Booked via book_appointment tool", "ai"
    if "raise_ticket" in tools:
        return "ticket_created", "Created support ticket via raise_ticket tool", "ai"
    if any(k in tools for k in ("escalate", "human_escalation")):
        return "escalated", "Escalated to human", "human"

    transcript = call_data.get("transcript") or []
    caller_msgs = _transcript_text(transcript, "user")
    assistant_msgs = _transcript_text(transcript, "assistant")
    if status in ("failed", "no-answer") or not caller_msgs:
        return "abandoned", "Call ended without conversation", ""

    if assistant_msgs and _CLOSING_ASSISTANT.search(assistant_msgs[-1]):
        return "ai_resolved", "Assistant closed the conversation after answering", "ai"
    if _CALLER_FAREWELL.search(caller_msgs[-1]):
        return "ai_resolved", "Caller closed the conversation", "ai"
    return "unresolved", "No resolution signal detected", ""


def _upsert_call(tenant_id: str, call: dict, tool_calls: list, resolution: tuple, channel: str = "phone") -> str:
    call_id = str(call.get("id", ""))
    if not call_id:
        return ""
    transcript = call.get("transcript") or []
    analysis = call.get("analysis") or {}
    summary = str(analysis.get("summary") or call.get("summary") or "")[:2000]
    started = call.get("startedAt") or call.get("createdAt")
    ended = call.get("endedAt") or call.get("updatedAt")
    phone = call.get("customer") or {}
    duration = call.get("durationSeconds") or 0
    if not duration and started and ended:
        try:
            from datetime import datetime as dt
            s = dt.fromisoformat(str(started).replace("Z", "+00:00"))
            e = dt.fromisoformat(str(ended).replace("Z", "+00:00"))
            duration = max(0, int((e - s).total_seconds()))
        except Exception:
            pass
    status, reason, resolved_by = resolution
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO calls (id, tenant_id, assistant_id, caller, phone, channel, started_at, ended_at,
                               duration_seconds, status, transcript, summary, intent, outcome,
                               resolution_status, resolution_reason, resolved_by, recording_url, costs, raw)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                duration_seconds = EXCLUDED.duration_seconds,
                status = EXCLUDED.status,
                transcript = EXCLUDED.transcript,
                summary = EXCLUDED.summary,
                resolution_status = EXCLUDED.resolution_status,
                resolution_reason = EXCLUDED.resolution_reason,
                resolved_by = EXCLUDED.resolved_by,
                recording_url = EXCLUDED.recording_url,
                costs = EXCLUDED.costs,
                ended_at = EXCLUDED.ended_at
        """, (
            call_id, tenant_id, str(call.get("assistantId", "")), str(phone.get("number", "") or ""),
            str(phone.get("number", "") or ""), channel, started, ended, duration,
            str(call.get("status", "")), json.dumps(transcript), summary, "", "", status, reason, resolved_by,
            str(call.get("recordingUrl", "") or ""), json.dumps(call.get("costs") or {}), json.dumps(call)[:100000],
        ))
        conn.commit()
    return call_id


def _record_call_messages(tenant_id: str, call_id: str, transcript: list, tool_calls: list):
    """Persist transcript + tool calls as messages tied to the call's conversation."""
    conv_id = f"call_{call_id}"
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO conversations (id, tenant_id, channel, call_id, summary, resolution_status, created_at, updated_at)
            VALUES (%s, %s, 'phone', %s, '', 'unresolved', NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
        """, (conv_id, tenant_id, call_id))
        conn.commit()

    message_rows = []
    for i, m in enumerate(transcript or []):
        if not isinstance(m, dict):
            continue
        role = "assistant" if m.get("role") == "assistant" else "user"
        content = str(m.get("content", ""))[:4000]
        if not content.strip():
            continue
        message_rows.append((f"{conv_id}_m{i:05d}", tenant_id, conv_id, role, content, 0, False, "[]", "[]"))

    for i, tc in enumerate(tool_calls or []):
        fn = (tc.get("function") or {}) if isinstance(tc, dict) else {}
        name = fn.get("name", "")
        args = fn.get("arguments", "{}")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except (json.JSONDecodeError, TypeError):
                args = {}
        message_rows.append((f"{conv_id}_tool{i:05d}", tenant_id, conv_id, "tool",
                             json.dumps({"tool": name, "arguments": args})[:4000], 0, False, "[]",
                             json.dumps([name])))

    if message_rows:
        with get_db() as conn:
            cur = conn.cursor()
            from psycopg2.extras import execute_values
            execute_values(cur, """
                INSERT INTO messages (id, tenant_id, conversation_id, role, content, confidence, resolved, sources, tools_used)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
            """, message_rows)
            conn.commit()

    return conv_id


def _update_conversation_resolution(conv_id: str, status: str):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE conversations SET resolution_status = %s, updated_at = NOW() WHERE id = %s", (status, conv_id))
        conn.commit()


def _store_appointment(tenant_id: str, cal_booking_id: str, customer: dict, start: str, end: str,
                       event_type: str, source: str = "ai", conversation_id: str = "", call_id: str = "",
                       timezone: str = "UTC", status: str = "confirmed") -> str:
    import hashlib
    appt_id = hashlib.sha256(f"{tenant_id}{cal_booking_id or start}{customer.get('email', '')}".encode()).hexdigest()[:20]
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO appointments (id, tenant_id, cal_booking_id, customer_name, customer_email, customer_phone,
                                      start_time, end_time, timezone, event_type, status, source, conversation_id, call_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, cal_booking_id = EXCLUDED.cal_booking_id
        """, (appt_id, tenant_id, cal_booking_id, str(customer.get("name", "") or ""),
              str(customer.get("email", "") or ""), str(customer.get("phone", "") or ""),
              start, end, timezone, event_type, status, source, conversation_id, call_id))
        conn.commit()
    return appt_id


def _record_knowledge_gap(tenant_id: str, question: str, confidence: float, conversation_id: str = "", call_id: str = ""):
    """Upsert a knowledge-gap event. Duplicates for identical questions are merged."""
    import hashlib
    norm = re.sub(r"[^a-z0-9\s]", "", question.lower())
    norm = re.sub(r"\s+", " ", norm).strip()[:200]
    if not norm:
        return
    gap_id = hashlib.sha256(f"{tenant_id}{norm}".encode()).hexdigest()[:20]
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO knowledge_gaps (id, tenant_id, question, normalized_question, occurrence_count,
                                        confidence, conversation_ids, call_id, first_seen_at, last_seen_at)
            VALUES (%s, %s, %s, %s, 1, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                occurrence_count = knowledge_gaps.occurrence_count + 1,
                confidence = EXCLUDED.confidence,
                last_seen_at = NOW()
        """, (gap_id, tenant_id, question[:500], norm, max(0.0, confidence),
              json.dumps([conversation_id] if conversation_id else []), call_id))
        conn.commit()


@app.post("/webhook/vapi")
async def vapi_webhook(request: Request):
    """Receive Vapi assistant messages. Acknowledges status events and
    dispatches function-call messages to the existing /tool/* handlers.
    Persists end-of-call reports locally for analytics."""
    raw = await _parse_body(request)
    message = raw.get("message", {})
    msg_type = message.get("type", "")
    call = message.get("call") or {}

    if msg_type == "end-of-call-report":
        tenant_id = tenant_id_by_assistant(str(call.get("assistantId", "")))
        if not tenant_id:
            return {"status": "received", "type": msg_type}
        transcript = call.get("transcript") or []
        tool_calls = _transcript_tool_calls(transcript)
        resolution = classify_call_resolution(call, tool_calls)
        call_id = _upsert_call(tenant_id, call, tool_calls, resolution)
        if call_id:
            conv_id = _record_call_messages(tenant_id, call_id, transcript, tool_calls)
            _update_conversation_resolution(conv_id, resolution[0])
        return {"status": "received", "type": msg_type}

    if msg_type in ("status-update", "transcript", "transcript-transcript-update"):
        return {"status": "received", "type": msg_type}

    tool_calls = message.get("toolCalls") or []
    results = []
    handlers = {
        "search_knowledge": lambda args: search_knowledge(_VapiRequest(args)),
        "book_appointment": lambda args: book_appointment(_VapiRequest(args)),
        "raise_ticket": lambda args: raise_ticket(_VapiRequest(args)),
    }

    for tc in tool_calls:
        fn = tc.get("function", {})
        name = fn.get("name", "")
        raw_args = fn.get("arguments", "{}")
        if isinstance(raw_args, str):
            try:
                args = json.loads(raw_args)
            except (json.JSONDecodeError, TypeError):
                args = {}
        else:
            args = raw_args or {}

        if isinstance(args, dict):
            assistant_id = (message.get("assistant") or {}).get("id", "")
            if assistant_id:
                args.setdefault("assistant_id", assistant_id)

        handler = handlers.get(name)
        if not handler:
            results.append({"toolCallId": tc.get("id"), "error": f"Unknown tool: {name}"})
            continue

        resp = await handler(args)
        if isinstance(resp, dict) and "results" in resp:
            results.extend(resp["results"])
        else:
            result_str = (resp or {}).get("result", "")
            results.append({"toolCallId": tc.get("id"), "result": result_str})
            if name == "book_appointment" and result_str and not result_str.startswith("Sorry"):
                assistant_id = str((message.get("assistant") or {}).get("id", ""))
                tenant_id = tenant_id_by_assistant(assistant_id)
                call_id = str((message.get("call") or {}).get("id", ""))
                if tenant_id:
                    _store_appointment(
                        tenant_id,
                        cal_booking_id="",
                        customer={"name": args.get("name", ""), "email": args.get("email", ""), "phone": args.get("phone", "")},
                        start=f"{args.get('appointment_date', args.get('date', ''))}T{args.get('appointment_time', args.get('time', ''))}:00Z",
                        end="",
                        event_type=args.get("enquiry_topic", args.get("notes", "")),
                        source="ai",
                        conversation_id=f"call_{call_id}" if call_id else "",
                        call_id=call_id,
                    )

    if results:
        return {"results": results}
    return {"status": "received"}


# ==================== PHASE 2: ADMIN ANALYTICS / CALLS / APPTS / GAPS / ASSISTANT ====================

def _parse_date_range(from_str: str, to_str: str, default_days: int = 30):
    from datetime import date, timedelta
    end = date.today()
    start = end - timedelta(days=default_days)
    if from_str:
        try:
            start = date.fromisoformat(from_str)
        except ValueError:
            pass
    if to_str:
        try:
            end = date.fromisoformat(to_str)
        except ValueError:
            pass
    return start, end


def _kpi_set(tenant_id: str, start: date, end: date) -> dict:
    """Call/booking/ticket/gap KPIs for a date range (inclusive)."""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*), COALESCE(AVG(duration_seconds), 0),
                   COUNT(*) FILTER (WHERE resolution_status IN ('ai_resolved','appointment_completed','ticket_created','human_resolved')),
                   COUNT(*) FILTER (WHERE status IN ('failed','no-answer') OR resolution_status = 'abandoned')
            FROM calls WHERE tenant_id = %s AND started_at::date BETWEEN %s AND %s
        """, (tenant_id, start, end))
        total_calls, avg_duration, resolved, missed = cur.fetchone()
        cur.execute("SELECT COUNT(*) FROM appointments WHERE tenant_id = %s AND created_at::date BETWEEN %s AND %s", (tenant_id, start, end))
        appointments = cur.fetchone()[0]
        tickets = 0
        if _table_exists("tickets"):
            cur.execute("SELECT COUNT(*) FROM tickets WHERE tenant_id = %s AND created_at::date BETWEEN %s AND %s", (tenant_id, start, end))
            tickets = cur.fetchone()[0]
    return {
        "total_calls": int(total_calls or 0),
        "avg_duration_seconds": round(float(avg_duration or 0)),
        "ai_resolution_rate": round(float(resolved or 0) / max(1, int(total_calls or 0)), 3),
        "appointments_booked": int(appointments or 0),
        "tickets_created": int(tickets or 0),
        "missed_calls": int(missed or 0),
    }


def _table_exists(name: str) -> bool:
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT to_regclass(%s)", (name,))
            return cur.fetchone()[0] is not None
    except Exception:
        return False


@app.get("/api/admin/dashboard")
async def admin_dashboard(request: Request, from_: str = "", to: str = "", days: int = 30):
    """Command-center dashboard: KPIs + trends + recent activity + needs attention."""
    tenant_id = get_current_tenant(request)
    start, end = _parse_date_range(from_, to, days if days > 0 else 30)
    prev_start = start - (end - start)
    prev_end = start

    current = _kpi_set(tenant_id, start, end)
    previous = _kpi_set(tenant_id, prev_start, prev_end)

    def delta(cur: float, prev: float):
        if prev == 0:
            return None
        return round((cur - prev) / prev, 3)

    trends = {}
    for k in ("total_calls",):
        trends[k] = delta(current[k], previous[k])
    trends["ai_resolution_rate"] = delta(current["ai_resolution_rate"], previous["ai_resolution_rate"])
    trends["appointments_booked"] = delta(current["appointments_booked"], previous["appointments_booked"])
    trends["missed_calls"] = delta(current["missed_calls"], previous["missed_calls"])

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT started_at::date, COUNT(*), COUNT(*) FILTER (WHERE resolution_status IN ('ai_resolved','appointment_completed','ticket_created'))
            FROM calls WHERE tenant_id = %s AND started_at::date BETWEEN %s AND %s
            GROUP BY started_at::date ORDER BY started_at::date
        """, (tenant_id, start, end))
        daily = [{"date": str(r[0]), "calls": int(r[1]), "ai_resolved": int(r[2])} for r in cur.fetchall()]

        cur.execute("""
            SELECT id, channel, summary, resolution_status, created_at FROM conversations
            WHERE tenant_id = %s ORDER BY created_at DESC LIMIT 8
        """, (tenant_id,))
        recent = [{"id": r[0], "channel": r[1], "summary": r[2], "resolution_status": r[3], "created_at": str(r[4])} for r in cur.fetchall()]

        cur.execute("""
            SELECT start_time, customer_name, customer_email, event_type, status, source FROM appointments
            WHERE tenant_id = %s AND start_time >= NOW() AND status != 'cancelled'
            ORDER BY start_time ASC LIMIT 5
        """, (tenant_id,))
        upcoming = [{"start_time": str(r[0]), "customer_name": r[1], "customer_email": r[2], "event_type": r[3], "status": r[4], "source": r[5]} for r in cur.fetchall()]

        attention = []
        if _table_exists("knowledge_gaps"):
            cur.execute("""
                SELECT question, occurrence_count, confidence, status, last_seen_at FROM knowledge_gaps
                WHERE tenant_id = %s AND status = 'new' ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT 5
            """, (tenant_id,))
            for r in cur.fetchall():
                attention.append({"type": "knowledge_gap", "title": r[0], "meta": f"{int(r[1])} occurrences · {float(r[2]):.2f} confidence", "status": r[3], "at": str(r[4])})
        if _table_exists("calls"):
            cur.execute("""
                SELECT caller, phone, started_at FROM calls
                WHERE tenant_id = %s AND resolution_status IN ('unresolved','abandoned') AND started_at >= NOW() - INTERVAL '3 days'
                ORDER BY started_at DESC LIMIT 5
            """, (tenant_id,))
            for r in cur.fetchall():
                attention.append({"type": "unresolved_call", "title": r[0] or r[1] or "Unknown caller", "meta": str(r[2]), "status": "needs_review", "at": str(r[2])})

        # Intent breakdown for charts
        intent_breakdown = {}
        if _table_exists("conversations"):
            cur.execute("""
                SELECT intent, COUNT(*) FROM conversations
                WHERE tenant_id = %s AND intent IS NOT NULL AND intent != ''
                AND created_at::date BETWEEN %s AND %s
                GROUP BY intent ORDER BY COUNT(*) DESC
            """, (tenant_id, start, end))
            intent_breakdown = {r[0]: int(r[1]) for r in cur.fetchall()}

        # Resolution breakdown for funnel chart
        resolution_breakdown = {}
        if _table_exists("calls"):
            cur.execute("""
                SELECT resolution_status, COUNT(*) FROM calls
                WHERE tenant_id = %s AND started_at::date BETWEEN %s AND %s
                GROUP BY resolution_status ORDER BY COUNT(*) DESC
            """, (tenant_id, start, end))
            resolution_breakdown = {r[0]: int(r[1]) for r in cur.fetchall()}

        knowledge_gaps = 0
        if _table_exists("knowledge_gaps"):
            cur.execute("SELECT COUNT(*) FROM knowledge_gaps WHERE tenant_id = %s AND status = 'new'", (tenant_id,))
            knowledge_gaps = cur.fetchone()[0]

    return {
        "range": {"from": str(start), "to": str(end), "days": (end - start).days + 1},
        "kpis": current,
        "trends": trends,
        "previous_period": previous,
        "daily_calls": daily,
        "recent_conversations": recent,
        "upcoming_appointments": upcoming,
        "needs_attention": attention[:8],
        "knowledge_gaps_new": int(knowledge_gaps or 0),
        "intent_breakdown": intent_breakdown,
        "resolution_breakdown": resolution_breakdown,
    }


@app.get("/api/admin/calls")
async def admin_calls(request: Request, page: int = 1, per_page: int = 20, status: str = "", search: str = "", from_: str = "", to: str = ""):
    tenant_id = get_current_tenant(request)
    page = max(1, page)
    per_page = min(100, max(1, per_page))
    where = ["tenant_id = %s"]
    params = [tenant_id]
    if status:
        where.append("resolution_status = %s")
        params.append(status)
    if search:
        where.append("(caller ILIKE %s OR phone ILIKE %s OR COALESCE(summary, '') ILIKE %s)")
        params.extend([f"%{search}%"] * 3)
    start, end = _parse_date_range(from_, to)
    if from_ or to:
        where.append("started_at::date BETWEEN %s AND %s")
        params.extend([start, end])
    where_sql = " AND ".join(where)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM calls WHERE {where_sql}", tuple(params))
        total = cur.fetchone()[0]
        cur.execute(f"""
            SELECT id, caller, phone, started_at, duration_seconds, resolution_status, resolved_by, summary,
                   (SELECT COUNT(*) FROM messages WHERE conversation_id = 'call_' || calls.id)
            FROM calls WHERE {where_sql}
            ORDER BY started_at DESC LIMIT %s OFFSET %s
        """, tuple(params) + (per_page, (page - 1) * per_page))
        rows = [{
            "id": r[0], "caller": r[1], "phone": r[2], "started_at": str(r[3]), "duration_seconds": r[4],
            "resolution_status": r[5], "resolved_by": r[6], "summary": r[7], "message_count": int(r[8] or 0),
        } for r in cur.fetchall()]
    return {"calls": rows, "total": int(total), "page": page, "per_page": per_page}


@app.get("/api/admin/calls/{call_id}")
async def admin_call_detail(request: Request, call_id: str):
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM calls WHERE id = %s AND tenant_id = %s", (call_id, tenant_id))
        col_names = [d[0] for d in cur.description]
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Call not found")
        call = dict(zip(col_names, row))
        for k in ("transcript", "costs", "raw"):
            if k in call and call[k] is not None:
                try:
                    call[k] = json.loads(call[k])
                except (json.JSONDecodeError, TypeError):
                    pass
        cur.execute("""
            SELECT role, content, confidence, resolved, sources, tools_used, created_at FROM messages
            WHERE tenant_id = %s AND conversation_id = %s ORDER BY created_at ASC
        """, (tenant_id, f"call_{call_id}"))
        msgs = []
        for r in cur.fetchall():
            msg = {"role": r[0], "content": r[1], "confidence": r[2], "resolved": r[3],
                   "created_at": str(r[6])}
            for k, v in (("sources", r[4]), ("tools_used", r[5])):
                try:
                    msg[k] = json.loads(v) if v else []
                except (json.JSONDecodeError, TypeError):
                    msg[k] = []
            msgs.append(msg)
    call["messages"] = msgs
    return call


@app.get("/api/admin/conversations")
async def admin_conversations(request: Request, page: int = 1, per_page: int = 20, channel: str = "", status: str = ""):
    tenant_id = get_current_tenant(request)
    page = max(1, page)
    per_page = min(100, max(1, per_page))
    where = ["tenant_id = %s"]
    params = [tenant_id]
    if channel:
        where.append("channel = %s")
        params.append(channel)
    if status:
        where.append("resolution_status = %s")
        params.append(status)
    where_sql = " AND ".join(where)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM conversations WHERE {where_sql}", tuple(params))
        total = cur.fetchone()[0]
        cur.execute(f"""
            SELECT id, channel, call_id, summary, resolution_status, intent, created_at, updated_at,
                   (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id)
            FROM conversations WHERE {where_sql}
            ORDER BY updated_at DESC LIMIT %s OFFSET %s
        """, tuple(params) + (per_page, (page - 1) * per_page))
        rows = [{
            "id": r[0], "channel": r[1], "call_id": r[2], "summary": r[3], "resolution_status": r[4],
            "intent": r[5], "created_at": str(r[6]), "updated_at": str(r[7]), "message_count": int(r[8] or 0),
        } for r in cur.fetchall()]
    return {"conversations": rows, "total": int(total), "page": page, "per_page": per_page}


@app.get("/api/admin/conversations/{conv_id}")
async def admin_conversation_detail(request: Request, conv_id: str):
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id FROM conversations WHERE id = %s AND tenant_id = %s", (conv_id, tenant_id))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Conversation not found")
        cur.execute("""
            SELECT role, content, confidence, resolved, sources, tools_used, created_at FROM messages
            WHERE tenant_id = %s AND conversation_id = %s ORDER BY created_at ASC
        """, (tenant_id, conv_id))
        msgs = []
        for r in cur.fetchall():
            msg = {"role": r[0], "content": r[1], "confidence": r[2], "resolved": r[3], "created_at": str(r[6])}
            for k, v in (("sources", r[4]), ("tools_used", r[5])):
                try:
                    msg[k] = json.loads(v) if v else []
                except (json.JSONDecodeError, TypeError):
                    msg[k] = []
            msgs.append(msg)
    return {"conversation_id": conv_id, "messages": msgs}


@app.get("/api/admin/appointments")
async def admin_appointments(request: Request, page: int = 1, per_page: int = 50, status: str = "", source: str = "", from_: str = "", to: str = ""):
    tenant_id = get_current_tenant(request)
    page = max(1, page)
    per_page = min(200, max(1, per_page))
    where = ["tenant_id = %s"]
    params = [tenant_id]
    if status:
        where.append("status = %s")
        params.append(status)
    if source:
        where.append("source = %s")
        params.append(source)
    start, end = _parse_date_range(from_, to)
    if from_ or to:
        where.append("start_time::date BETWEEN %s AND %s")
        params.extend([start, end])
    where_sql = " AND ".join(where)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM appointments WHERE {where_sql}", tuple(params))
        total = cur.fetchone()[0]
        cur.execute(f"""
            SELECT id, cal_booking_id, customer_name, customer_email, customer_phone, start_time, end_time,
                   event_type, status, source, call_id, created_at
            FROM appointments WHERE {where_sql} ORDER BY start_time DESC LIMIT %s OFFSET %s
        """, tuple(params) + (per_page, (page - 1) * per_page))
        rows = [{
            "id": r[0], "cal_booking_id": r[1], "customer_name": r[2], "customer_email": r[3],
            "customer_phone": r[4], "start_time": str(r[5]), "end_time": str(r[6]), "event_type": r[7],
            "status": r[8], "source": r[9], "call_id": r[10], "created_at": str(r[11]),
        } for r in cur.fetchall()]
    return {"appointments": rows, "total": int(total), "page": page, "per_page": per_page}


@app.get("/api/admin/knowledge-gaps")
async def admin_knowledge_gaps(request: Request, page: int = 1, per_page: int = 20, status: str = ""):
    tenant_id = get_current_tenant(request)
    page = max(1, page)
    per_page = min(100, max(1, per_page))
    where, params = ["tenant_id = %s"], [tenant_id]
    if status:
        where.append("status = %s")
        params.append(status)
    where_sql = " AND ".join(where)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM knowledge_gaps WHERE {where_sql}", tuple(params))
        total = cur.fetchone()[0]
        cur.execute(f"""
            SELECT id, question, normalized_question, occurrence_count, confidence, status, conversation_ids, call_id, first_seen_at, last_seen_at
            FROM knowledge_gaps WHERE {where_sql}
            ORDER BY occurrence_count DESC, last_seen_at DESC LIMIT %s OFFSET %s
        """, tuple(params) + (per_page, (page - 1) * per_page))
        rows = [{
            "id": r[0], "question": r[1], "occurrence_count": int(r[3]), "confidence": float(r[4] or 0),
            "status": r[5], "call_id": r[7], "first_seen_at": str(r[8]), "last_seen_at": str(r[9]),
        } for r in cur.fetchall()]
    return {"gaps": rows, "total": int(total), "page": page, "per_page": per_page}


@app.patch("/api/admin/knowledge-gaps/{gap_id}")
async def admin_knowledge_gap_update(request: Request, gap_id: str):
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    new_status = raw.get("status", "")
    if new_status not in ("new", "reviewing", "resolved", "ignored"):
        raise HTTPException(status_code=400, detail="Invalid status")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE knowledge_gaps SET status = %s WHERE id = %s AND tenant_id = %s", (new_status, gap_id, tenant_id))
        conn.commit()
    return {"status": "ok"}


@app.get("/api/admin/analytics/ai-performance")
async def admin_ai_performance(request: Request, from_: str = "", to: str = "", days: int = 30):
    """AI performance: resolution breakdown, tool usage, avg confidence, daily series."""
    tenant_id = get_current_tenant(request)
    start, end = _parse_date_range(from_, to, days if days > 0 else 30)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*),
                   COUNT(*) FILTER (WHERE resolution_status IN ('ai_resolved','appointment_completed','ticket_created')),
                   COUNT(*) FILTER (WHERE resolved_by = 'ai')
            FROM calls WHERE tenant_id = %s AND started_at::date BETWEEN %s AND %s
        """, (tenant_id, start, end))
        total, ai_resolved, resolved_by_ai = cur.fetchone()
        cur.execute("""
            SELECT resolution_status, COUNT(*) FROM calls
            WHERE tenant_id = %s AND started_at::date BETWEEN %s AND %s
            GROUP BY resolution_status ORDER BY COUNT(*) DESC
        """, (tenant_id, start, end))
        breakdown = {r[0]: int(r[1]) for r in cur.fetchall()}
        cur.execute("""
            SELECT tool, COUNT(*) FROM (
                SELECT jsonb_array_elements_text(tools_used) AS tool FROM messages
                WHERE tenant_id = %s AND tools_used IS NOT NULL AND tools_used != '[]'
            ) t GROUP BY tool ORDER BY COUNT(*) DESC
        """, (tenant_id,))
        tool_usage = [{"tool": r[0], "count": int(r[1])} for r in cur.fetchall()]
        cur.execute("""
            SELECT created_at::date, AVG(confidence), COUNT(*) FROM messages
            WHERE tenant_id = %s AND confidence > 0 AND created_at::date BETWEEN %s AND %s
            GROUP BY created_at::date ORDER BY created_at::date
        """, (tenant_id, start, end))
        confidence_series = [{"date": str(r[0]), "avg_confidence": round(float(r[1] or 0), 3), "count": int(r[2])} for r in cur.fetchall()]
    return {
        "range": {"from": str(start), "to": str(end)},
        "total_calls": int(total or 0),
        "ai_resolved": int(ai_resolved or 0),
        "resolution_rate": round(float(ai_resolved or 0) / max(1, int(total or 0)), 3),
        "resolution_breakdown": breakdown,
        "tool_usage": tool_usage,
        "confidence_series": confidence_series,
    }


@app.get("/api/admin/assistant/config")
async def admin_assistant_config(request: Request):
    """Return live (Vapi) + draft (local) assistant configuration."""
    tenant_id = get_current_tenant(request)
    assistant_id = ""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT assistant_id FROM tenants WHERE id = %s", (tenant_id,))
        row = cur.fetchone()
        if row:
            assistant_id = row[0] or ""
    live = await get_assistant(assistant_id) if assistant_id else None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, status, config, created_at, published_at FROM assistant_versions
            WHERE tenant_id = %s AND status = 'draft' ORDER BY created_at DESC LIMIT 1
        """, (tenant_id,))
        r = cur.fetchone()
        draft = {"id": r[0], "status": r[1], "config": r[2] if isinstance(r[2], dict) else (json.loads(r[2]) if r[2] else {}), "created_at": str(r[3]), "published_at": str(r[4])} if r else None
    return {"assistant_id": assistant_id, "live": live, "draft": draft}


@app.patch("/api/admin/assistant/config")
async def admin_assistant_config_update(request: Request):
    """Save a draft assistant config (not applied to Vapi until published)."""
    tenant_id = get_current_tenant(request)
    raw = await request.json()
    config = raw.get("config", {})
    if not config:
        raise HTTPException(status_code=400, detail="config is required")
    config_id = f"draft_{tenant_id[:8]}_{int(datetime.now(timezone.utc).timestamp())}"
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO assistant_versions (id, tenant_id, status, config, created_at)
            VALUES (%s, %s, 'draft', %s, NOW())
        """, (config_id, tenant_id, json.dumps(config)))
        conn.commit()
    return {"status": "ok", "draft_id": config_id}


@app.post("/api/admin/assistant/publish")
async def admin_assistant_publish(request: Request):
    """Publish draft config to Vapi and mark live."""
    tenant_id = get_current_tenant(request)
    draft_id = ""
    try:
        raw = await request.json()
        draft_id = raw.get("draft_id", "")
    except Exception:
        pass
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT config, status FROM assistant_versions WHERE id = %s AND tenant_id = %s", (draft_id, tenant_id))
        row = cur.fetchone()
        if not row or row[1] != "draft":
            raise HTTPException(status_code=404, detail="Draft not found")
        config = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        cur.execute("SELECT assistant_id FROM tenants WHERE id = %s", (tenant_id,))
        assistant_id = (cur.fetchone() or [None])[0] or ""
    if not assistant_id:
        raise HTTPException(status_code=400, detail="No assistant configured for this tenant")
    from scripts.vapi_client import update_assistant
    ok = await update_assistant(assistant_id, config)
    if not ok:
        raise HTTPException(status_code=502, detail="Vapi assistant update failed")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE assistant_versions SET status = 'live', published_at = NOW() WHERE id = %s", (draft_id,))
        conn.commit()
    return {"status": "ok", "published": draft_id}


# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health_check():
    try:
        from workers.ingestion_worker import RedisQueue
        queue = RedisQueue()
        redis_status = "connected" if queue.redis.ping() else "disconnected"
    except Exception:
        redis_status = "unavailable"

    return {"status": "healthy", "redis": redis_status, "vapi_configured": bool(VAPI_KEY), "openai_configured": bool(os.getenv("OPENAI_API_KEY"))}


# ==================== SPA Catch-All (must be last) ====================

frontend_index = frontend_dist / "index.html" if frontend_dist.exists() else None


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if frontend_index and not any(full_path.startswith(p) for p in ("api/", "admin/", "tool/", "webhook/", "ws/", "static/", "assets/", "health")):
        return FileResponse(frontend_index)
    return HTMLResponse(content="<h1>Not found</h1>", status_code=404)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
