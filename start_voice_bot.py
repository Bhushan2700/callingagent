"""
Start the Loggix AI Voice Receptionist.
Runs both the FastAPI server (tools + admin) and Pipecat voice bot (Telnyx).
"""

import os
import sys
import uvicorn
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).parent))

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    print(f"""
╔══════════════════════════════════════════════════════╗
║       Loggix AI Voice Receptionist                   ║
║       Powered by Pipecat + Moonshine + Telnyx        ║
╠══════════════════════════════════════════════════════╣
║  LLM Provider: {os.getenv('LLM_PROVIDER', 'groq'):<36} ║
║  Server: http://{host}:{port:<24} ║
║  Voice UI: http://{host}:{port}/voice              ║
║  Telnyx WS: wss://{host}:{port}/ws/call           ║
║  Health: http://{host}:{port}/health               ║
╚══════════════════════════════════════════════════════╝
""")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=os.getenv("DEBUG", "false").lower() == "true",
        log_level="info",
    )
