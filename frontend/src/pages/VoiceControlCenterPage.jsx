import React, { useState, useEffect } from 'react';
import { Mic, Save, Rocket, CheckCircle2 } from 'lucide-react';
import { getAssistantConfig, saveAssistantConfig, publishAssistantConfig } from '../api/admin.js';

const TOOLS = [
  { id: 'search_knowledge', label: 'Knowledge search', desc: 'Answer from the knowledge base' },
  { id: 'book_appointment', label: 'Book appointments', desc: 'Schedule via Cal.com' },
  { id: 'raise_ticket', label: 'Raise tickets', desc: 'Create support tickets' },
];

const inputStyle = { width: '100%', padding: '0.6rem 0.85rem', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' };

export default function VoiceControlCenterPage() {
  const [assistantId, setAssistantId] = useState('');
  const [live, setLive] = useState(null);
  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState({ company_name: '', greeting: '', voice_id: '', tools_enabled: ['search_knowledge'] });
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAssistantConfig().then(d => {
      setAssistantId(d.assistant_id || '');
      setLive(d.live);
      setDraft(d.draft);
      const base = d.live || {};
      const model = base.model || {};
      const server = base.server || {};
      const firstMsg = typeof base.firstMessage === 'string' ? base.firstMessage : (base.firstMessage?.text || '');
      setForm({
        company_name: base.name ? base.name.replace(' AI Receptionist', '') : '',
        greeting: firstMsg,
        voice_id: base.voice?.voiceId || '',
        tools_enabled: (base.tools || []).map(t => t.function?.name?.replace('.', '')).filter(Boolean),
      });
    }).catch(() => {});
  }, []);

  const save = async () => {
    setError('');
    setSaved(false);
    try {
      const res = await saveAssistantConfig(form);
      setSaved(true);
      setDraft({ id: res.draft_id, status: 'draft', config: form });
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    }
  };

  const publish = async () => {
    if (!draft) { setError('Save a draft first.'); return; }
    setError('');
    setPublishing(true);
    try {
      await publishAssistantConfig(draft.id);
      setDraft(null);
      const d = await getAssistantConfig();
      setLive(d.live);
      setPublishing(false);
    } catch (e) {
      setError(e.message);
      setPublishing(false);
    }
  };

  const toggleTool = (id) => {
    setForm(f => ({ ...f, tools_enabled: f.tools_enabled.includes(id) ? f.tools_enabled.filter(t => t !== id) : [...f.tools_enabled, id] }));
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 860, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Voice Control Center</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 1.5rem', fontSize: '0.9rem' }}>
        {assistantId ? `Assistant ${assistantId.slice(0, 8)}… · edit below, save as draft, then publish to go live on Vapi` : 'No assistant configured for this tenant yet.'}
      </p>

      {error && <div style={{ marginBottom: '1rem', padding: '0.7rem 1rem', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.85rem' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mic size={15} color="#5eead4" /> Voice settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Company name
              <input style={{ ...inputStyle, marginTop: 4 }} value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Your Company" />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>First message (greeting)
              <textarea style={{ ...inputStyle, marginTop: 4, minHeight: 64, resize: 'vertical' }} value={form.greeting} onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))} placeholder="Hello! You've reached…" />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ElevenLabs voice id
              <input style={{ ...inputStyle, marginTop: 4 }} value={form.voice_id} onChange={e => setForm(f => ({ ...f, voice_id: e.target.value }))} placeholder="21m00Tcm4TlvDq8ikWAM" />
            </label>
          </div>
        </div>

        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Capabilities</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {TOOLS.map(t => {
              const on = form.tools_enabled.includes(t.id);
              return (
                <button key={t.id} onClick={() => toggleTool(t.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.85rem', borderRadius: 10, border: `1px solid ${on ? 'rgba(94,234,212,0.4)' : 'var(--glass-border)'}`, background: on ? 'rgba(20,184,166,0.1)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${on ? '#5eead4' : '#64748b'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {on && <CheckCircle2 size={13} color="#5eead4" />}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: '#e2e8f0' }}>{t.label}</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.6rem 1.2rem', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 700, background: 'var(--brand-gradient)', color: '#fff', boxShadow: '0 4px 14px var(--brand-glow)' }}>
          <Save size={15} /> Save draft {saved && <CheckCircle2 size={15} />}
        </button>
        <button onClick={publish} disabled={publishing} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.6rem 1.2rem', borderRadius: 10, border: '1px solid rgba(94,234,212,0.4)', cursor: publishing ? 'wait' : 'pointer', fontSize: '0.88rem', fontWeight: 700, background: 'rgba(20,184,166,0.12)', color: '#5eead4' }}>
          <Rocket size={15} /> {publishing ? 'Publishing…' : 'Publish to live'}
        </button>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {draft ? `Draft saved (${draft.id.slice(0, 12)}…) — not live yet` : 'No draft pending'}
        </span>
      </div>

      {live && (
        <div style={{ marginTop: '1.5rem', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: '0.9rem 1.2rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <strong style={{ color: '#6ee7b7' }}>Currently live:</strong> {live.name || 'Unnamed assistant'}
          {live.voice?.voiceId && ` · voice ${live.voice.voiceId.slice(0, 8)}`}
          {live.model?.model && ` · ${live.model.model}`}
          {live.tools?.length > 0 && ` · ${live.tools.length} tool(s)`}
        </div>
      )}
    </div>
  );
}