import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Building2, Phone, MessageSquare, Video, Palette, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getOnboardingStatus, saveOnboarding } from '../api/onboarding.js';
import { createPhoneRequest } from '../api/superAdmin.js';

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'Female', desc: 'Warm, friendly' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Female', desc: 'Soft, professional' },
  { id: 'XrExE9yKIg1Wjnnl2k150', name: 'Elizabeth', gender: 'Female', desc: 'Bright, energetic' },
  { id: 'LcfcDJNUP1GQjkzn1xHp', name: 'Freya', gender: 'Female', desc: 'Calm, soothing' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'Male', desc: 'Warm, deep' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'Male', desc: 'Neutral, professional' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Domi', gender: 'Male', desc: 'Smooth, casual' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'Male', desc: 'Deep, reassuring' },
];

const LANGUAGES = ['English', 'Spanish', 'Hindi', 'French', 'German', 'Dutch', 'Arabic', 'Portuguese', 'Italian', 'Japanese', 'Korean', 'Chinese'];
const INDUSTRIES = ['Healthcare', 'Legal', 'Real Estate', 'Restaurant / Hospitality', 'Retail', 'Automotive', 'IT / Software', 'Finance', 'Education', 'Home Services', 'Other'];
const COUNTRIES = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'IN', label: 'India' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'AE', label: 'United Arab Emirates' },
];

const PROVIDERS = [
  { value: 'vapi', label: 'Vapi (Instant)', fields: [] },
  { value: 'twilio', label: 'Twilio', fields: [['accountSid', 'Account SID'], ['authToken', 'Auth Token']] },
  { value: 'vonage', label: 'Vonage', fields: [['apiKey', 'API Key'], ['apiSecret', 'API Secret']] },
  { value: 'telnyx', label: 'Telnyx', fields: [['apiKey', 'API Key']] },
];

const STEPS = [
  { key: 'business', icon: Building2, title: 'Your Business', short: 'Business' },
  { key: 'voice', icon: Mic, title: 'Voice & Language', short: 'Voice' },
  { key: 'capabilities', icon: MessageSquare, title: 'What It Does', short: 'Capabilities' },
  { key: 'phone', icon: Phone, title: 'Phone Number', short: 'Phone' },
  { key: 'widget', icon: Palette, title: 'Widget Branding', short: 'Widget' },
  { key: 'review', icon: Video, title: 'Review & Create', short: 'Review' },
];

const PROVISION_STEPS = ['Creating your voice assistant', 'Wiring tools & webhook', 'Saving phone info', 'Saving your settings'];

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 12,
  border: '1px solid rgba(65,128,139,0.25)',
  background: 'rgba(255,255,255,0.65)',
  color: '#41808B',
  fontSize: '14px',
  outline: 'none',
};
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#57A3AF', marginBottom: 6 };
const cardStyle = { background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 24, padding: '2rem', width: 560, maxWidth: '100%' };

export default function OnboardingPage() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState('form');
  const [provisionIdx, setProvisionIdx] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    company_name: '', industry: '', description: '', business_hours: '', timezone: 'UTC',
    languages: ['English'], voice_id: VOICES[0].id,
    greeting: '', tools_enabled: ['search_knowledge', 'raise_ticket'],
    phone: { mode: 'provider', country: 'US', area_code: '', provider: 'vapi', number: '', credentials: {} },
    widget: { title: '', primaryColor: '#57A3AF', position: 'bottom-right' },
  });

  useEffect(() => {
    getOnboardingStatus().then(status => {
      if (status) {
        if (status.onboarding_complete) { nav('/dashboard', { replace: true }); return; }
      setForm(prev => ({
        ...prev,
        company_name: status.company_name || prev.company_name,
        voice_id: status.voice_id || prev.voice_id,
        languages: status.languages?.length ? status.languages : prev.languages,
        tools_enabled: status.tools_enabled?.length ? status.tools_enabled : prev.tools_enabled,
      }));
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, [nav]);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));
  const stepValid = () => {
    const s = STEPS[step].key;
    if (s === 'business') return form.company_name.trim() && form.description.trim();
    if (s === 'voice') return form.languages.length > 0 && form.voice_id;
    if (s === 'capabilities') return form.tools_enabled.length > 0;
    if (s === 'phone') {
      const p = form.phone;
      if (p.provider === 'vapi') return true;
      return p.number.trim() && p.provider && 
        PROVIDERS.find(x => x.value === p.provider)?.fields.every(([k]) => (p.credentials[k] || '').trim());
    }
    return true;
  };

  const next = () => { if (stepValid()) setStep(s => Math.min(s + 1, STEPS.length - 1)); };

  const provisioningSequence = async () => {
    setPhase('provisioning');
    setError('');
    setProvisionIdx(0);
    const timer = setInterval(() => setProvisionIdx(i => Math.min(i + 1, PROVISION_STEPS.length - 1)), 900);
    try {
      const useVapiNumber = form.phone.provider === 'vapi';
      const res = await saveOnboarding({
        company_name: form.company_name, industry: form.industry, description: form.description,
        business_hours: form.business_hours, timezone: form.timezone, greeting: form.greeting,
        languages: form.languages, voice_id: form.voice_id, tools_enabled: form.tools_enabled,
        phone: useVapiNumber ? { mode: 'buy' } : form.phone, widget: form.widget,
      });
      if (res.status !== 'ok') {
        clearInterval(timer);
        setError(res.message || 'Something went wrong while creating your assistant.');
        setPhase('error');
        return;
      }
      if (res.assistant_id) localStorage.setItem('loggix_assistant_id', res.assistant_id);
      if (res.phone_number) localStorage.setItem('loggix_phone_number', res.phone_number);
      // BYO numbers still need admin configuration
      if (!useVapiNumber) {
        await createPhoneRequest({
          provider: form.phone.provider,
          phone_number: form.phone.number,
          credentials: form.phone.credentials,
        });
      }
      clearInterval(timer);
      nav('/dashboard', { replace: true });
    } catch (err) {
      clearInterval(timer);
      setError('Network error while creating your assistant. Please try again.');
      setPhase('error');
    }
  };

  if (!loaded) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  if (phase !== 'form') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 1.5rem', background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px var(--brand-glow)' }}>
              {phase === 'error'
                ? <span style={{ fontSize: '2rem' }}>⚠️</span>
                : <Loader2 size={30} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />}
            </div>
            {phase === 'error' ? (
              <>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>Almost there</h1>
                <p style={{ color: '#F46036', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{error}</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={() => setPhase('form')}>Back to setup</button>
                  <button className="btn" onClick={provisioningSequence} style={{ background: 'var(--brand-gradient)', color: '#fff', border: 'none', fontWeight: 600, borderRadius: 10, padding: '0.6rem 1.2rem', cursor: 'pointer' }}>Retry</button>
                </div>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>Setting up your AI receptionist</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>This takes a few seconds.</p>
                <div style={{ maxWidth: 360, margin: '0 auto' }}>
                  {PROVISION_STEPS.map((label, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.4rem 0', color: i <= provisionIdx ? '#7FB800' : '#57A3AF', fontSize: '0.9rem', fontWeight: i === provisionIdx ? 700 : 500 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: '2px solid', borderColor: i < provisionIdx ? '#57A3AF' : i === provisionIdx ? '#7FB800' : '#57A3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
                        {i < provisionIdx ? <Check size={11} /> : i === provisionIdx ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : ''}
                      </span>
                      {label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const S = STEPS[step];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: 620, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, marginBottom: '0.5rem', background: 'linear-gradient(135deg, #41808B 0%, #7FB800 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Set Up Your AI Receptionist
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>We'll build, configure, and wire everything for you.</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <button key={s.key} onClick={() => i < step && setStep(i)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.8rem', borderRadius: 10,
                border: i === step ? '1px solid rgba(127,184,0,0.4)' : '1px solid var(--glass-border)',
                background: i === step ? 'rgba(87,163,175,0.12)' : 'var(--glass)',
                color: i === step ? '#7FB800' : i < step ? '#57A3AF' : '#41808B',
                fontSize: '12px', fontWeight: 600, cursor: i < step ? 'pointer' : 'default',
              }}>
                <Icon size={13} />
                {s.short}
                {i < step && <Check size={12} color="#57A3AF" />}
              </button>
            );
          })}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--brand-accent)', fontWeight: 800, marginBottom: '0.5rem' }}>
            Step {step + 1} of {STEPS.length}
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1.5rem' }}>{S.title}</h2>

          {S.key === 'business' && (
            <>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Business / Company Name *</label>
                <input style={inputStyle} value={form.company_name} onChange={e => set({ company_name: e.target.value })} placeholder="e.g. Acme Dental Clinic" />
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Industry</label>
                <select style={inputStyle} value={form.industry} onChange={e => set({ industry: e.target.value })}>
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>What does your business do? *</label>
                <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.description}
                  onChange={e => set({ description: e.target.value })} placeholder="A short paragraph describing your products, services, or what customers call about." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label style={labelStyle}>Business Hours</label>
                  <input style={inputStyle} value={form.business_hours} onChange={e => set({ business_hours: e.target.value })} placeholder="e.g. Mon-Fri 9am-6pm" />
                </div>
                <div className="form-group">
                  <label style={labelStyle}>Timezone</label>
                  <input style={inputStyle} value={form.timezone} onChange={e => set({ timezone: e.target.value })} placeholder="UTC" />
                </div>
              </div>
            </>
          )}

          {S.key === 'voice' && (
            <>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Language(s) for calls</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LANGUAGES.map(lang => (
                    <button key={lang} type="button" onClick={() => {
                      const has = form.languages.includes(lang);
                      set({ languages: has ? form.languages.filter(x => x !== lang) : [...form.languages, lang] });
                    }} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      border: form.languages.includes(lang) ? '1px solid rgba(127,184,0,0.5)' : '1px solid var(--glass-border)',
                      background: form.languages.includes(lang) ? 'rgba(87,163,175,0.15)' : 'var(--glass)',
                      color: form.languages.includes(lang) ? '#7FB800' : '#57A3AF',
                    }}>{lang}</button>
                  ))}
                </div>
              </div>
              <label style={labelStyle}>Voice for the assistant</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {VOICES.map(v => (
                  <button key={v.id} type="button" onClick={() => set({ voice_id: v.id })} style={{
                    padding: '12px 14px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                    border: form.voice_id === v.id ? '1.5px solid rgba(127,184,0,0.6)' : '1px solid var(--glass-border)',
                    background: form.voice_id === v.id ? 'rgba(87,163,175,0.12)' : 'var(--glass)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#41808B', marginBottom: 2 }}>{v.name} <span style={{ fontWeight: 500, color: '#41808B', fontSize: 11 }}>({v.gender})</span></div>
                    <div style={{ fontSize: '11px', color: '#41808B' }}>{v.desc}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {S.key === 'capabilities' && (
            <>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={labelStyle}>Greeting message</label>
                <input style={inputStyle} value={form.greeting} onChange={e => set({ greeting: e.target.value })} placeholder={`Default: Hello! You've reached ${form.company_name || 'your business'}. How can I help?`} />
              </div>
              <label style={labelStyle}>What should it handle?</label>
              {[
                { key: 'search_knowledge', title: 'Answer questions', desc: 'Answers callers using your uploaded knowledge base.' },
                { key: 'book_appointment', title: 'Book appointments', desc: 'Collects name, phone, email & a time slot then books a consultation.' },
                { key: 'raise_ticket', title: 'Raise support tickets', desc: 'Captures caller info and creates a ticket for your team.' },
              ].map(cap => (
                <button key={cap.key} type="button" onClick={() => {
                  const has = form.tools_enabled.includes(cap.key);
                  set({ tools_enabled: has ? form.tools_enabled.filter(x => x !== cap.key) : [...form.tools_enabled, cap.key] });
                }} style={{
                  width: '100%', display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 14,
                  marginBottom: 8, textAlign: 'left', cursor: 'pointer',
                  border: form.tools_enabled.includes(cap.key) ? '1.5px solid rgba(127,184,0,0.6)' : '1px solid var(--glass-border)',
                  background: form.tools_enabled.includes(cap.key) ? 'rgba(87,163,175,0.12)' : 'var(--glass)',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid', borderColor: form.tools_enabled.includes(cap.key) ? '#7FB800' : '#57A3AF', color: '#fff', background: form.tools_enabled.includes(cap.key) ? '#7FB800' : 'transparent', fontSize: 13,
                  }}>{form.tools_enabled.includes(cap.key) ? '✓' : ''}</span>
                  <span>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#41808B' }}>{cap.title}</span>
                    <span style={{ display: 'block', fontSize: '12px', color: '#41808B' }}>{cap.desc}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {S.key === 'phone' && (
            <>
              <p style={{ fontSize: '12px', color: '#57A3AF', marginBottom: '0.75rem' }}>
                Get a ready-to-use number instantly, or connect your existing provider. BYO numbers are configured by our team after setup.
              </p>
              {[
                { provider: 'vapi', title: 'Get a phone number instantly', desc: 'We assign a working number automatically — nothing to configure.' },
                { provider: 'twilio', title: 'Use my Twilio number', desc: 'Requires Twilio Account SID + Auth Token' },
                { provider: 'vonage', title: 'Use my Vonage number', desc: 'Requires Vonage API Key + API Secret' },
                { provider: 'telnyx', title: 'Use my Telnyx number', desc: 'Requires Telnyx API Key' },
              ].map(opt => (
                <button key={opt.provider} type="button" onClick={() => set({ phone: { ...form.phone, mode: 'provider', provider: opt.provider } })} style={{
                  width: '100%', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14,
                  marginBottom: 8, textAlign: 'left', cursor: 'pointer',
                  border: form.phone.provider === opt.provider ? '1.5px solid rgba(127,184,0,0.6)' : '1px solid var(--glass-border)',
                  background: form.phone.provider === opt.provider ? 'rgba(87,163,175,0.12)' : 'var(--glass)',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid', borderColor: form.phone.provider === opt.provider ? '#7FB800' : '#57A3AF',
                  }}>{form.phone.provider === opt.provider && <span style={{ width: 10, height: 10, borderRadius: 999, background: '#7FB800' }} />}</span>
                  <span>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#41808B' }}>{opt.title}</span>
                    <span style={{ display: 'block', fontSize: '12px', color: '#41808B' }}>{opt.desc}</span>
                  </span>
                </button>
              ))}

              {form.phone.mode === 'provider' && form.phone.provider !== 'vapi' && (
                <div style={{ marginTop: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={labelStyle}>Provider</label>
                    <select style={inputStyle} value={form.phone.provider} onChange={e => set({ phone: { ...form.phone, provider: e.target.value } })}>
                      {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label style={labelStyle}>Your phone number (E.164)</label>
                    <input style={inputStyle} value={form.phone.number} onChange={e => set({ phone: { ...form.phone, number: e.target.value } })} placeholder="e.g. +14155551234" />
                  </div>
                  {PROVIDERS.find(p => p.value === form.phone.provider)?.fields.map(([k, lbl]) => (
                    <div className="form-group" key={k} style={{ marginBottom: '0.75rem' }}>
                      <label style={labelStyle}>{lbl}</label>
                      <input type="password" autocomplete="off" style={inputStyle} value={form.phone.credentials[k] || ''}
                        onChange={e => set({ phone: { ...form.phone, credentials: { ...form.phone.credentials, [k]: e.target.value } } })} />
                    </div>
                  ))}
                  <p style={{ fontSize: '11px', color: '#41808B', marginTop: '0.5rem' }}>Your credentials are forwarded directly to Vapi to power your number. We never store them.</p>
                </div>
              )}
            </>
          )}

          {S.key === 'widget' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>Widget Title</label>
                  <input style={inputStyle} value={form.widget.title} onChange={e => set({ widget: { ...form.widget, title: e.target.value } })} placeholder={form.company_name || 'Support'} />
                </div>
                <div>
                  <label style={labelStyle}>Position</label>
                  <select style={inputStyle} value={form.widget.position} onChange={e => set({ widget: { ...form.widget, position: e.target.value } })}>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Brand Color</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input type="color" value={form.widget.primaryColor} onChange={e => set({ widget: { ...form.widget, primaryColor: e.target.value } })}
                    style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', padding: 2 }} />
                  <input style={inputStyle} value={form.widget.primaryColor} onChange={e => set({ widget: { ...form.widget, primaryColor: e.target.value } })} />
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#41808B' }}>You can fine-tune the full widget (colors, icon, greeting) anytime from <b>Widget Config</b> after setup.</p>
            </>
          )}

          {S.key === 'review' && (
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 2 }}>
              <div style={{ background: 'var(--glass)', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '0.75rem' }}>
                <div style={{ color: '#41808B', fontWeight: 700, marginBottom: 4 }}>{form.company_name || '—'}</div>
                <div>{form.industry || 'No industry'} • {form.languages.join(', ')} • Voice: {VOICES.find(v => v.id === form.voice_id)?.name || 'Default'}</div>
                <div style={{ fontSize: '13px', color: '#57A3AF' }}>Capabilities: {form.tools_enabled.length ? form.tools_enabled.join(', ') : 'none selected'}</div>
                <div style={{ fontSize: '13px', color: '#57A3AF' }}>
                  Phone: {form.phone.provider === 'vapi' ? 'New number assigned automatically (Vapi)' : `${PROVIDERS.find(p => p.value === form.phone.provider)?.label || form.phone.provider} • ${form.phone.number}`}
                </div>
              </div>
              <div style={{ background: 'var(--glass)', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, color: '#41808B', marginBottom: 4 }}>Chat widget</div>
                <div style={{ fontSize: '13px', color: '#57A3AF' }}>Title: {form.widget.title || form.company_name || 'Support'} • Color: {form.widget.primaryColor} • Position: {form.widget.position}</div>
              </div>
              <p style={{ fontSize: '12px', color: '#41808B' }}>We'll create your Vapi assistant, wire the tools and webhook, and save your phone details for our team to configure. You'll see the status in your dashboard.</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', gap: 10 }}>
            <button className="btn" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.65rem 1.2rem', borderRadius: 12, border: '1px solid var(--glass-border)', background: 'var(--glass)', color: '#57A3AF', cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.5 : 1 }}>
              <ChevronLeft size={15} /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button className="btn btn-primary" onClick={next}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.65rem 1.4rem', borderRadius: 12, cursor: 'pointer', opacity: stepValid() ? 1 : 0.5 }}>
                Continue <ChevronRight size={15} />
              </button>
            ) : (
              <button className="btn btn-primary" onClick={provisioningSequence}
                style={{ padding: '0.65rem 1.4rem', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                Create My Assistant
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}