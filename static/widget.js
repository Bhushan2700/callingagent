/**
 * Loggix AI Chat Widget
 * Embeddable chat widget with text chat + voice support
 * Usage: <script src="https://your-domain.com/static/widget.js"></script>
 */
(function() {
    const API_BASE = window.LoggixWidget?.apiBase || window.location.origin;
    const CONFIG = {
        position: window.LoggixWidget?.position || 'bottom-right',
        theme: window.LoggixWidget?.theme || 'dark',
        greeting: window.LoggixWidget?.greeting || 'Hi! How can I help you today?',
        title: window.LoggixWidget?.title || 'Loggix AI Support',
        vapiKey: window.LoggixWidget?.vapiKey || '',
        vapiAssistant: window.LoggixWidget?.vapiAssistant || '',
    };

    // Create host element
    const host = document.createElement('div');
    host.id = 'loggix-widget-host';
    document.body.appendChild(host);

    // Shadow DOM for CSS isolation
    const shadow = host.attachShadow({ mode: 'open' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }

        /* Hide Vapi default button */
        [class*="vapi"] button,
        [id*="vapi"],
        [data-vapi],
        iframe[src*="vapi"] { display: none !important; }

        .widget-btn {
            position: fixed;
            ${CONFIG.position.includes('right') ? 'right: 20px' : 'left: 20px'};
            bottom: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, #0061FF 0%, #0041CC 100%);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0, 97, 255, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 999999;
        }
        .widget-btn:hover { transform: scale(1.1); box-shadow: 0 6px 25px rgba(0, 97, 255, 0.5); }
        .widget-btn.active { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
        .widget-btn svg { width: 28px; height: 28px; fill: white; }

        .chat-panel {
            position: fixed;
            ${CONFIG.position.includes('right') ? 'right: 20px' : 'left: 20px'};
            bottom: 90px;
            width: 380px;
            height: 520px;
            background: #0f172a;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            display: none;
            flex-direction: column;
            overflow: hidden;
            z-index: 999998;
        }
        .chat-panel.open { display: flex; }

        .chat-header {
            padding: 16px 20px;
            background: rgba(255,255,255,0.03);
            border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .chat-header h3 { color: white; font-size: 14px; font-weight: 700; }
        .chat-header-actions { display: flex; gap: 8px; }
        .header-btn {
            width: 32px; height: 32px; border-radius: 8px; border: none;
            background: rgba(255,255,255,0.05); cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
        }
        .header-btn:hover { background: rgba(255,255,255,0.1); }
        .header-btn svg { width: 16px; height: 16px; fill: #94a3b8; }
        .header-btn.active svg { fill: #10b981; }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-track { background: transparent; }
        .chat-messages::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }

        .message {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 14px;
            font-size: 13px;
            line-height: 1.5;
            word-wrap: break-word;
        }
        .message.user {
            align-self: flex-end;
            background: #0061FF;
            color: white;
            border-bottom-right-radius: 4px;
        }
        .message.bot {
            align-self: flex-start;
            background: rgba(255,255,255,0.06);
            color: #e2e8f0;
            border-bottom-left-radius: 4px;
        }
        .message .source {
            display: block;
            margin-top: 6px;
            font-size: 10px;
            color: #64748b;
            font-style: italic;
        }

        .typing-indicator {
            align-self: flex-start;
            padding: 10px 14px;
            background: rgba(255,255,255,0.06);
            border-radius: 14px;
            display: none;
        }
        .typing-indicator.visible { display: flex; gap: 4px; align-items: center; }
        .typing-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: #64748b;
            animation: typing 1.4s infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typing { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }

        .chat-input {
            padding: 12px 16px;
            border-top: 1px solid rgba(255,255,255,0.1);
            display: flex;
            gap: 8px;
            background: rgba(255,255,255,0.02);
        }
        .chat-input input {
            flex: 1;
            padding: 10px 14px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.05);
            color: white;
            font-size: 13px;
            outline: none;
            font-family: inherit;
        }
        .chat-input input:focus { border-color: #0061FF; }
        .chat-input input::placeholder { color: #64748b; }
        .send-btn {
            width: 40px; height: 40px; border-radius: 12px; border: none;
            background: #0061FF; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
        }
        .send-btn:hover { background: #0051d4; }
        .send-btn:disabled { background: #334155; cursor: not-allowed; }
        .send-btn svg { width: 18px; height: 18px; fill: white; }

        .voice-status {
            padding: 8px 16px;
            text-align: center;
            font-size: 11px;
            color: #64748b;
            display: none;
        }
        .voice-status.active { display: block; color: #10b981; }

        @media (max-width: 480px) {
            .chat-panel {
                width: calc(100% - 20px);
                height: calc(100% - 100px);
                ${CONFIG.position.includes('right') ? 'right: 10px' : 'left: 10px'};
                bottom: 80px;
            }
        }
    `;
    shadow.appendChild(style);

    // Build HTML
    const container = document.createElement('div');
    container.innerHTML = `
        <button class="widget-btn" id="widget-btn">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        </button>

        <div class="chat-panel" id="chat-panel">
            <div class="chat-header">
                <h3>${CONFIG.title}</h3>
                <div class="chat-header-actions">
                    <button class="header-btn" id="voice-toggle" title="Toggle Voice">
                        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </button>
                    <button class="header-btn" id="close-btn" title="Close">
                        <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                </div>
            </div>
            <div class="chat-messages" id="chat-messages">
                <div class="message bot">${CONFIG.greeting}</div>
                <div class="typing-indicator" id="typing">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
            <div class="voice-status" id="voice-status">Voice connected - speak now</div>
            <div class="chat-input">
                <input type="text" id="chat-input" placeholder="Type a message..." />
                <button class="send-btn" id="send-btn">
                    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
            </div>
        </div>
    `;
    shadow.appendChild(container);

    // Elements
    const widgetBtn = shadow.getElementById('widget-btn');
    const chatPanel = shadow.getElementById('chat-panel');
    const chatMessages = shadow.getElementById('chat-messages');
    const chatInput = shadow.getElementById('chat-input');
    const sendBtn = shadow.getElementById('send-btn');
    const typing = shadow.getElementById('typing');
    const closeBtn = shadow.getElementById('close-btn');
    const voiceToggle = shadow.getElementById('voice-toggle');
    const voiceStatus = shadow.getElementById('voice-status');

    let isOpen = false;
    let history = [];
    let vapiInstance = null;
    let voiceMode = false;

    // Toggle chat panel
    widgetBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        chatPanel.classList.toggle('open', isOpen);
        widgetBtn.classList.toggle('active', isOpen && voiceMode);
        if (isOpen) chatInput.focus();
    });

    closeBtn.addEventListener('click', () => {
        isOpen = false;
        chatPanel.classList.remove('open');
    });

    // Send message
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        chatInput.value = '';
        sendBtn.disabled = true;
        typing.classList.add('visible');

        history.push({ role: 'user', content: text });

        try {
            const res = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: history.slice(-10) })
            });
            const data = await res.json();
            const response = data.response || 'Sorry, I could not process your request.';
            addMessage(response, 'bot');
            history.push({ role: 'assistant', content: response });
        } catch (err) {
            addMessage('Sorry, something went wrong. Please try again.', 'bot');
        } finally {
            typing.classList.remove('visible');
            sendBtn.disabled = false;
            chatInput.focus();
        }
    }

    function addMessage(text, type) {
        const div = document.createElement('div');
        div.className = `message ${type}`;
        div.textContent = text;
        chatMessages.insertBefore(div, typing);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    function hideVapiButtons() {
        // Hide all Vapi-created buttons in the main document
        document.querySelectorAll('[class*="vapi"], [id*="vapi"], [data-vapi], iframe[src*="vapi"]').forEach(el => {
            el.style.display = 'none';
        });
        // Also hide any fixed-position buttons that Vapi might create
        document.querySelectorAll('button').forEach(btn => {
            const style = window.getComputedStyle(btn);
            if (style.position === 'fixed' && btn !== widgetBtn && !host.contains(btn)) {
                btn.style.display = 'none';
            }
        });
    }

    // Voice toggle (Vapi)
    voiceToggle.addEventListener('click', () => {
        if (voiceMode) {
            stopVoice();
        } else {
            startVoice();
        }
    });

    function startVoice() {
        if (!CONFIG.vapiKey || !CONFIG.vapiAssistant) {
            addMessage('Voice chat is not configured. Please set Vapi keys.', 'bot');
            return;
        }

        // Load Vapi SDK if not loaded
        if (!window.vapiSDK) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js';
            script.onload = () => initVapi();
            document.head.appendChild(script);
        } else {
            initVapi();
        }
    }

    function initVapi() {
        console.log('Vapi init - apiKey:', CONFIG.vapiKey, 'assistant:', CONFIG.vapiAssistant);

        if (!CONFIG.vapiKey || !CONFIG.vapiAssistant) {
            addMessage('Voice chat is not configured. Missing Vapi keys.', 'bot');
            return;
        }

        vapiInstance = window.vapiSDK.run({
            apiKey: CONFIG.vapiKey,
            assistant: CONFIG.vapiAssistant,
            config: { button: { display: 'none' } }
        });

        // Hide any Vapi buttons that appear in the main document
        hideVapiButtons();
        const observer = new MutationObserver(hideVapiButtons);
        observer.observe(document.body, { childList: true, subtree: true });

        vapiInstance.on('call-start', () => {
            voiceMode = true;
            voiceToggle.classList.add('active');
            widgetBtn.classList.add('active');
            voiceStatus.classList.add('active');
            addMessage('Voice connected. Speak now...', 'bot');
        });

        vapiInstance.on('call-end', () => {
            stopVoice();
        });

        vapiInstance.on('message', (m) => {
            console.log('Vapi message:', m);
            // Capture all transcript messages (both partial and final)
            if (m.type === 'transcript') {
                const role = m.role === 'user' ? 'You' : 'Agent';
                // Only show final transcripts to avoid spam
                if (m.transcriptType === 'final' && m.transcript) {
                    addMessage(`${role}: ${m.transcript}`, 'bot');
                }
            }
        });

        vapiInstance.on('error', (e) => {
            console.error('Vapi error:', e);
            addMessage('Voice connection error.', 'bot');
            stopVoice();
        });

        // Vapi SDK handles call start automatically
        addMessage('Connecting to voice...', 'bot');
    }

    function stopVoice() {
        if (vapiInstance) {
            try { vapiInstance.stop(); } catch(e) {}
            vapiInstance = null;
        }
        voiceMode = false;
        voiceToggle.classList.remove('active');
        widgetBtn.classList.remove('active');
        voiceStatus.classList.remove('active');
    }
})();
