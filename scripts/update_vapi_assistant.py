import requests
import sys
import json
from pathlib import Path

VAPI_KEY = "318f20a8-1462-4ba1-b3a9-c6dcbdccd500"
ASSISTANT_ID = "34e818fb-d716-4b8f-9313-c3fac0d33b89"
KNOWLEDGE_FILE = Path(__file__).resolve().parent.parent / "LOGGIX_KNOWLEDGE.md"

# System prompt: persona + rules only (knowledge comes from attached KB)
SYSTEM_PROMPT = """You are the official AI receptionist for Loggix, a premier software development firm.
You MUST use the attached Knowledge Base to answer all questions about the company.

RULES:
1. Always answer from the Knowledge Base. Never guess or use outside knowledge.
2. If the Knowledge Base doesn't have the answer, say: "I don't have that specific detail in my records, but I can certainly have one of our experts discuss it with you during a free 30-minute consultation. Would you like to schedule that?"
3. Be concise — phone callers prefer short, clear answers.
4. Greet callers with: "Hello! Thank you for calling Loggix. I'm your AI assistant. How can I help you today?"
5. If caller asks for a manager or team member, say: "I'd be happy to have someone reach out. May I have your email and a brief description of your inquiry?"
6. Respond in English. Switch to Dutch if the caller speaks Dutch.
7. NEVER say you are a general purpose AI. You ARE the Loggix AI receptionist.
8. NEVER use filler words like 'uh' or 'um'.
"""


def update_assistant():
    headers = {
        "Authorization": f"Bearer {VAPI_KEY}"
    }

    if not KNOWLEDGE_FILE.exists():
        print(f"ERROR: Knowledge file not found at {KNOWLEDGE_FILE}")
        sys.exit(1)

    print(f"Reading: {KNOWLEDGE_FILE.name} ({KNOWLEDGE_FILE.stat().st_size:,} bytes)")

    # 1. Upload the knowledge file to Vapi
    print("Uploading file to Vapi...")
    with open(KNOWLEDGE_FILE, "rb") as f:
        files = {"file": f}
        upload_resp = requests.post("https://api.vapi.ai/file", headers=headers, files=files)

    if upload_resp.status_code != 201:
        print(f"Upload FAILED: {upload_resp.status_code} - {upload_resp.text}")
        sys.exit(1)

    file_id = upload_resp.json().get("id")
    print(f"File uploaded. ID: {file_id}")

    # 2. Update Assistant: attach file directly as knowledge source
    print("Attaching knowledge to assistant...")
    update_payload = {
        "model": {
            "provider": "groq",
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                }
            ],
            "knowledgeBase": [
                {
                    "type": "file",
                    "fileId": file_id
                }
            ],
            "temperature": 0
        }
    }

    update_resp = requests.patch(
        f"https://api.vapi.ai/assistant/{ASSISTANT_ID}",
        headers={**headers, "Content-Type": "application/json"},
        json=update_payload
    )

    if update_resp.status_code == 200:
        print("\nSUCCESS! Voice agent updated with comprehensive knowledge.")
        print(f"   File: {KNOWLEDGE_FILE.name} ({KNOWLEDGE_FILE.stat().st_size:,} bytes)")
    else:
        # 3. Fallback: try attaching KB at top level
        print(f"PATCH failed: {update_resp.status_code}")
        print(f"Response: {update_resp.text}")
        print("\nTrying alternative approach...")
        
        alt_payload = {
            "model": {
                "provider": "groq",
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "system",
                        "content": SYSTEM_PROMPT
                    }
                ],
                "knowledgeBaseId": file_id,
                "temperature": 0
            }
        }
        alt_resp = requests.patch(
            f"https://api.vapi.ai/assistant/{ASSISTANT_ID}",
            headers={**headers, "Content-Type": "application/json"},
            json=alt_payload
        )
        
        if alt_resp.status_code == 200:
            print("\nSUCCESS! Voice agent updated with Knowledge Base.")
        else:
            print(f"Alternative also FAILED: {alt_resp.status_code} - {alt_resp.text}")
            
            # 4. Last resort: just update the system prompt with all knowledge inline
            print("\nFalling back to inline knowledge in system prompt...")
            with open(KNOWLEDGE_FILE, "r", encoding="utf-8") as f:
                knowledge_text = f.read()
            inline_prompt = SYSTEM_PROMPT + f"\n\n--- KNOWLEDGE BASE ---\n{knowledge_text}\n--- END KNOWLEDGE BASE ---"
            inline_payload = {
                "model": {
                    "provider": "groq",
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {
                            "role": "system",
                            "content": inline_prompt
                        }
                    ],
                    "temperature": 0
                }
            }
            inline_resp = requests.patch(
                f"https://api.vapi.ai/assistant/{ASSISTANT_ID}",
                headers={**headers, "Content-Type": "application/json"},
                json=inline_payload
            )
            if inline_resp.status_code == 200:
                print("SUCCESS! Voice agent updated with inline knowledge.")
            else:
                print(f"All methods FAILED. Last error: {inline_resp.status_code} - {inline_resp.text}")
                sys.exit(1)


if __name__ == "__main__":
    update_assistant()
