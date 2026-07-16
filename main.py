import os
import re
import sys
import json
import asyncio
import logging
import httpx
from pathlib import Path
from datetime import datetime, timezone
from fastapi import FastAPI, Request, Response, HTTPException, UploadFile, File, WebSocket
from fastapi.responses import PlainTextResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
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
from scripts.chromadb_writer import ChromaDBWriter
from scripts.unified_ingest import UnifiedIngest
from scripts.cal_client import CalClient

app = FastAPI()
app_logger = logging.getLogger("app_logger")
receptionist = LoggixReceptionist()
writer = ChromaDBWriter()
ingest = UnifiedIngest()
cal_client = CalClient()

sessions = {}

VAPI_KEY = os.getenv("VAPI_PRIVATE_KEY")
VAPI_ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID", "")
VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID", "")
VAPI_BASE = "https://api.vapi.ai"

TELNYX_API_KEY = os.getenv("TELNYX_API_KEY", "")
TELNYX_PHONE_NUMBER = os.getenv("TELNYX_PHONE_NUMBER", "")
PUBLIC_URL = os.getenv("PUBLIC_URL", "")  # e.g. wss://your-app.up.railway.app

active_calls: set = set()  # ponytail: global set, single-bot concurrency

class ToolRequest(BaseModel):
    query: str

class DeleteRequest(BaseModel):
    doc_id: str


# ==================== RAG SEARCH TOOL ====================

@app.post("/tool/search_knowledge")
async def search_knowledge(request: Request):
    """Tool endpoint for Vapi voice agent to search the knowledge base."""
    raw = await request.json()
    query = raw.get("query", "")
    
    result = await receptionist.search(query)
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
    phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace(".", "").replace(",", "")
    word_to_digit = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9", "oh": "0", "o": "0"}
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
    email = email.replace(" at the rate ", "@").replace(" at ", "@").replace(" dot ", ".")
    email = email.replace(" ", "")
    email = email.replace("gmail.com", "gmail.com").replace("gmaill.com", "gmail.com").replace("gmial.com", "gmail.com")
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
    time_str = time_str.lower().replace("o'clock", ":00").replace("oclock", ":00").replace("in the morning", "am").replace("in the afternoon", "pm")
    parsed = dateparser.parse(time_str, settings={'TIMEZONE': 'UTC', 'RETURN_AS_TIMEZONE_AWARE': True})
    if not parsed:
        return None
    return parsed.strftime("%H:%M")


@app.post("/tool/book_appointment")
async def book_appointment(request: Request):
    """Book appointment using Cal.com API."""
    raw = await request.json()
    params, tool_call_id = _parse_vapi_request(raw)

    name = params.get("name", "").strip()
    phone = params.get("phone", "").strip()
    email = params.get("email", "").strip()
    enquiry_topic = params.get("enquiry_topic", "").strip()
    appointment_date = params.get("appointment_date", "").strip()
    appointment_time = params.get("appointment_time", "").strip()

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

    print(f"BOOKING_RECEIVED: name={name}, phone={phone}, email={email}, date={appointment_date}, time={appointment_time}, topic={enquiry_topic}")

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

TICKETS_FILE = Path(__file__).parent / "data" / "tickets.json"


def _load_tickets() -> dict:
    if TICKETS_FILE.exists():
        with open(TICKETS_FILE, "r") as f:
            return json.load(f)
    return {"tickets": [], "next_id": 1}


def _save_tickets(data: dict):
    TICKETS_FILE.parent.mkdir(exist_ok=True)
    with open(TICKETS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _generate_ticket_id(data: dict) -> str:
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    ticket_num = data.get("next_id", 1)
    ticket_id = f"TKT-{today}-{ticket_num:03d}"
    data["next_id"] = ticket_num + 1
    return ticket_id


@app.post("/tool/raise_ticket")
async def raise_ticket(request: Request):
    raw = await request.json()
    params, tool_call_id = _parse_vapi_request(raw)
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

    data = _load_tickets()
    ticket_id = _generate_ticket_id(data)
    ticket = {"id": ticket_id, "name": name, "phone": phone, "email": email, "issue": issue, "status": "open", "created_at": datetime.now(timezone.utc).isoformat()}
    data["tickets"].append(ticket)
    _save_tickets(data)

    result_text = f"Your ticket has been created successfully! Ticket ID: {ticket_id}. Our team will review your issue and get back to you soon."

    if tool_call_id:
        return {"results": [{"toolCallId": tool_call_id, "result": result_text}]}
    return {"result": result_text}


@app.get("/tickets")
async def list_tickets():
    data = _load_tickets()
    return {"tickets": data.get("tickets", []), "total": len(data.get("tickets", []))}


@app.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str):
    data = _load_tickets()
    for ticket in data.get("tickets", []):
        if ticket["id"] == ticket_id:
            return ticket
    raise HTTPException(status_code=404, detail=f"Ticket not found: {ticket_id}")


@app.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, request: Request):
    raw = await request.json()
    new_status = raw.get("status", "")
    if new_status not in ["open", "in_progress", "closed"]:
        raise HTTPException(status_code=400, detail="Status must be open, in_progress, or closed")
    data = _load_tickets()
    for ticket in data.get("tickets", []):
        if ticket["id"] == ticket_id:
            ticket["status"] = new_status
            _save_tickets(data)
            return ticket
    raise HTTPException(status_code=404, detail=f"Ticket not found: {ticket_id}")


# ==================== ADMIN ENDPOINTS ====================

@app.get("/admin/docs")
async def list_documents():
    docs = writer.list_documents()
    return {"documents": docs, "total": len(docs)}


@app.get("/admin/docs/{doc_id}")
async def get_document(doc_id: str):
    info = writer.get_document_info(doc_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    return info


@app.delete("/admin/docs/{doc_id}")
async def delete_document(doc_id: str):
    count = writer.delete_document(doc_id)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    return {"deleted_chunks": count, "doc_id": doc_id}


@app.post("/admin/docs/{doc_id}/reindex")
async def reindex_document(doc_id: str):
    from workers.ingestion_worker import RedisQueue
    queue = RedisQueue()
    job = {"action": "reindex", "doc_id": doc_id}
    job_id = queue.enqueue(job)
    return {"status": "queued", "job_id": job_id, "doc_id": doc_id}


@app.post("/admin/ingest/trigger")
async def trigger_ingest(path: str = "knowledge/documents/incoming"):
    folder_path = Path(__file__).parent / path
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder not found: {path}")
    results = await ingest.ingest_directory(folder_path, recursive=False)
    total_chunks = sum(results.values())
    return {"status": "completed", "files_processed": len(results), "total_chunks": total_chunks, "details": results}


@app.post("/admin/ingest/reindex")
async def full_reindex(confirm: bool = False):
    if not confirm:
        return {"status": "confirmation_required", "message": "Set confirm=true to proceed"}
    results = await ingest.full_reindex()
    total_chunks = sum(results.values())
    return {"status": "completed", "files_processed": len(results), "total_chunks": total_chunks, "details": results}


@app.post("/admin/upload")
async def upload_document(file: UploadFile = File(...)):
    allowed_ext = {".md", ".pdf", ".txt", ".json"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"File type {ext} not supported. Use: {', '.join(allowed_ext)}")
    incoming_dir = Path(__file__).parent / "knowledge" / "documents" / "incoming"
    incoming_dir.mkdir(parents=True, exist_ok=True)
    file_path = incoming_dir / file.filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    try:
        result = await ingest.ingest_file(file_path)
        return {"status": "success", "filename": file.filename, "chunks": result, "message": f"Successfully ingested {file.filename}: {result} chunks"}
    except Exception as e:
        app_logger.warning(f"Ingestion error for {file.filename}: {e}")
        return {"status": "error", "filename": file.filename, "message": f"File saved but ingestion failed: {str(e)}"}


# ==================== STATIC FILES ====================

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/upload", response_class=HTMLResponse)
async def upload_page():
    upload_html = static_dir / "upload.html"
    if upload_html.exists():
        return HTMLResponse(content=upload_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Upload page not found</h1>", status_code=404)


@app.get("/voice", response_class=HTMLResponse)
async def voice_page():
    voice_html = static_dir / "voice.html"
    if voice_html.exists():
        return HTMLResponse(content=voice_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Voice page not found</h1>", status_code=404)


@app.get("/tickets-page", response_class=HTMLResponse)
async def tickets_page():
    tickets_html = static_dir / "tickets.html"
    if tickets_html.exists():
        return HTMLResponse(content=tickets_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Tickets page not found</h1>", status_code=404)


# ==================== TELNYX VOICE API (Call Control) ====================

from loguru import logger as log
import httpx as httpx_client


@app.post("/webhook/telnyx")
async def telnyx_webhook(request: Request):
    """Handle Telnyx Voice API webhooks — answer call and start streaming."""
    try:
        body = await request.json()
    except Exception:
        try:
            form = await request.form()
            body = dict(form)
        except Exception:
            body = {}

    event = body.get("event", "")
    data = body.get("data", {})
    call_control_id = data.get("call_control_id", "")

    log.info(f"TELNYX EVENT: {event}, call: {call_control_id}")

    if event == "call.initiated":
        if call_control_id in active_calls:
            log.warning(f"Call {call_control_id} already active, skipping")
        else:
            # Auto-detect host from the incoming request
            host = request.url.hostname
            port = request.url.port
            scheme = "wss"  # Telnyx always expects wss for stream_url
            if port and port not in (443, 80):
                stream_base = f"{scheme}://{host}:{port}"
            else:
                stream_base = f"{scheme}://{host}"
            asyncio.create_task(_answer_call(call_control_id, stream_base))

    elif event in ("call.ended", "call.hangup"):
        active_calls.discard(call_control_id)
        log.info(f"Call {call_control_id} ended, removed from active set")

    return {"status": "ok"}


async def _answer_call(call_control_id: str, stream_base: str):
    """Answer call and start WebSocket media streaming."""
    if not TELNYX_API_KEY:
        log.error("TELNYX_API_KEY not set!")
        return

    # Concurrency guard — only one call at a time
    if len(active_calls) > 0:
        log.warning(f"Bot busy with {len(active_calls)} call(s), rejecting {call_control_id}")
        async with httpx_client.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/hangup",
                headers={"Authorization": f"Bearer {TELNYX_API_KEY}", "Content-Type": "application/json"},
            )
        return

    active_calls.add(call_control_id)
    stream_url = f"{stream_base}/ws/call"

    try:
        async with httpx_client.AsyncClient(timeout=30) as client:
            # Answer the call
            log.info(f"Answering call {call_control_id}...")
            answer_resp = await client.post(
                f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/answer",
                headers={"Authorization": f"Bearer {TELNYX_API_KEY}", "Content-Type": "application/json"},
                json={},
            )
            log.info(f"Answer: {answer_resp.status_code} {answer_resp.text[:200]}")

            if answer_resp.status_code not in (200, 201):
                log.error(f"Failed to answer: {answer_resp.text}")
                active_calls.discard(call_control_id)
                return

            # Start bidirectional media streaming
            log.info(f"Starting stream to {stream_url}")
            stream_resp = await client.post(
                f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/stream_start",
                headers={"Authorization": f"Bearer {TELNYX_API_KEY}", "Content-Type": "application/json"},
                json={"stream_url": stream_url, "stream_bidirectional": True},
            )
            log.info(f"Stream: {stream_resp.status_code} {stream_resp.text[:200]}")

            if stream_resp.status_code not in (200, 201):
                log.error(f"Failed to start stream: {stream_resp.text}")
                active_calls.discard(call_control_id)
    except Exception as e:
        log.error(f"Error handling call {call_control_id}: {e}")
        active_calls.discard(call_control_id)


@app.websocket("/ws/call")
async def websocket_call(websocket: WebSocket):
    """WebSocket endpoint for Telnyx media streaming — connects to Pipecat bot."""
    from pipecat_bot import bot
    from pipecat.runner.types import RunnerArguments

    await websocket.accept()
    log.info("Telnyx WebSocket connected")

    runner_args = RunnerArguments(websocket=websocket, handle_sigint=False)
    try:
        await bot(runner_args)
    finally:
        # Cleanup any active call when WS disconnects
        # ponytail: clear all since single-bot only handles one call
        if active_calls:
            log.info(f"WS disconnected, clearing active calls: {active_calls}")
            active_calls.clear()


# ==================== HEALTH CHECK ====================

@app.get("/health")
async def health_check():
    try:
        from workers.ingestion_worker import RedisQueue
        queue = RedisQueue()
        redis_status = "connected" if queue.redis.ping() else "disconnected"
    except Exception:
        redis_status = "unavailable"

    return {"status": "healthy", "redis": redis_status, "telnyx_configured": bool(TELNYX_API_KEY)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
