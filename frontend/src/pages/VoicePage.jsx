import { useEffect, useRef, useState } from 'react';

export default function VoicePage() {
  const vapiRef = useRef(null);
  const [active, setActive] = useState(false);
  const [transcripts, setTranscripts] = useState([]);
  const streamRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/VapiAI/html-script-tag@latest/dist/assets/index.js';
    script.defer = true;
    script.async = true;
    script.onload = () => {
      const publicKey = "a15e4ada-0005-4628-9ec0-d4761e080cb4";
      const assistantId = localStorage.getItem('loggix_assistant_id');

      window.startCall = () => {
        if (!assistantId) {
          setActive(false);
          setTranscripts(prev => [...prev, { role: 'System', text: 'No voice assistant configured for this account yet. Ask your admin to set one up.' }]);
          return;
        }
        const instance = window.vapiSDK.run({
          apiKey: publicKey,
          assistant: assistantId,
          config: { button: { display: "none" } }
        });

        instance.on('call-start', () => setActive(true));
        instance.on('call-end', () => { setActive(false); vapiRef.current = null; });
        instance.on('message', (m) => {
          if (m.type === 'transcript' && m.transcriptType === 'final') {
            setTranscripts(prev => [...prev, { role: m.role === 'user' ? 'You' : 'Agent', text: m.transcript }]);
          }
        });
        instance.on('error', () => { setActive(false); vapiRef.current = null; });
        vapiRef.current = instance;
      };

      window.stopCall = () => {
        if (vapiRef.current) {
          vapiRef.current.stop();
          vapiRef.current = null;
        }
        setActive(false);
      };
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [transcripts]);

  const toggleCall = () => {
    if (active) {
      window.stopCall?.();
    } else {
      window.startCall?.();
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      position: 'relative',
      overflow: 'hidden',
      backgroundImage: `
        radial-gradient(circle at 20% 30%, rgba(0,97,255,0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 70%, rgba(0,97,255,0.05) 0%, transparent 50%)
      `,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 350px',
        gap: '2rem',
        width: 1000,
        maxWidth: '95%',
        height: 600,
        zIndex: 10,
      }}>
        <div style={{
          background: 'var(--glass)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem',
          transform: 'rotateX(5deg) rotateY(-5deg)',
          boxShadow: '-20px 20px 50px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.05)',
          transition: 'transform 0.5s ease',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'rotateX(0deg) rotateY(0deg)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'rotateX(5deg) rotateY(-5deg)' }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-1px' }}>LOGGIX AI</h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '3px', marginTop: '4px' }}>Voice Support Portal</p>
          </div>

          <div style={{ position: 'relative', width: 250, height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem' }}>
            <div style={{
              position: 'absolute',
              width: 180, height: 180,
              border: '2px solid var(--glass-border)',
              borderTopColor: active ? '#10b981' : 'var(--brand-blue)',
              borderRadius: '50%',
              animation: 'spin 3s linear infinite',
            }} />
            <div style={{
              position: 'absolute',
              width: 220, height: 220,
              border: '2px solid var(--glass-border)',
              borderRightColor: active ? '#10b981' : 'var(--brand-blue)',
              borderRadius: '50%',
              animation: 'spin 5s linear infinite reverse',
            }} />
            <div style={{
              width: 120, height: 120,
              background: active
                ? 'radial-gradient(circle at 30% 30%, #10b981, #065f46)'
                : 'radial-gradient(circle at 30% 30%, var(--brand-blue), #003087)',
              borderRadius: '50%',
              position: 'relative',
              zIndex: 5,
              boxShadow: active
                ? '0 0 80px rgba(16,185,129,0.5)'
                : '0 0 60px var(--brand-glow)',
              animation: 'float 4s infinite ease-in-out',
            }} />
          </div>

          <button
            onClick={toggleCall}
            style={{
              width: '100%',
              padding: '1.25rem',
              borderRadius: 20,
              border: 'none',
              background: active ? '#ef4444' : 'var(--brand-blue)',
              color: 'white',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              boxShadow: active
                ? '0 10px 20px rgba(239,68,68,0.3)'
                : '0 10px 20px rgba(0,97,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)' }}
          >
            <span>{active ? '✕' : '⚡'}</span>
            <span>{active ? 'End Support Session' : 'Connect to Support'}</span>
          </button>
          <p style={{ marginTop: '1rem', fontSize: '0.75rem', fontWeight: 600, color: active ? '#10b981' : 'var(--text-muted)' }}>
            {active ? 'LIVE CONNECTION ACTIVE' : 'ENCRYPTED CHANNEL SECURE'}
          </p>
        </div>

        <div style={{
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 30,
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}>
          <div style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            color: 'var(--brand-blue)',
            marginBottom: '1.5rem',
            fontWeight: 800,
            flexShrink: 0,
          }}>
            Conversation Logs
          </div>
          <div ref={streamRef} style={{
            flex: 1,
            overflowY: 'auto',
            paddingRight: 10,
          }}>
            {transcripts.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No conversations yet. Start a call to see the transcript here.</p>
            )}
            {transcripts.map((t, i) => (
              <div key={i} style={{
                fontSize: '0.85rem',
                marginBottom: '1rem',
                lineHeight: 1.5,
                color: 'var(--text-secondary)',
                animation: 'slideIn 0.3s ease forwards',
              }}>
                <b style={{ color: 'white', display: 'block', fontSize: '0.7rem', marginBottom: '2px', textTransform: 'uppercase' }}>
                  {t.role}
                </b>
                {t.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-20px) scale(1.05); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
