# Loggix AI Receptionist

Multi-tenant AI receptionist SaaS: voice agent (Vapi), chat widget, RAG knowledge base, appointment booking (Cal.com), and support tickets — all isolated per tenant.

## Features
- **Multi-tenant:** Each registration gets its own tenant ID, data isolation, and (for new accounts) its own Vapi voice assistant, created automatically.
- **Voice Agent:** Browser-based voice calls via Vapi. Tenants assigned an assistant at registration; `nik68199@gmail.com` uses the shared assistant.
- **Chat Widget:** Embeddable, brandable chat widget for any website. Voice chat included.
- **RAG Knowledge Base:** Upload .md/.pdf/.txt/.json — auto-chunked, embedded, and searchable per tenant (pgvector on PostgreSQL).
- **Appointment Booking:** Voice tool call books Cal.com slots, tagged with the tenant ID.
- **Support Tickets:** Created via voice (raise_ticket tool), chat, or the admin dashboard.
- **Storage:** Files uploaded to Backblaze B2 (per-tenant paths).
- **Rate limiting:** In-memory sliding window on login, register, public chat, and public search.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configuration:** Copy `.env.example` to `.env` and fill in:
   - `OPENAI_API_KEY` — LLM + embeddings
   - `VAPI_PRIVATE_KEY` — server-side Vapi key (assistant creation, webhooks)
   - `DATABASE_URL` — PostgreSQL (Railway provides this automatically)
   - `JWT_SECRET` — required; auth fails hard without it
   - `B2_ENDPOINT`, `B2_ACCESS_KEY`, `B2_SECRET_KEY`, `B2_BUCKET` — Backblaze B2
   - `CAL_API_KEY`, `CAL_EVENT_TYPE_ID` — Cal.com booking
   - `CORS_ORIGINS` — comma-separated allowed origins

3. **Run the server:**
   ```bash
   python main.py
   ```
   (Or via Docker/`railway.json` — builds the React frontend, serves SPA + API on port 8000.)

## How it works
- **Voice:** Vapi assistant calls `/webhook/vapi`; tool calls (`search_knowledge`, `book_appointment`, `raise_ticket`) are dispatched to `/tool/*` handlers, with the tenant resolved server-side from the assistant ID.
- **Chat widget:** `/api/public/chat` and `/api/public/search` validate the tenant, then query the per-tenant knowledge base.
- **Frontend:** React SPA (dark Hades theme). Registration → onboarding → dashboard → widget config → embed code.
