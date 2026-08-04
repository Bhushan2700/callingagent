import { useState, useEffect, useCallback } from 'react';
import { getWidgetConfig, updateWidgetConfig } from '../api/widget.js';
import { getTenantId } from '../api/auth.js';

const DEFAULTS = {
  title: "Loggix AI Support",
  greeting: "Hi! I'm the Loggix AI assistant. How can I help you today?",
  primaryColor: "#14B8A6",
  primaryHover: "#0051d4",
  backgroundColor: "#0f172a",
  headerBg: "rgba(255,255,255,0.03)",
  textColor: "#ffffff",
  botMessageBg: "rgba(255,255,255,0.06)",
  icon: "",
  position: "bottom-right",
  vapiAssistant: localStorage.getItem('loggix_assistant_id') || '',
};

export default function WidgetConfigPage() {
  const [config, setConfig] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    getWidgetConfig().then(setConfig).catch(() => setConfig(DEFAULTS));
  }, []);

  const update = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateWidgetConfig(config);
      setSaveStatus({ type: 'saved', text: 'Saved successfully!' });
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus({ type: 'error', text: 'Failed to save' });
    }
    setSaving(false);
  };

  const embedCode = () => {
    const baseUrl = window.location.origin;
    const tenantId = getTenantId();
    const overrides = [];
    for (const [key, val] of Object.entries(config)) {
      if (val === DEFAULTS[key]) continue;
      if (key === 'icon') {
        overrides.push(`    ${key}: \`${val}\``);
      } else if (key === 'position' && val === 'bottom-right') {
        continue;
      } else {
        overrides.push(`    ${key}: ${JSON.stringify(val)}`);
      }
    }
    overrides.push(`    tenantId: ${JSON.stringify(tenantId)}`);
    const tag = '<' + 'script';
    const close = '<' + '/script>';
    return `${tag}>\nwindow.LoggixWidget = {\n${overrides.join(',\n')}\n};\n${close}\n${tag} src="${baseUrl}/static/widget.js">${close}`;
  };

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode());
    const btn = document.getElementById('copy-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Embed Code'; }, 2000); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{
        width: 240,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--sidebar-border)',
        padding: '24px 16px',
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 20, paddingLeft: 8 }}>Loggix Admin</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { href: '/documents', label: 'Documents' },
            { href: '/tickets', label: 'Tickets' },
            { href: '/admin/widget', label: 'Widget Config', active: true },
          ].map(item => (
            <a key={item.href} href={item.href} style={{
              padding: '10px 12px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: 'none',
              color: item.active ? '#14B8A6' : '#94a3b8',
              background: item.active ? 'rgba(20,184,166,0.15)' : 'transparent',
              transition: 'all 0.2s',
            }}>{item.label}</a>
          ))}
        </nav>
      </div>

      <div style={{ flex: 1, padding: '32px 40px', maxWidth: 1200 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'white', marginBottom: 4 }}>Widget Configuration</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28 }}>Customize the embeddable chat widget appearance and behavior.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 16 }}>General</h3>

            <div className="form-group">
              <label>Title</label>
              <input type="text" value={config.title} onChange={e => update('title', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Greeting Message</label>
              <input type="text" value={config.greeting} onChange={e => update('greeting', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Position</label>
              <select value={config.position} onChange={e => update('position', e.target.value)}>
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '24px 0 16px' }}>Colors</h3>

            {[
              { key: 'primaryColor', label: 'Primary Color' },
              { key: 'primaryHover', label: 'Primary Hover' },
              { key: 'backgroundColor', label: 'Background Color' },
              { key: 'headerBg', label: 'Header Background' },
              { key: 'textColor', label: 'Text Color' },
              { key: 'botMessageBg', label: 'Bot Message Background' },
            ].map(({ key, label }) => (
              <div key={key} className="form-group">
                <label>{label}</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <input type="color" value={config[key].startsWith('#') ? config[key] : '#14B8A6'}
                    onChange={e => update(key, e.target.value)}
                    style={{ width: 42, height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                  <input type="text" value={config[key]}
                    onChange={e => update(key, e.target.value)}
                    style={{ flex: 1 }} />
                </div>
              </div>
            ))}

            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '24px 0 16px' }}>Icon</h3>
            <div className="form-group">
              <label>Custom SVG Icon (leave empty for default)</label>
              <textarea value={config.icon} onChange={e => update('icon', e.target.value)}
                placeholder="<svg viewBox=...>...</svg>" style={{ fontFamily: "'Courier New', monospace" }} />
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', margin: '24px 0 16px' }}>Voice</h3>
            <div className="form-group">
              <label>Vapi Assistant ID (auto-filled from your account)</label>
              <input type="text" value={config.vapiAssistant || ''} onChange={e => update('vapiAssistant', e.target.value)}
                placeholder="Assigned automatically at registration" />
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {saveStatus && (
                <span style={{ fontSize: 13, fontWeight: 500, color: saveStatus.type === 'saved' ? '#10b981' : '#ef4444' }}>
                  {saveStatus.text}
                </span>
              )}
            </div>
          </div>

          <div>
            <div style={{ background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 16 }}>Live Preview</h3>
              <div style={{
                width: '100%',
                height: 400,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                background: config.backgroundColor,
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute',
                  right: 20, bottom: 90,
                  width: 320, height: 340,
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: config.backgroundColor,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden', zIndex: 9,
                }}>
                  <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', background: config.headerBg }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: config.textColor }}>{config.title}</h4>
                  </div>
                  <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 12, lineHeight: 1.4,
                      alignSelf: 'flex-start', borderBottomLeftRadius: 4,
                      background: config.botMessageBg, color: config.textColor,
                    }}>{config.greeting}</div>
                    <div style={{
                      maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 12, lineHeight: 1.4,
                      alignSelf: 'flex-end', borderBottomRightRadius: 4, color: 'white',
                      background: config.primaryColor,
                    }}>I'd like to know about your services</div>
                    <div style={{
                      maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 12, lineHeight: 1.4,
                      alignSelf: 'flex-start', borderBottomLeftRadius: 4,
                      background: config.botMessageBg, color: config.textColor,
                    }}>We offer custom software development, AI solutions, and more!</div>
                  </div>
                  <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 6 }}>
                    <input type="text" placeholder="Type a message..." disabled style={{
                      flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: 12, outline: 'none',
                    }} />
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: config.primaryColor,
                    }}>
                      <svg viewBox="0 0 24 24" width={16} height={16} fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </div>
                  </div>
                </div>
                <button style={{
                  position: 'absolute', right: 20, bottom: 20,
                  width: 60, height: 60, borderRadius: '50%', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 20px ${config.primaryColor}66`, zIndex: 10,
                  background: `linear-gradient(135deg, ${config.primaryColor} 0%, ${config.primaryHover} 100%)`,
                }}>
                  <svg viewBox="0 0 24 24" width={28} height={28} fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                Preview reflects your current settings in real-time.
              </p>
            </div>

            <div style={{
              background: 'var(--glass)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: 16, marginTop: 24,
            }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                Embed Script — add to any website
              </div>
              <code style={{
                display: 'block', color: '#10b981', fontFamily: "'Courier New', monospace",
                fontSize: 12, wordBreak: 'break-all', lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {embedCode()}
              </code>
              <button id="copy-btn" onClick={copyEmbed} style={{
                marginTop: 8, padding: '6px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer',
              }}>Copy Embed Code</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

