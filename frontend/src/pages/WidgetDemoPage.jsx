import { useEffect, useState } from 'react';
import { getTenantId } from '../api/auth.js';

const DEFAULTS = {
  title: "Loggix AI Support",
  greeting: "Hi! I'm the Loggix AI assistant. How can I help you today?",
  primaryColor: "#57A3AF",
  primaryHover: "#41808B",
  backgroundColor: "#41808B",
  headerBg: "rgba(255,255,255,0.03)",
  textColor: "#ffffff",
  botMessageBg: "rgba(255,255,255,0.06)",
  icon: "",
  position: "bottom-right",
  vapiKey: "",
  vapiAssistant: localStorage.getItem('loggix_assistant_id') || '',
  tenantId: getTenantId() || '',
};

export default function WidgetDemoPage() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.LoggixWidget = DEFAULTS;
    const script = document.createElement('script');
    script.src = '/static/widget.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); const host = document.getElementById('loggix-widget-host'); if (host) host.remove(); };
  }, []);

  const embedCode = `<script>\nwindow.LoggixWidget = {\n  tenantId: ${JSON.stringify(DEFAULTS.tenantId)}\n};\n<\/script>\n<script src="${window.location.origin}/static/widget.js"><\/script>`;

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(87,163,175,0.12) 0%, transparent 50%)',
      padding: '2rem',
    }}>
      <div style={{ maxWidth: 700, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', color: 'var(--brand-accent)', marginBottom: '1rem', opacity: 0.8 }}>↘</div>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #41808B 0%, #57A3AF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Loggix AI Chat Widget
        </h1>
        <p style={{ color: '#57A3AF', fontSize: '1.1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
          Try the chat widget! Click the blue button in the bottom-right corner to start chatting with the AI assistant.
          You can type or use voice.
        </p>

        <div style={{
          background: 'rgba(255,255,255,0.65)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: '1.5rem',
          textAlign: 'left',
          marginBottom: '2rem',
        }}>
          <p style={{ color: '#41808B', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Add to any website:</p>
          <pre style={{
            color: '#7FB800',
            fontFamily: "'Courier New', monospace",
            fontSize: '0.85rem',
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
          }}>{embedCode}</pre>
          <button onClick={copyEmbed} style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: '#57A3AF',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}>
            {copied ? 'Copied!' : 'Copy Embed Code'}
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
        }}>
          {[
            { icon: '💬', title: 'Text Chat', desc: 'Ask questions about Loggix services' },
            { icon: '🎙️', title: 'Voice Chat', desc: 'Speak directly with the AI agent' },
            { icon: '🔌', title: 'Easy Embed', desc: 'One script tag to add anywhere' },
          ].map((f, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.65)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '1.5rem',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{f.icon}</div>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>{f.title}</h3>
              <p style={{ color: '#57A3AF', fontSize: '0.8rem', margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

