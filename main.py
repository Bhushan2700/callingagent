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

class ToolRequest(BaseModel):
    query: str

class DeleteRequest(BaseModel):
    doc_id: str

class ReindexRequest(BaseModel):
    confirm: bool = False


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

    # Return simple format for Vapi API Request tool
    return {"result": text}


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
    """Parse phone number from voice input, handling speech recognition errors."""
    phone = phone.strip()
    
    # Remove common separators
    phone = phone.replace(" ", "")
    phone = phone.replace("-", "")
    phone = phone.replace("(", "")
    phone = phone.replace(")", "")
    phone = phone.replace(".", "")
    phone = phone.replace(",", "")
    
    # Handle spoken word numbers
    word_to_digit = {
        "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
        "five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
        "oh": "0", "o": "0"
    }
    for word, digit in word_to_digit.items():
        phone = phone.replace(word, digit)
    
    # Keep only digits and + prefix
    result = ""
    for c in phone:
        if c.isdigit() or c == "+":
            result += c
    
    # Add + prefix if it looks like international number
    if len(result) > 10 and not result.startswith("+"):
        result = "+" + result
    
    return result if len(result) >= 7 else None


def _parse_email(email: str) -> str | None:
    """Parse email from voice input, handling speech recognition errors."""
    email = email.strip().lower()
    
    # Remove common speech artifacts
    email = email.replace(" at the rate ", "@")
    email = email.replace(" at ", "@")
    email = email.replace(" at ", "@")
    email = email.replace(" dot ", ".")
    email = email.replace(" dot ", ".")
    email = email.replace(" dot ", ".")
    
    # Remove spaces (speech recognition often adds spaces between characters)
    email = email.replace(" ", "")
    
    # Handle common misspellings
    email = email.replace("gmail.com", "gmail.com")
    email = email.replace("gmaill.com", "gmail.com")
    email = email.replace("gmial.com", "gmail.com")
    email = email.replace("gamil.com", "gmail.com")
    email = email.replace("yahooo.com", "yahoo.com")
    email = email.replace("hotmail.com", "hotmail.com")
    email = email.replace("outlok.com", "outlook.com")
    
    # Validate basic structure
    if "@" not in email:
        return None
    
    parts = email.split("@")
    if len(parts) != 2:
        return None
    
    local, domain = parts
    if not local or not domain:
        return None
    
    if "." not in domain:
        return None
    
    # Check domain has valid TLD
    tld = domain.split(".")[-1]
    if len(tld) < 2:
        return None
    
    return email


def _validate_enquiry(enquiry: str) -> str | None:
    enquiry = enquiry.strip()
    if len(enquiry) < 2 or len(enquiry) > 500:
        return None
    return enquiry


def _validate_date(date_str: str) -> str | None:
    """Parse date string and return YYYY-MM-DD format."""
    date_str = date_str.strip()
    if not date_str:
        return None
    
    # Handle common relative dates
    date_lower = date_str.lower()
    now = datetime.now(timezone.utc)
    
    if date_lower in ["today", "now"]:
        return now.strftime("%Y-%m-%d")
    elif date_lower in ["tomorrow", "tmrw", "tmr"]:
        from datetime import timedelta
        return (now + timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Try to parse with dateparser
    parsed = dateparser.parse(
        date_str, 
        settings={
            'TIMEZONE': 'UTC', 
            'RETURN_AS_TIMEZONE_AWARE': True,
            'PREFER_DATES_FROM': 'future'
        }
    )
    if not parsed:
        return None
    
    # Allow today or future dates
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if parsed < today_start:
        return None
    
    return parsed.strftime("%Y-%m-%d")


def _validate_time(time_str: str) -> str | None:
    """Parse time string and return HH:MM format."""
    time_str = time_str.strip()
    if not time_str:
        return None
    
    # Handle common spoken time formats
    time_str = time_str.lower()
    time_str = time_str.replace("o'clock", ":00")
    time_str = time_str.replace("oclock", ":00")
    time_str = time_str.replace("in the morning", "am")
    time_str = time_str.replace("in the afternoon", "pm")
    time_str = time_str.replace("at night", "pm")
    
    parsed = dateparser.parse(
        time_str,
        settings={'TIMEZONE': 'UTC', 'RETURN_AS_TIMEZONE_AWARE': True}
    )
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

    # Validate phone - be lenient for voice input
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

    # Validate email - be lenient for voice input
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

    # Log what was received
    print(f"BOOKING_RECEIVED: name={name}, phone={phone}, email={email}, date={appointment_date}, time={appointment_time}, topic={enquiry_topic}")

    valid_date = _validate_date(appointment_date)
    if not valid_date:
        err = f"Please provide a valid future date. Got: {appointment_date}"
        print(f"DATE_ERROR: {appointment_date} -> None")
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}
    print(f"DATE_PARSED: {appointment_date} -> {valid_date}")

    valid_time = _validate_time(appointment_time)
    if not valid_time:
        err = "Please provide a valid time."
        if tool_call_id:
            return {"results": [{"toolCallId": tool_call_id, "error": err}]}
        return {"error": err}

    start_iso = f"{valid_date}T{valid_time}:00Z"

    # Log the booking attempt
    log_msg = f"BOOKING: name={valid_name}, email={email}, phone={phone}, date={valid_date}, time={valid_time}, iso={start_iso}, topic={valid_enquiry}"
    print(log_msg)
    app_logger.info(log_msg)

    try:
        result = await cal_client.create_booking(
            start=start_iso,
            attendee_name=valid_name,
            attendee_email=email,
            phone=phone,
            notes=f"Enquiry: {valid_enquiry}"
        )

        # Log the full response
        print(f"CAL_RESPONSE: {result}")
        app_logger.info(f"CAL_RESPONSE: {result}")

        if result.get("status") == "success":
            booking = result["data"]
            meeting_url = booking.get("location", "Cal Video")
            result_text = (
                f"Your consultation is booked! "
                f"You'll receive a calendar invite at {email} with the meeting link. "
                f"We'll call you at {phone} on {valid_date} at {valid_time} UTC."
            )
        else:
            # Get detailed error from Cal.com
            error = result.get("error", {})
            error_msg = error.get("message", "Unknown error") if isinstance(error, dict) else str(error)
            print(f"CAL_ERROR: {error_msg}")
            app_logger.error(f"CAL_ERROR: {error_msg}")
            
            if "already has booking" in error_msg.lower() or "not available" in error_msg.lower():
                result_text = "Sorry, that time slot is not available. Please try a different date or time."
            else:
                result_text = "Sorry, I couldn't book that appointment. Please try a different time or contact us directly."

    except Exception as e:
        print(f"CAL_EXCEPTION: {e}")
        app_logger.error(f"CAL_EXCEPTION: {e}")
        result_text = "Sorry, there was a technical issue with the booking system. Please try again later."

    if tool_call_id:
        return {"results": [{"toolCallId": tool_call_id, "result": result_text}]}
    return {"result": result_text}


@app.get("/admin/docs")
async def list_documents():
    """List all documents in ChromaDB with stats."""
    docs = writer.list_documents()
    return {"documents": docs, "total": len(docs)}


@app.get("/admin/docs/{doc_id}")
async def get_document(doc_id: str):
    """Get detailed info about a specific document."""
    info = writer.get_document_info(doc_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    return info


@app.delete("/admin/docs/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document from ChromaDB."""
    count = writer.delete_document(doc_id)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Document not found: {doc_id}")
    return {"deleted_chunks": count, "doc_id": doc_id}


@app.post("/admin/docs/{doc_id}/reindex")
async def reindex_document(doc_id: str):
    """Re-ingest a document from archive."""
    from workers.ingestion_worker import RedisQueue
    queue = RedisQueue()
    job = {
        "action": "reindex",
        "doc_id": doc_id
    }
    job_id = queue.enqueue(job)
    return {"status": "queued", "job_id": job_id, "doc_id": doc_id}


@app.post("/admin/ingest/trigger")
async def trigger_ingest(path: str = "knowledge/documents/incoming"):
    """Manually trigger ingestion for a folder."""
    folder_path = Path(__file__).parent / path
    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder not found: {path}")

    results = await ingest.ingest_directory(folder_path, recursive=False)
    total_chunks = sum(results.values())
    return {
        "status": "completed",
        "files_processed": len(results),
        "total_chunks": total_chunks,
        "details": results
    }


@app.post("/admin/ingest/reindex")
async def full_reindex(confirm: bool = False):
    """Full reindex of all knowledge files."""
    if not confirm:
        return {"status": "confirmation_required", "message": "Set confirm=true to proceed"}

    results = await ingest.full_reindex()
    total_chunks = sum(results.values())
    return {
        "status": "completed",
        "files_processed": len(results),
        "total_chunks": total_chunks,
        "details": results
    }


# Mount static files
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/upload", response_class=HTMLResponse)
async def upload_page():
    """Serve the document upload page."""
    upload_html = static_dir / "upload.html"
    if upload_html.exists():
        return HTMLResponse(content=upload_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Upload page not found</h1>", status_code=404)


@app.get("/voice", response_class=HTMLResponse)
async def voice_page():
    """Serve the voice UI page."""
    voice_html = static_dir / "voice.html"
    if voice_html.exists():
        return HTMLResponse(content=voice_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Voice page not found</h1>", status_code=404)


@app.post("/admin/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload a document for RAG ingestion."""
    # Validate file type
    allowed_ext = {".md", ".pdf", ".txt", ".json"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"File type {ext} not supported. Use: {', '.join(allowed_ext)}")
    
    # Save to incoming directory
    incoming_dir = Path(__file__).parent / "knowledge" / "documents" / "incoming"
    incoming_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = incoming_dir / file.filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Trigger ingestion
    try:
        result = await ingest.ingest_file(file_path)
        return {
            "status": "success",
            "filename": file.filename,
            "chunks": result,
            "message": f"Successfully ingested {file.filename}: {result} chunks"
        }
    except Exception as e:
        app_logger.warning(f"Ingestion error for {file.filename}: {e}")
        return {
            "status": "error",
            "filename": file.filename,
            "message": f"File saved but ingestion failed: {str(e)}"
        }


# ==================== TICKETING SYSTEM ====================

TICKETS_FILE = Path(__file__).parent / "data" / "tickets.json"


def _load_tickets() -> dict:
    """Load tickets from JSON file."""
    if TICKETS_FILE.exists():
        with open(TICKETS_FILE, "r") as f:
            return json.load(f)
    return {"tickets": [], "next_id": 1}


def _save_tickets(data: dict):
    """Save tickets to JSON file."""
    TICKETS_FILE.parent.mkdir(exist_ok=True)
    with open(TICKETS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _generate_ticket_id(data: dict) -> str:
    """Generate unique ticket ID like TKT-20260715-001."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    ticket_num = data.get("next_id", 1)
    ticket_id = f"TKT-{today}-{ticket_num:03d}"
    data["next_id"] = ticket_num + 1
    return ticket_id


@app.post("/tool/raise_ticket")
async def raise_ticket(request: Request):
    """Tool endpoint for Vapi voice agent to raise a ticket."""
    raw = await request.json()
    params, tool_call_id = _parse_vapi_request(raw)

    name = params.get("name", "").strip()
    phone = params.get("phone", "").strip()
    email = params.get("email", "").strip()
    issue = params.get("issue", "").strip()

    # Validate
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

    # Parse email
    if email:
        email = _parse_email(email) or email

    # Create ticket
    data = _load_tickets()
    ticket_id = _generate_ticket_id(data)

    ticket = {
        "id": ticket_id,
        "name": name,
        "phone": phone,
        "email": email,
        "issue": issue,
        "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    data["tickets"].append(ticket)
    _save_tickets(data)

    result_text = f"Your ticket has been created successfully! Ticket ID: {ticket_id}. Our team will review your issue and get back to you soon."

    print(f"TICKET_CREATED: {ticket_id} - {name} - {issue[:50]}")

    if tool_call_id:
        return {"results": [{"toolCallId": tool_call_id, "result": result_text}]}
    return {"result": result_text}


@app.get("/tickets")
async def list_tickets():
    """API endpoint to list all tickets."""
    data = _load_tickets()
    return {"tickets": data.get("tickets", []), "total": len(data.get("tickets", []))}


@app.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str):
    """API endpoint to get a specific ticket."""
    data = _load_tickets()
    for ticket in data.get("tickets", []):
        if ticket["id"] == ticket_id:
            return ticket
    raise HTTPException(status_code=404, detail=f"Ticket not found: {ticket_id}")


@app.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, request: Request):
    """API endpoint to update ticket status."""
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


@app.get("/tickets", response_class=HTMLResponse)
async def tickets_page():
    """Serve the tickets web UI page."""
    tickets_html = static_dir / "tickets.html"
    if tickets_html.exists():
        return HTMLResponse(content=tickets_html.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Tickets page not found</h1>", status_code=404)


# ==================== END TICKETING SYSTEM ====================


# ==================== TELNYX VOICE BOT (Pipecat) ====================

import httpx
import asyncio
from loguru import logger as log

async def _handle_incoming_call(call_control_id: str):
    """Answer call and start streaming — runs in background."""
    telnyx_api_key = os.getenv("TELNYX_API_KEY")
    host = "callingagent-production-41e3.up.railway.app"

    async with httpx.AsyncClient(timeout=30) as client:
        # Answer the call
        log.info(f"Answering call {call_control_id}...")
        answer_resp = await client.post(
            f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/answer",
            headers={
                "Authorization": f"Bearer {telnyx_api_key}",
                "Content-Type": "application/json",
            },
            json={},
        )
        log.info(f"Answer: {answer_resp.status_code} {answer_resp.text[:200]}")

        if answer_resp.status_code not in (200, 201):
            log.error(f"Failed to answer: {answer_resp.text}")
            return

        # Start media streaming (correct endpoint)
        log.info(f"Starting stream to wss://{host}/ws/call")
        stream_resp = await client.post(
            f"https://api.telnyx.com/v2/calls/{call_control_id}/actions/media_stream",
            headers={
                "Authorization": f"Bearer {telnyx_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "stream_url": f"wss://{host}/ws/call",
                "stream_bidirectional": True,
            },
        )
        log.info(f"Stream: {stream_resp.status_code} {stream_resp.text[:200]}")


@app.get("/test-webhook")
async def test_webhook():
    """Quick test to verify server is reachable."""
    log.info("Test webhook hit!")
    return {"status": "server reachable", "message": "If you see this, the server is working"}


@app.get("/webhook/telnyx")
async def telnyx_webhook_get():
    """Handle GET requests from Telnyx."""
    return {"status": "ok"}


@app.post("/webhook/telnyx")
async def telnyx_webhook(request: Request):
    """Handle incoming Telnyx TeXML webhooks — return TeXML to answer and stream."""
    try:
        body = await request.json()
    except Exception:
        try:
            form = await request.form()
            body = dict(form)
        except Exception:
            body = {}
    log.info(f"=== TELNYX WEBHOOK === {body}")

    host = "callingagent-production-41e3.up.railway.app"

    # Return TeXML: answer the call + start WebSocket media streaming
    texml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Hello! Thank you for calling Loggix. I'm your AI assistant. How can I help you today?</Say>
    <Pause length="2"/>
    <Connect>
        <Stream url="wss://{host}/ws/call">
            <Parameter name="caller_id" value="{{{{From}}}}" />
        </Stream>
    </Connect>
</Response>"""

    log.info(f"Returning TeXML to start streaming")
    return Response(content=texml, media_type="application/xml")


@app.post("/webhook/twilio")
async def twilio_webhook(request: Request):
    """Handle incoming Twilio TwiML webhooks — return TwiML to start bidirectional stream."""
    try:
        form = await request.form()
        body = dict(form)
    except Exception:
        body = {}
    log.info(f"=== TWILIO WEBHOOK === {body}")

    host = "callingagent-production-41e3.up.railway.app"

    # TwiML: start bidirectional WebSocket stream
    # NOTE: Cannot use <Say> before <Connect> — greeting happens after WS connects
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://{host}/ws/call" />
    </Connect>
</Response>"""

    log.info(f"Returning TwiML to start bidirectional stream")
    return Response(content=twiml, media_type="application/xml")


@app.websocket("/ws/call")
async def websocket_call(websocket: WebSocket):
    """WebSocket endpoint for Telnyx media streaming — connects to Pipecat bot."""
    from pipecat_bot import bot
    from pipecat.runner.types import RunnerArguments

    await websocket.accept()
    logger.info("Telnyx WebSocket connected")

    runner_args = RunnerArguments(
        websocket=websocket,
        handle_sigint=False,
    )
    await bot(runner_args)


# ==================== END TELNYX VOICE BOT ====================


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        from workers.ingestion_worker import RedisQueue
        queue = RedisQueue()
        redis_status = "connected" if queue.redis.ping() else "disconnected"
    except Exception:
        redis_status = "unavailable"
    
    return {
        "status": "healthy",
        "redis": redis_status
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
