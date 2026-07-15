"""
Loggix AI Voice Assistant — Vapi-style with proper booking.
"""

import os
import sys
import io
import re
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
import uvicorn

app = FastAPI()
conversation_history = []
booking_state = {"collecting": False, "name": "", "phone": "", "email": "", "topic": ""}

HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Loggix AI Assistant</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;background:#0a0a1a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh}
.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:2.5rem;width:520px;text-align:center}
h1{font-size:1.5rem;margin-bottom:.2rem}
.sub{color:#666;font-size:.75rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:1.5rem}
.btn{width:130px;height:130px;border-radius:50%;border:3px solid #0061FF;background:transparent;color:#0061FF;font-size:.95rem;font-weight:700;cursor:pointer;transition:all .3s;margin:1rem auto;display:flex;align-items:center;justify-content:center}
.btn:hover{background:#0061FF;color:#fff;transform:scale(1.05)}
.btn.active{background:#ef4444;border-color:#ef4444;color:#fff;animation:pulse 1.5s infinite}
.btn.thinking{background:#f59e0b;border-color:#f59e0b;color:#fff}
.btn.speaking{background:#10b981;border-color:#10b981;color:#fff}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 20px rgba(239,68,68,0)}}
.status{margin-top:.8rem;font-size:.8rem;color:#888;min-height:20px}
#chat{margin-top:1rem;text-align:left;max-height:280px;overflow-y:auto;padding:10px;background:rgba(0,0,0,.3);border-radius:12px;display:none}
.line{margin:6px 0;padding:8px 12px;border-radius:8px;font-size:.85rem;line-height:1.4;animation:fadeIn .2s}
.user{background:rgba(0,97,255,.15);color:#93c5fd}
.ai{background:rgba(16,185,129,.15);color:#86efac}
@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
.mic-bar{display:flex;gap:3px;justify-content:center;margin-top:8px;height:20px;align-items:end}
.mic-bar span{width:4px;background:#0061FF;border-radius:2px;transition:height .05s}
</style>
</head>
<body>
<div class="card">
<h1>LOGGIX AI</h1>
<p class="sub">Voice Assistant</p>
<button class="btn" id="btn" onclick="toggle()">Connect</button>
<div class="mic-bar" id="micbar"></div>
<div class="status" id="status">Click to start</div>
<div id="chat"></div>
</div>
<script>
let active=false,currentAudio=null,isSpeaking=false,processing=false,recognition=null;
let micStream=null,micCtx=null,micAnalyser=null;
let chatEl=document.getElementById('chat'),statusEl=document.getElementById('status'),btnEl=document.getElementById('btn');
const GREETING="Hello! Thank you for calling Loggix. I am your AI assistant. How can I help you today?";
let micBars=[];
function initBars(){let c=document.getElementById('micbar');c.innerHTML='';micBars=[];for(let i=0;i<12;i++){let s=document.createElement('span');s.style.height='2px';c.appendChild(s);micBars.push(s)}}
function toggle(){active?stop():start()}
async function start(){active=true;processing=false;btnEl.className='btn active';btnEl.textContent='Disconnect';statusEl.textContent='Connecting...';chatEl.style.display='block';chatEl.innerHTML='';initBars();try{micStream=await navigator.mediaDevices.getUserMedia({audio:true});micCtx=new AudioContext();micAnalyser=micCtx.createAnalyser();micAnalyser.fftSize=256;micCtx.createMediaStreamSource(micStream).connect(micAnalyser);monitorMic()}catch(e){}speak(GREETING,()=>{if(active)listen()})}
function stop(){active=false;btnEl.className='btn';btnEl.textContent='Connect';statusEl.textContent='Disconnected';stopAudio();killRec();isSpeaking=false;processing=false;if(micStream){micStream.getTracks().forEach(t=>t.stop())}if(micCtx){micCtx.close()}}
function monitorMic(){if(!active||!micAnalyser)return;let data=new Uint8Array(micAnalyser.frequencyBinCount);micAnalyser.getByteFrequencyData(data);let avg=data.reduce((a,b)=>a+b,0)/data.length;for(let i=0;i<12;i++){let h=Math.max(2,Math.min(20,(avg/30)*20*(1-Math.abs(i-6)/6)));micBars[i].style.height=h+'px';micBars[i].style.background=isSpeaking?'#10b981':'#0061FF'}if(isSpeaking&&avg>25){interrupt();setTimeout(()=>listen(),200)}requestAnimationFrame(monitorMic)}
function killRec(){if(recognition){recognition.onend=null;recognition.onresult=null;recognition.onerror=null;try{recognition.abort()}catch(e){}recognition=null}}
function stopAudio(){if(currentAudio){currentAudio.pause();currentAudio.currentTime=0;currentAudio.src='';currentAudio=null}isSpeaking=false}
function addLine(t,w){let d=document.createElement('div');d.className='line '+w;d.textContent=t;chatEl.appendChild(d);chatEl.scrollTop=chatEl.scrollHeight}
function speak(text,onDone){statusEl.textContent='Speaking...';isSpeaking=true;btnEl.className='btn speaking';fetch('/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text})}).then(r=>r.blob()).then(blob=>{if(!active){if(onDone)onDone();return}let audio=new Audio(URL.createObjectURL(blob));currentAudio=audio;audio.play();audio.onended=()=>{currentAudio=null;isSpeaking=false;if(active){btnEl.className='btn active';if(onDone)onDone()}};audio.onerror=()=>{currentAudio=null;isSpeaking=false;if(active&&onDone)onDone()};addLine(text,'ai')}).catch(e=>{isSpeaking=false;if(active&&onDone)onDone()})}
function interrupt(){stopAudio();killRec();isSpeaking=false;processing=false}
function sendMessage(text){if(processing)return;processing=true;interrupt();addLine(text,'user');statusEl.textContent='Thinking...';btnEl.className='btn thinking';fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text})}).then(r=>r.json()).then(data=>{if(!active){processing=false;return}if(data.response)speak(data.response,()=>{if(active)listen()});else{processing=false;if(active)setTimeout(()=>listen(),500)}}).catch(e=>{processing=false;if(active)setTimeout(()=>listen(),500)})}
function listen(){if(!active||processing)return;killRec();let SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){statusEl.textContent='Use Chrome';return}recognition=new SR();recognition.lang='en-US';recognition.interimResults=false;recognition.continuous=false;recognition.maxAlternatives=1;recognition.onstart=()=>{if(active)statusEl.textContent=isSpeaking?'Speak to interrupt...':'Listening...'};recognition.onresult=(e)=>{if(!active)return;let text=e.results[0][0].transcript.trim();if(text){interrupt();sendMessage(text)}};recognition.onerror=(e)=>{if(!active)return};recognition.onend=()=>{if(active&&!processing)setTimeout(()=>listen(),100)};try{recognition.start()}catch(e){}}
</script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTML


@app.post("/chat")
async def chat(request: Request):
    global booking_state
    body = await request.json()
    message = body.get("message", "")

    # Fix misspellings
    corrected = message.lower()
    corrections = {"logix": "loggix", "logx": "loggix", "file maker": "filemaker", "chat bot": "chatbot"}
    for wrong, right in corrections.items():
        corrected = corrected.replace(wrong, right)
    search_text = corrected if corrected != message.lower() else message

    # Fix email from speech recognition
    message_clean = message.replace(" at ", "@").replace(" dot ", ".").replace(" ", "")
    email_match = re.search(r"[\w.-]+@[\w.-]+\.\w+", message_clean)
    if not email_match:
        email_match = re.search(r"[\w.-]+@[\w.-]+\.\w+", message)

    # Fix phone - keep only digits and +
    phone_digits = re.sub(r"[^\d+]", "", message)
    phone_match = re.search(r"\+?\d{7,}", phone_digits) if len(phone_digits) >= 7 else None

    name_match = re.search(r"(?:name is|my name|i'm|i am|call me)\s+(\w+)", message, re.IGNORECASE)
    if not name_match and booking_state["collecting"] and not email_match and not phone_match and len(message.split()) <= 3:
        name_match = type("", (), {"group": lambda self, n: message.strip()})()

    # Update booking state
    if name_match and booking_state["collecting"]:
        booking_state["name"] = name_match.group(1)
    if phone_match and booking_state["collecting"]:
        booking_state["phone"] = phone_match.group(0)
    if email_match and booking_state["collecting"]:
        booking_state["email"] = email_match.group(0)

    # Detect booking request
    booking_keywords = ["book", "schedule", "appointment", "consultation", "meeting", "call back"]
    wants_booking = any(kw in message.lower() for kw in booking_keywords)

    # Start collecting if booking requested
    if wants_booking and not booking_state["collecting"]:
        booking_state = {"collecting": True, "name": "", "phone": "", "email": "", "topic": message}

    # Check if ready to book - AUTO BOOK when all info collected
    if booking_state["collecting"] and booking_state["name"] and booking_state["email"] and booking_state["phone"]:
        # BOOK ON CAL.COM immediately
        from scripts.cal_client import CalClient
        from datetime import datetime, timedelta
        cal = CalClient()

        booked = False
        for days_ahead in [1, 2, 3, 5, 7, 10, 14]:
            future = datetime.now() + timedelta(days=days_ahead)
            while future.weekday() >= 5:
                future += timedelta(days=1)
            for hour in [9, 9, 10, 11, 14, 15, 16, 17]:
                for minute in [0, 30]:
                    start_time = future.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    result = await cal.create_booking(
                        start=start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        attendee_name=booking_state["name"],
                        attendee_email=booking_state["email"],
                        phone=booking_state["phone"],
                        notes=f"Topic: {booking_state.get('topic', 'General consultation')}",
                    )
                    if result.get("status") == "success":
                        reply = f"Your consultation is booked for {start_time.strftime('%A, %B %d at %I:%M %p')}. You'll receive a calendar invite at {booking_state['email']}. Looking forward to speaking with you!"
                        booked = True
                        break
                if booked:
                    break
            if booked:
                break

        if not booked:
            reply = f"I'll have our team reach out to you at {booking_state['email']} to schedule a convenient time."

        booking_state = {"collecting": False, "name": "", "phone": "", "email": "", "topic": "", "booked": True}
        conversation_history.clear()
        return {"response": reply}

    # Build context for LLM
    try:
        from receptionist import LoggixReceptionist
        rec = LoggixReceptionist()
        search_result = await rec.search(search_text)
        chunks = search_result.get("chunks", [])
        if not chunks:
            search_result2 = await rec.search(message)
            chunks = search_result2.get("chunks", [])
        context = "\n\n".join([f"[{c.get('doc_id','')}]\n{c['text']}" for c in chunks]) if chunks else "No documents found."
    except Exception:
        context = "No documents found."

    # Build system prompt
    system = f"""You are the AI receptionist for Loggix, a software development firm.
You are a HUMAN-LIKE assistant. Never say "I believe you meant..." or correct spelling.
Just answer naturally. Never mention spelling corrections.
- Answer ONLY from the provided documents.
- Keep answers SHORT (1-2 sentences). Professional and warm.
- If no answer, say: "I don't have that detail, but I'd be happy to schedule a free consultation."
- Never say you are an AI or a bot.
- Be conversational, warm, and natural.

DOCUMENTS:
{context}"""

    # Add booking instructions
    if booking_state["collecting"]:
        missing = []
        if not booking_state["name"]: missing.append("your name")
        if not booking_state["phone"]: missing.append("your phone number")
        if not booking_state["email"]: missing.append("your email address")
        if missing:
            system += f"\nYou are collecting booking info. Still need: {', '.join(missing)}. Ask for what's missing."
        else:
            system += "\nYou have ALL info. Say: 'I have everything I need. Let me book that for you right now.' Then wait for confirmation. When user confirms, the system will auto-book on Cal.com."
    elif wants_booking:
        system += "\nThe caller wants to book. Say: 'I'd be happy to schedule a consultation! Let me get a few details. What's your name?' Then collect name, phone, email one by one."
    conversation_history.append({"role": "user", "content": message})
    from groq import Groq
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": system}] + conversation_history[-10:],
        temperature=0.1, max_tokens=150,
    )
    reply = response.choices[0].message.content
    conversation_history.append({"role": "assistant", "content": reply})
    return {"response": reply}


@app.post("/tts")
async def tts(request: Request):
    body = await request.json()
    text = body.get("text", "")
    import edge_tts
    communicate = edge_tts.Communicate(text, "en-US-JennyNeural")
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return StreamingResponse(io.BytesIO(audio_data), media_type="audio/mpeg")


if __name__ == "__main__":
    print("Open http://localhost:8080 in your browser")
    uvicorn.run(app, host="0.0.0.0", port=8080)
