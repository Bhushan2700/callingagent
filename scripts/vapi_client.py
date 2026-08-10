import os
import httpx
import logging

VAPI_KEY = os.getenv("VAPI_PRIVATE_KEY", "")
VAPI_BASE = "https://api.vapi.ai"
logger = logging.getLogger("app_logger")

VOICES = [
    {"id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel", "gender": "Female", "desc": "Warm, friendly"},
    {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah", "gender": "Female", "desc": "Soft, professional"},
    {"id": "XrExE9yKIg1Wjnnl2k150", "name": "Elizabeth", "gender": "Female", "desc": "Bright, energetic"},
    {"id": "LcfcDJNUP1GQjkzn1xHp", "name": "Freya", "gender": "Female", "desc": "Calm, soothing"},
    {"id": "ErXwobaYiN019PkySvjV", "name": "Antoni", "gender": "Male", "desc": "Warm, deep"},
    {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam", "gender": "Male", "desc": "Neutral, professional"},
    {"id": "onwK4e9ZLuTAKqWW03F9", "name": "Domi", "gender": "Male", "desc": "Smooth, casual"},
    {"id": "TxGEqnHWrfWFTfGW9XjX", "name": "Josh", "gender": "Male", "desc": "Deep, reassuring"},
]

LANGUAGE_CODES = {
    "English": "en", "Spanish": "es", "Hindi": "hi", "French": "fr",
    "German": "de", "Dutch": "nl", "Arabic": "ar", "Portuguese": "pt",
    "Italian": "it", "Japanese": "ja", "Korean": "ko", "Chinese": "zh",
}

TOOL_SCHEMAS = {
    "search_knowledge": {
        "name": "search_knowledge",
        "description": "Search the business knowledge base to answer the caller's question. Always use this to look up information before answering.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "The question or topic to look up"}},
            "required": ["query"],
        },
    },
    "book_appointment": {
        "name": "book_appointment",
        "description": "Book a consultation appointment for the caller. Collect all fields from the conversation first, then call this tool.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Caller's full name"},
                "phone": {"type": "string", "description": "Caller's phone number"},
                "email": {"type": "string", "description": "Caller's email address"},
                "enquiry_topic": {"type": "string", "description": "What the caller wants to discuss"},
                "appointment_date": {"type": "string", "description": "Preferred date in YYYY-MM-DD"},
                "appointment_time": {"type": "string", "description": "Preferred time in HH:MM 24-hour"},
            },
            "required": ["name", "phone", "email", "enquiry_topic", "appointment_date", "appointment_time"],
        },
    },
    "raise_ticket": {
        "name": "raise_ticket",
        "description": "Create a support ticket for the caller. Collect the caller's name and a description of their issue first.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Caller's full name"},
                "phone": {"type": "string", "description": "Caller's phone number (optional)"},
                "email": {"type": "string", "description": "Caller's email address (optional)"},
                "issue": {"type": "string", "description": "Description of the issue"},
            },
            "required": ["name", "issue"],
        },
    },
}


def build_server_url(path: str) -> str:
    domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "localhost:8000")
    return f"https://{domain}{path}"


def build_system_prompt(cfg: dict) -> str:
    company = cfg.get("company_name", "").strip()
    industry = cfg.get("industry", "").strip()
    description = cfg.get("description", "").strip()
    languages = cfg.get("languages") or ["English"]
    hours = cfg.get("business_hours", "").strip()
    timezone = cfg.get("timezone", "UTC").strip()
    tools = cfg.get("tools_enabled") or []

    lang_line = " and ".join(languages) if languages else "English"
    parts = [f"You are the AI receptionist for {company}."]
    if industry:
        parts.append(f"The business is in the {industry} industry.")
    if description:
        parts.append(f"About the business: {description}")
    parts.append("Use search_knowledge to look up information from the knowledge base. Give short, natural, warm answers.")
    parts.append(f"Speak {lang_line}.")

    if "book_appointment" in tools:
        parts.append(
            "APPOINTMENT BOOKING - CRITICAL:\n"
            "When someone wants to book an appointment, collect ALL 6 pieces of information before calling book_appointment:\n"
            "1. NAME (full name), 2. PHONE NUMBER, 3. EMAIL ADDRESS, 4. TOPIC (what they want to discuss), "
            "5. DATE (preferred date), 6. TIME (preferred time).\n"
            "If the user gives multiple details at once, accept them all and only ask for what's missing. "
            'Always confirm before booking: "Let me confirm: Name is [name], phone is [phone], email is [email], '
            'topic is [topic], on [date] at [time]. Is that correct?" ONLY call book_appointment after the user confirms.'
        )
    if "raise_ticket" in tools:
        parts.append(
            "SUPPORT TICKETS:\n"
            "When someone reports a problem, collect their name and a clear description of the issue, then call raise_ticket. "
            "Ask for email and phone if not provided."
        )
    if hours:
        parts.append(f"Business hours: {hours} ({timezone}).")
    parts.append(
        "RULES:\n"
        "- Short, warm, professional answers\n"
        "- If any detail is unclear or missing, ask for clarification\n"
        "- Never guess missing information\n"
        "- Never invent facts that are not in the knowledge base"
    )
    return "\n\n".join(parts)


def build_tools(tools_enabled: list) -> list:
    tools = []
    for name in tools_enabled or []:
        schema = TOOL_SCHEMAS.get(name)
        if not schema:
            continue
        tools.append({
            "type": "server",
            "function": {"name": schema["name"], "description": schema["description"], "parameters": schema["parameters"]},
            "server": {"url": build_server_url(f"/tool/{name}"), "timeoutSeconds": 20},
        })
    return tools


def _headers() -> dict:
    return {"Authorization": f"Bearer {VAPI_KEY}", "Content-Type": "application/json"}


async def create_assistant(cfg: dict) -> str | None:
    """Create a Vapi assistant from an onboarding config. Returns assistant id or None."""
    if not VAPI_KEY:
        logger.warning("VAPI_PRIVATE_KEY not set, skipping assistant creation")
        return None

    company = cfg.get("company_name", "Your Business")
    payload = {
        "name": f"{company} AI Receptionist",
        "firstMessage": cfg.get("greeting") or f"Hello! You've reached {company}. I'm the AI assistant. How can I help you today?",
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "messages": [{"role": "system", "content": build_system_prompt(cfg)}],
        },
        "server": {"url": build_server_url("/webhook/vapi")},
        "transcriber": {
            "provider": "deepgram",
            "language": LANGUAGE_CODES.get((cfg.get("languages") or ["English"])[0], "en"),
        },
        "voice": {"provider": "11labs", "voiceId": cfg.get("voice_id") or "21m00Tcm4TlvDq8ikWAM"},
        "tools": build_tools(cfg.get("tools_enabled")),
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{VAPI_BASE}/assistant", json=payload, headers=_headers(), timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Created Vapi assistant {data.get('id')} for {company}")
            return data.get("id")
        except Exception as e:
            logger.error(f"Failed to create Vapi assistant for {company}: {e}")
            return None


async def update_assistant(assistant_id: str, cfg: dict) -> bool:
    """Update an existing Vapi assistant with new onboarding settings."""
    if not VAPI_KEY or not assistant_id:
        return False

    company = cfg.get("company_name", "Your Business")
    payload = {
        "name": f"{company} AI Receptionist",
        "firstMessage": cfg.get("greeting") or f"Hello! You've reached {company}. I'm the AI assistant. How can I help you today?",
        "model": {
            "provider": "openai",
            "model": "gpt-4o",
            "messages": [{"role": "system", "content": build_system_prompt(cfg)}],
        },
        "transcriber": {
            "provider": "deepgram",
            "language": LANGUAGE_CODES.get((cfg.get("languages") or ["English"])[0], "en"),
        },
        "voice": {"provider": "11labs", "voiceId": cfg.get("voice_id") or "21m00Tcm4TlvDq8ikWAM"},
        "tools": build_tools(cfg.get("tools_enabled")),
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.patch(f"{VAPI_BASE}/assistant/{assistant_id}", json=payload, headers=_headers(), timeout=30)
            resp.raise_for_status()
            logger.info(f"Updated Vapi assistant {assistant_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to update Vapi assistant {assistant_id}: {e}")
            return False


async def delete_assistant(assistant_id: str) -> bool:
    if not VAPI_KEY:
        return False

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.delete(f"{VAPI_BASE}/assistant/{assistant_id}", headers=_headers(), timeout=15)
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Failed to delete Vapi assistant {assistant_id}: {e}")
            return False


async def create_credential(provider: str, credentials: dict) -> str | None:
    """Create a provider credential in Vapi (for BYO numbers). Returns credentialId or None."""
    if not VAPI_KEY:
        return None

    payload = {"provider": provider, **credentials}

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{VAPI_BASE}/credential", json=payload, headers=_headers(), timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Created Vapi credential for provider {provider}")
            return data.get("id")
        except Exception as e:
            logger.error(f"Failed to create Vapi credential for {provider}: {e}")
            return None


async def buy_phone_number(name: str, area_code: str, assistant_id: str) -> dict | None:
    """Buy a Vapi-managed phone number. Returns {id, number} or None."""
    if not VAPI_KEY:
        return None

    payload = {
        "provider": "vapi",
        "name": name,
        "assistantId": assistant_id,
    }
    if area_code:
        payload["numberDesiredAreaCode"] = area_code

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{VAPI_BASE}/phone-number", json=payload, headers=_headers(), timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Bought Vapi number {data.get('number')} ({data.get('id')}) for {name}")
            return {"id": data.get("id"), "number": data.get("number")}
        except Exception as e:
            logger.error(f"Failed to buy Vapi phone number: {e}")
            return None


async def import_phone_number(name: str, provider: str, credential_id: str, number: str, assistant_id: str) -> dict | None:
    """Import an existing phone number from Twilio/Telnyx/Vonage. Returns {id, number} or None."""
    if not VAPI_KEY:
        return None

    payload = {
        "provider": provider,
        "name": name,
        "credentialId": credential_id,
        "number": number,
        "assistantId": assistant_id,
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{VAPI_BASE}/phone-number", json=payload, headers=_headers(), timeout=30)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Imported {provider} number {data.get('number')} ({data.get('id')})")
            return {"id": data.get("id"), "number": data.get("number")}
        except Exception as e:
            logger.error(f"Failed to import {provider} phone number: {e}")
            return None


async def assign_phone_number(phone_number_id: str, assistant_id: str) -> bool:
    """Reassign an existing phone number to an assistant."""
    if not VAPI_KEY or not phone_number_id:
        return False

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.patch(
                f"{VAPI_BASE}/phone-number/{phone_number_id}",
                json={"assistantId": assistant_id},
                headers=_headers(),
                timeout=15,
            )
            return resp.status_code in (200, 204)
        except Exception as e:
            logger.error(f"Failed to assign phone number {phone_number_id}: {e}")
            return False


async def delete_phone_number(phone_number_id: str) -> bool:
    if not VAPI_KEY or not phone_number_id:
        return False

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.delete(f"{VAPI_BASE}/phone-number/{phone_number_id}", headers=_headers(), timeout=15)
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Failed to delete phone number {phone_number_id}: {e}")
            return False


async def list_calls(assistant_id: str, limit: int = 50) -> list:
    """List calls for an assistant from Vapi. Returns list of call objects (or [])."""
    if not VAPI_KEY or not assistant_id:
        return []
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{VAPI_BASE}/call",
                params={"assistantId": assistant_id, "limit": limit},
                headers=_headers(),
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to list Vapi calls for {assistant_id}: {e}")
            return []


async def get_call(call_id: str) -> dict | None:
    """Fetch a single Vapi call including transcript + cost breakdown."""
    if not VAPI_KEY or not call_id:
        return None
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{VAPI_BASE}/call/{call_id}", headers=_headers(), timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to get Vapi call {call_id}: {e}")
            return None


async def get_phone_number_detail(phone_number_id: str) -> dict | None:
    """Fetch a phone number's live status from Vapi."""
    if not VAPI_KEY or not phone_number_id:
        return None
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{VAPI_BASE}/phone-number/{phone_number_id}", headers=_headers(), timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to get Vapi phone number {phone_number_id}: {e}")
            return None


async def list_phone_numbers(assistant_id: str) -> list:
    """List phone numbers assigned to an assistant from Vapi."""
    if not VAPI_KEY or not assistant_id:
        return []
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{VAPI_BASE}/phone-number",
                params={"assistantId": assistant_id},
                headers=_headers(),
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Failed to list Vapi phone numbers for {assistant_id}: {e}")
            return []
