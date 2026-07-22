"""
Loggix AI Web Voice — Pipecat-powered browser voice agent.
Uses Deepgram (STT) + Piper (TTS) + Groq (LLM) for fast web voice.
Connects via WebSocket from browser.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame, Frame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketTransport, FastAPIWebsocketParams
from pipecat.workers.runner import WorkerRunner

# STT: Deepgram (FAST cloud STT, ~300ms)
from pipecat.services.deepgram.stt import DeepgramSTTService

# TTS: Piper (FAST local TTS, ~100ms)
from pipecat.services.piper.tts import PiperTTSService

# LLM: Groq (FAST, free tier)
from pipecat.services.groq.llm import GroqLLMService

load_dotenv(override=True)

# Add parent dir for RAG
sys.path.insert(0, str(Path(__file__).parent))
from receptionist import LoggixReceptionist

receptionist = LoggixReceptionist()

# System prompt for web voice agent
SYSTEM_PROMPT = """You are the AI Receptionist for Loggix, a software development firm.

Always use search_knowledge to look up information. Give short, natural answers.

APPOINTMENT BOOKING:
When someone wants to book an appointment, collect: name, phone, email, topic, date, time.
Confirm before booking: "Let me confirm: Name is [name], phone is [phone], email is [email], topic is [topic], on [date] at [time]. Is that correct?"
Only call book_appointment after user confirms.

EMAIL HANDLING:
- "john at gmail dot com" = john@gmail.com
- "at" or "at the rate" = @, "dot" = .

PHONE HANDLING:
- Convert spoken numbers to digits automatically

RULES:
- Short, warm, professional answers
- For dates: "tomorrow" = tomorrow's date in YYYY-MM-DD
- For times: "3pm" = 15:00
- English only unless caller speaks Dutch"""


class WebsocketTransport(FastAPIWebsocketTransport):
    """Custom transport for browser WebSocket connections."""

    def __init__(self, websocket, params: FastAPIWebsocketParams):
        super().__init__(websocket, params)


async def run_web_bot(websocket):
    """Main bot logic for web voice connections."""

    # ---- Transport: WebSocket from browser ----
    params = FastAPIWebsocketParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
        audio_in_sample_rate=16000,
        audio_out_sample_rate=16000,
    )
    transport = WebsocketTransport(websocket, params)

    # ---- STT: Deepgram (fast cloud STT) ----
    stt = DeepgramSTTService(
        api_key=os.getenv("DEEPGRAM_API_KEY"),
        language="en",
    )

    # ---- TTS: Piper (fast local TTS) ----
    tts = PiperTTSService(
        voice="en_US-ryan-high",
    )

    # ---- LLM: Groq (fast cloud LLM) ----
    llm = GroqLLMService(
        api_key=os.getenv("GROQ_API_KEY"),
        model="llama-3.3-70b-versatile",
        system_instruction=SYSTEM_PROMPT,
        temperature=0.3,
    )

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
        transport.input(),
        stt,
        user_aggregator,
        llm,
        tts,
        transport.output(),
        assistant_aggregator,
    ])

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=16000,
            audio_out_sample_rate=16000,
            enable_metrics=True,
        ),
    )

    # ---- Event handlers ----
    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info("Web client connected")
        context.add_message(
            {"role": "developer", "content": "Greet the user warmly: 'Hello! Welcome to Loggix. I'm your AI assistant. How can I help you today?'"}
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Web client disconnected")
        await worker.cancel()

    # ---- Run the pipeline ----
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    await runner.run()
