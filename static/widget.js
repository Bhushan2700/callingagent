(async function() {
    const scriptEl = document.currentScript;
    const API_BASE = window.LoggixWidget?.apiBase || (scriptEl ? new URL(scriptEl.src).origin : window.location.origin);
    const TENANT_ID = window.LoggixWidget?.tenantId || '';

    const CONFIG = {
        position: 'bottom-right',
        title: 'Loggix AI Support',
        greeting: 'Hi! How can I help you today?',
        primaryColor: '#0061FF',
        primaryHover: '#0051d4',
        backgroundColor: '#0f172a',
        headerBg: 'rgba(255,255,255,0.03)',
        textColor: '#ffffff',
        botMessageBg: 'rgba(255,255,255,0.06)',
        icon: '',
        vapiKey: '',
        vapiAssistant: '',
    };

    if (window.LoggixWidget) {
        Object.assign(CONFIG, window.LoggixWidget);
    }

    if (TENANT_ID) {
        try {
            const res = await fetch(`${API_BASE}/api/public/widget-config?tenant_id=${encodeURIComponent(TENANT_ID)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.config) Object.assign(CONFIG, data.config);
            }
        } catch(e) {}
    }

    if (CONFIG.vapiKey && !window.vapiSDK) {
        const vapiScript = document.createElement('script');
        vapiScript.src = 'https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js';
        vapiScript.defer = true;
        document.head.appendChild(vapiScript);
    }

    const host = document.createElement('div');
    host.id = 'loggix-widget-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    const align = CONFIG.position.includes('right') ? 'right' : 'left';
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Plus Jakarta Sans', sans-serif; }

        .widget-btn {
            position: fixed;
            ${align}: 20px;
            bottom: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: linear-gradient(135deg, ${CONFIG.primaryColor} 0%, ${CONFIG.primaryHover} 100%);
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 20px ${CONFIG.primaryColor}66;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 999999;
        }
        .widget-btn:hover { transform: scale(1.1); box-shadow: 0 6px 25px ${CONFIG.primaryColor}99; }
        .widget-btn.active { background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4); animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4); } 50% { box-shadow: 0 4px 30px rgba(16, 185, 129, 0.6); } }
        .widget-btn svg { width: 28px; height: 28px; fill: white; }

        .chat-panel {
            position: fixed;
            ${align}: 20px;
            bottom: 90px;
            width: 380px;
            height: 520px;
            background: ${CONFIG.backgroundColor};
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
            background: ${CONFIG.headerBg};
            border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .chat-header h3 { color: ${CONFIG.textColor}; font-size: 14px; font-weight: 700; }
        .chat-header-actions { display: flex; gap: 8px; }
        .header-btn {
            width: 32px; height: 32px; border-radius: 8px; border: none;
            background: rgba(255,255,255,0.05); cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s;
        }
        .header-btn:hover { background: rgba(255,255,255,0.1); }
        .header-btn svg { width: 16px; height: 16px; fill: #94a3b8; }
        .header-btn.active { background: rgba(16, 185, 129, 0.2); }
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
        .message.user { align-self: flex-end; background: ${CONFIG.primaryColor}; color: white; border-bottom-right-radius: 4px; }
        .message.bot { align-self: flex-start; background: ${CONFIG.botMessageBg}; color: ${CONFIG.textColor}; border-bottom-left-radius: 4px; }
        .message.system { align-self: center; background: transparent; color: #64748b; font-size: 11px; }

        .typing-indicator {
            align-self: flex-start;
            padding: 10px 14px;
            background: ${CONFIG.botMessageBg};
            border-radius: 14px;
            display: none;
        }
        .typing-indicator.visible { display: flex; gap: 4px; align-items: center; }
        .typing-dot { width: 6px; height: 6px; border-radius: 50%; background: #64748b; animation: typing 1.4s infinite; }
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
            flex: 1; padding: 10px 14px; border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05);
            color: white; font-size: 13px; outline: none; font-family: inherit;
        }
        .chat-input input:focus { border-color: ${CONFIG.primaryColor}; }
        .chat-input input::placeholder { color: #64748b; }
        .send-btn {
            width: 40px; height: 40px; border-radius: 12px; border: none;
            background: ${CONFIG.primaryColor}; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.2s;
        }
        .send-btn:hover { background: ${CONFIG.primaryHover}; }
        .send-btn:disabled { background: #334155; cursor: not-allowed; }
        .send-btn svg { width: 18px; height: 18px; fill: white; }

        .voice-status {
            padding: 8px 16px; text-align: center; font-size: 11px;
            color: #64748b; display: none; border-top: 1px solid rgba(255,255,255,0.05);
        }
        .voice-status.active { display: block; color: #10b981; background: rgba(16, 185, 129, 0.05); }

        @media (max-width: 480px) {
            .chat-panel {
                width: calc(100% - 20px); height: calc(100% - 100px);
                ${align}: 10px; bottom: 80px;
            }
        }
    `;
    shadow.appendChild(style);

    const iconSvg = CONFIG.icon && CONFIG.icon.trim()
        ? CONFIG.icon.trim()
        : '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';

    const container = document.createElement('div');
    container.innerHTML = `
        <button class="widget-btn" id="widget-btn">
            ${iconSvg}
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

    widgetBtn.addEventListener('click', () => {
        isOpen = !isOpen;
        chatPanel.classList.toggle('open', isOpen);
        if (isOpen) chatInput.focus();
    });

    closeBtn.addEventListener('click', () => {
        isOpen = false;
        chatPanel.classList.remove('open');
    });

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        addMessage(text, 'user');
        chatInput.value = '';
        sendBtn.disabled = true;
        typing.classList.add('visible');

        history.push({ role: 'user', content: text });

        try {
            const payload = { message: text, history: history.slice(-10) };
            if (TENANT_ID) payload.tenant_id = TENANT_ID;
            const res = await fetch(`${API_BASE}/api/public/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
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

    voiceToggle.addEventListener('click', () => {
        if (voiceMode) {
            stopVoice();
        } else {
            startVoice();
        }
    });

    function startVoice() {
        if (!CONFIG.vapiKey || !CONFIG.vapiAssistant) {
            addMessage('Voice chat is not configured.', 'system');
            return;
        }

        if (!window.vapiSDK) {
            addMessage('Loading voice service...', 'system');
            const checkInterval = setInterval(() => {
                if (window.vapiSDK) {
                    clearInterval(checkInterval);
                    initVapi();
                }
            }, 100);
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!window.vapiSDK) {
                    addMessage('Voice service failed to load.', 'system');
                }
            }, 5000);
            return;
        }

        initVapi();
    }

    function initVapi() {
        try {
            vapiInstance = window.vapiSDK.run({
                apiKey: CONFIG.vapiKey,
                assistant: CONFIG.vapiAssistant,
                config: { button: { display: 'none' } }
            });

            vapiInstance.on('call-start', () => {
                voiceMode = true;
                voiceToggle.classList.add('active');
                widgetBtn.classList.add('active');
                voiceStatus.classList.add('active');
                addMessage('Voice connected! Speak now...', 'system');
            });

            vapiInstance.on('call-end', () => {
                stopVoice();
                addMessage('Voice disconnected.', 'system');
            });

            vapiInstance.on('message', (m) => {
                if (m.type === 'transcript' && m.transcriptType === 'final' && m.transcript) {
                    addMessage(`${m.transcript}`, m.role === 'user' ? 'user' : 'bot');
                }
            });

            vapiInstance.on('error', (e) => {
                console.error('Vapi error:', e);
                addMessage('Voice connection failed.', 'system');
                stopVoice();
            });

            addMessage('Connecting to voice...', 'system');
        } catch (err) {
            console.error('Vapi init error:', err);
            addMessage('Failed to initialize voice.', 'system');
        }
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
