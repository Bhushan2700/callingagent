import os
import re
import sys
import json
import asyncio
import logging
import httpx
import redis as redis_module
import psycopg2
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File
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
from scripts.auth import hash_password, verify_password, create_token, decode_token
from scripts.vapi_client import create_assistant
from scripts.storage import storage

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


def tenant_id_by_assistant(assistant_id: str) -> str:
    """Map a Vapi assistant_id back to its owning tenant."""
    if not assistant_id:
        return ""
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM tenants WHERE assistant_id = %s", (assistant_id,))
            row = cur.fetchone()
            app_logger.info(f"ASSISTANT LOOKUP: assistant_id='{assistant_id}' -> tenant_id='{row[0] if row else 'NOT FOUND'}'")
            return row[0] if row else ""
    except Exception:
        return ""


def _resolve_tenant_from_raw(raw: dict) -> str:
    """Resolve tenant server-side from the payload (assistant id or validated tenant_id).

    Handles both flat Vapi tool args and the nested message.toolCalls format.
    """
    merged = dict(raw)
    tc = (raw.get("message") or {}).get("toolCalls") or []
    if tc and isinstance(tc, list):
        fn = tc[0].get("function", {})
        args = fn.get("arguments", "{}")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except (json.JSONDecodeError, TypeError):
                args = {}
        if isinstance(args, dict):
            merged.update(args)

    assistant_id = merged.get("assistant_id", "") or (merged.get("assistant") or {}).get("id", "")
    if assistant_id:
        tenant_id = tenant_id_by_assistant(assistant_id)
        if tenant_id:
            return tenant_id

    ten_id = str(merged.get("tenant_id", "")).strip()
    if ten_id and tenant_exists(ten_id):
        return ten_id
    app_logger.info(f"TOOL RESOLVE FAILED: raw_keys={list(raw.keys())} merged_keys={list(merged.keys())} assistant_id='{assistant_id}' ten_id='{ten_id}'")
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
    elif VAPI_KEY:
        try:
            assistant_id = await create_assistant(name, tenant_id) or ""
            if not assistant_id:
                app_logger.warning(f"Vapi assistant creation failed for {email}")
        except Exception as e:
            app_logger.warning(f"Vapi assistant creation failed for {email}: {e}")

    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO tenants (id, email, password_hash, name, assistant_id) VALUES (%s, %s, %s, %s, %s)",
            (tenant_id, email, hashed, name, assistant_id),
        )
        conn.commit()

    token = create_token(tenant_id)
    return {"token": token, "tenant_id": tenant_id, "name": name, "email": email, "assistant_id": assistant_id}


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
        cur.execute("SELECT id, password_hash, name, assistant_id FROM tenants WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        tenant_id, password_hash, name, assistant_id = row

    if not verify_password(password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    assistant_id = _ensure_assistant(tenant_id, email, assistant_id or "")
    token = create_token(tenant_id)
    return {"token": token, "tenant_id": tenant_id, "name": name, "email": email, "assistant_id": assistant_id}


@app.get("/api/auth/me")
async def me(request: Request):
    tenant_id = get_current_tenant(request)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, email, name, assistant_id, created_at FROM tenants WHERE id = %s", (tenant_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Tenant not found")
        assistant_id = _ensure_assistant(row[0], row[1], row[3] or "")
        return {"tenant_id": row[0], "email": row[1], "name": row[2], "assistant_id": assistant_id, "created_at": row[4].isoformat()}


# ==================== RAG SEARCH TOOL ====================

@app.post("/tool/search_knowledge")
async def search_knowledge(request: Request):
    """Tool endpoint for Vapi voice agent to search the knowledge base."""
    try:
        raw = await request.json()
        query = raw.get("query", "")
        tenant_id = _resolve_tenant_from_raw(raw)
        app_logger.info(f"SEARCH: raw={json.dumps(raw)[:500]} query='{query}' tenant_id='{tenant_id}'")
        if not tenant_id:
            return {"result": "Sorry, I couldn't identify your account. Please try again."}

        result = await receptionist.search(query, tenant_id=tenant_id)
        chunks = result.get("chunks", [])
        app_logger.info(f"SEARCH RESULT: tenant_id='{tenant_id}' chunks_found={len(chunks)} confidence={result.get('confidence')}")

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
    except Exception as e:
        app_logger.error(f"SEARCH UNHANDLED ERROR: {e}", exc_info=True)
        return {"result": "Search temporarily unavailable. Please try again."}


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
    raw = await request.json()

    # Log the raw Vapi request for debugging
    print(f"BOOKING_RAW_REQUEST: {json.dumps(raw, indent=2, default=str)}")

    params, tool_call_id = _parse_vapi_request(raw)

    tenant_id = _resolve_tenant_from_raw(raw)
    if not tenant_id:
        err = "Sorry, I couldn't identify your account. Please try again."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

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
        result = await cal_client.create_booking(start=start_iso, attendee_name=valid_name, attendee_email=email, phone=phone, notes=f"Enquiry: {valid_enquiry} | Tenant: {tenant_id}")

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
    raw = await request.json()
    params, tool_call_id = _parse_vapi_request(raw)
    tenant_id = _resolve_tenant_from_raw(raw)
    name = params.get("name", "").strip()
    phone = params.get("phone", "").strip()
    email = params.get("email", "").strip()
    issue = params.get("issue", "").strip()

    if not tenant_id:
        err = "Sorry, I couldn't identify your account. Please try again."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

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
            config = {**config, **json.loads(row[0])}
        cur.execute("SELECT assistant_id FROM tenants WHERE id = %s", (tenant_id,))
        t = cur.fetchone()
        if t and t[0]:
            config["vapiAssistant"] = t[0]
    return config


def _save_widget_db(tenant_id: str, config: dict):
    merged = dict(DEFAULT_WIDGET_CONFIG)
    merged.update(config)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO widget_configs (tenant_id, config) VALUES (%s, %s) "
            "ON CONFLICT (tenant_id) DO UPDATE SET config = %s, updated_at = NOW()",
            (tenant_id, json.dumps(merged), json.dumps(merged)),
        )
        conn.commit()


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
    _save_widget_db(tenant_id, raw)
    return {"status": "ok", "config": _get_widget_db(tenant_id)}


@app.get("/admin/widget", response_class=HTMLResponse)
async def admin_widget_page():
    if frontend_index:
        return FileResponse(frontend_index)
    admin_html = static_dir / "admin-widget.html"
    if admin_html.exists():
        return HTMLResponse(content=admin_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Admin Widget page not found</h1>", status_code=404)


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
        response = await receptionist.get_response(message, history, tenant_id=tenant_id)
        return {"response": response}
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
        response = await receptionist.get_response(message, history, tenant_id=tenant_id)
        return {"response": response}
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
    """Minimal Request stand-in so tool handlers only need .json()."""
    def __init__(self, data: dict):
        self._data = data

    async def json(self):
        return self._data


@app.post("/webhook/vapi")
async def vapi_webhook(request: Request):
    """Receive Vapi assistant messages. Acknowledges status events and
    dispatches function-call messages to the existing /tool/* handlers."""
    raw = await request.json()
    message = raw.get("message", {})
    msg_type = message.get("type", "")

    if msg_type in ("status-update", "end-of-call-report", "transcript", "transcript-transcript-update"):
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
            results.append({"toolCallId": tc.get("id"), "result": (resp or {}).get("result", "")})

    if results:
        return {"results": results}
    return {"status": "received"}


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
