# Loggix AI Voice Receptionist

This is an AI-powered voice receptionist for Loggix, using Grok (xAI) for intelligence and Twilio for telephony.

## Features
- **Grok-Powered:** Uses xAI's Grok-beta model for natural conversations.
- **International Support:** Works with any Twilio number (India/Netherlands/Global).
- **Cost Effective:** Uses free trial credits from xAI and Twilio.
- **Context Aware:** Trained on Loggix services and website data.

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configuration:**
   - Copy `.env.example` to `.env`.
   - Add your `GROK_API_KEY` from [console.x.ai](https://console.x.ai).
   - Add your Twilio credentials.

3. **Run the Server:**
   ```bash
   python main.py
   ```

4. **Expose to Internet:**
   Use `ngrok` to expose your local server:
   ```bash
   ngrok http 8000
   ```

5. **Configure Twilio:**
   - Go to your Twilio Console -> Phone Numbers -> Active Numbers.
   - Set the "A Call Comes In" Webhook to: `https://your-ngrok-url.ngrok-free.app/voice` (Method: POST).

## How it works
- **Twilio** receives the call and greets the user.
- **Gather** captures the user's speech.
- **FastAPI** sends the speech to **Grok**.
- **Grok** generates a response based on the Loggix knowledge base.
- **Twilio** speaks the response back to the user.
