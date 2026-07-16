"""
Loggix AI Voice Receptionist — Pipecat-powered voice bot.
Replaces Vapi with self-hosted Moonshine STT + Piper TTS + Groq/OpenAI LLM.
Connects to Twilio for phone calls.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams
from pipecat.workers.runner import WorkerRunner

# STT: faster-whisper (FREE, runs locally — same as Moonshine speed on GPU)
from pipecat.services.whisper.stt import WhisperSTTService

# TTS: Piper (FREE, fast, local)
from pipecat.services.piper.tts import PiperTTSService

# LLM: Switchable between Groq and OpenAI via LLM_PROVIDER env var
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")

if LLM_PROVIDER == "groq":
    from pipecat.services.groq.llm import GroqLLMService
else:
    from pipecat.services.openai.llm import OpenAILLMService

load_dotenv(override=True)

# Add parent dir so we can import receptionist for RAG tools
sys.path.insert(0, str(Path(__file__).parent))
from receptionist import LoggixReceptionist

# Initialize the RAG receptionist (reuses existing knowledge base)
receptionist = LoggixReceptionist()

# System prompt for the AI receptionist
SYSTEM_PROMPT = """You are the official AI receptionist for Loggix, a premier software development firm.

RULES:
1. Always answer from the Knowledge Base. Never guess or use outside knowledge.
2. If you don't have the answer, say: "I don't have that specific detail in my records, but I can certainly have one of our experts discuss it with you during a free 30-minute consultation. Would you like to schedule that?"
3. Be concise — phone callers prefer short, clear answers.
4. Greet callers with: "Hello! Thank you for calling Loggix. I'm your AI assistant. How can I help you today?"
5. If caller asks for a manager or team member, collect their name, email, and inquiry.
6. Respond in English. Switch to Dutch if the caller speaks Dutch.
7. NEVER say you are a general purpose AI. You ARE the Loggix AI receptionist.
8. When someone wants to book a consultation, collect: name, phone, email, topic, date, time — then confirm before booking."""


async def run_bot(transport: BaseTransport, handle_sigint: bool):
    """Main bot logic — runs for each phone call."""

    # ---- STT: faster-whisper (runs locally, FREE, ~300ms on GPU) ----
    stt = WhisperSTTService(
        settings=WhisperSTTService.Settings(model="distil-medium-en")
    )

    # ---- TTS: Piper (runs locally, FREE, 100ms latency) ----
    tts = PiperTTSService(
        settings=PiperTTSService.Settings(voice="en_US-ryan-high")
    )

    # ---- LLM: Groq (fastest, FREE tier) or OpenAI (best quality) ----
    if LLM_PROVIDER == "groq":
        llm = GroqLLMService(
            api_key=os.getenv("GROQ_API_KEY"),
            settings=GroqLLMService.Settings(
                model="llama-3.3-70b-versatile",
                system_instruction=SYSTEM_PROMPT,
                temperature=0.3,
            ),
        )
        logger.info("Using Groq LLM (llama-3.3-70b-versatile)")
    else:
        llm = OpenAILLMService(
            api_key=os.getenv("OPENAI_API_KEY"),
            settings=OpenAILLMService.Settings(
                model="gpt-4o-mini",
                system_instruction=SYSTEM_PROMPT,
                temperature=0.3,
            ),
        )
        logger.info("Using OpenAI LLM (gpt-4o-mini)")

    # ---- Context management ----
    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    # ---- Build the pipeline ----
    pipeline = Pipeline([
        transport.input(),       # Receive audio from Twilio
        stt,                     # Speech-to-Text (Moonshine)
        user_aggregator,         # Build user message context
        llm,                     # AI Brain (Groq or OpenAI)
        tts,                     # Text-to-Speech (Piper)
        transport.output(),      # Send audio back to Twilio
        assistant_aggregator,    # Add AI response to context
    ])

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,    # Twilio audio rate
            audio_out_sample_rate=8000,   # Twilio audio rate
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
    )

    # ---- Event handlers ----
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Caller connected — starting greeting")
        context.add_message(
            {"role": "developer", "content": "Greet the caller warmly with: 'Hello! Thank you for calling Loggix. I'm your AI assistant. How can I help you today?'"}
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Caller disconnected — cleaning up")
        await worker.cancel()

    # ---- Run the pipeline ----
    runner = WorkerRunner(handle_sigint=handle_sigint)
    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: RunnerArguments):
    """Main bot entry point — compatible with Pipecat Cloud."""
    transport_params = {
        "twilio": lambda: FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    }

    # create_transport auto-detects Twilio and builds TwilioFrameSerializer
    transport = await create_transport(runner_args, transport_params)

    # Log caller info from Twilio handshake
    call_data = runner_args.call_data
    if call_data:
        logger.info(f"Incoming call from: {call_data.from_number}")

    await run_bot(transport, runner_args.handle_sigint)


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()
