import os
import httpx
import logging

VAPI_KEY = os.getenv("VAPI_PRIVATE_KEY", "")
VAPI_BASE = "https://api.vapi.ai"
logger = logging.getLogger("app_logger")


async def create_assistant(tenant_name: str, tenant_id: str) -> str | None:
    if not VAPI_KEY:
        logger.warning("VAPI_PRIVATE_KEY not set, skipping assistant creation")
        return None

    system_prompt = (
        f"You are the AI receptionist for {tenant_name}. "
        "Search the knowledge base for answers. "
        "Keep responses natural and concise. "
        "Collect name, phone, email, topic, date, and time for appointments."
    )

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{VAPI_BASE}/assistant",
                json={
                    "name": f"{tenant_name} AI Receptionist",
                    "firstMessage": f"Hello! You've reached {tenant_name}. I'm the AI assistant. How can I help you today?",
                    "model": {
                        "provider": "openai",
                        "model": "gpt-4o",
                        "messages": [{"role": "system", "content": system_prompt}],
                    },
                    "server": {
                        "url": f"https://{os.getenv('RAILWAY_PUBLIC_DOMAIN', 'localhost:8000')}/webhook/vapi"
                    },
                    "voice": {"provider": "11labs", "voiceId": "21m00Tcm4TlvDq8ikWAM"},
                },
                headers={
                    "Authorization": f"Bearer {VAPI_KEY}",
                    "Content-Type": "application/json",
                },
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            assistant_id = data.get("id")
            logger.info(f"Created Vapi assistant {assistant_id} for tenant {tenant_name}")
            return assistant_id
        except Exception as e:
            logger.error(f"Failed to create Vapi assistant for {tenant_name}: {e}")
            return None


async def delete_assistant(assistant_id: str) -> bool:
    if not VAPI_KEY:
        return False

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.delete(
                f"{VAPI_BASE}/assistant/{assistant_id}",
                headers={"Authorization": f"Bearer {VAPI_KEY}"},
                timeout=15,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Failed to delete Vapi assistant {assistant_id}: {e}")
            return False
