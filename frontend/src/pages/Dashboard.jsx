import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Ticket, FileText, Settings, Phone, PhoneIncoming, PhoneOutgoing, Globe, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { getTickets } from '../api/tickets.js';
import { getDocuments } from '../api/documents.js';
import { getOnboardingStatus } from '../api/onboarding.js';
import { getCalls, getCallDetail, getPhoneNumbers } from '../api/vapi.js';
import StatCard from '../components/StatCard.jsx';
import { getTenantName } from '../api/auth.js';

function fmtDuration(start, end) {
  if (!start) return '—';
  const ms = (end ? new Date(end) : Date.now()) - new Date(start);
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

function fmtCost(call) {
  const costs = call.costs || [];
  const total = costs.reduce((s, c) => s + (c.cost || 0), 0);
  return total > 0 ? `$${total.toFixed(2)}` : '—';
}

function getTranscript(messages) {
  return (messages || [])
    .filter(m => m.role === 'user' || m.role === 'bot')
    .map(m => ({ role: m.role, text: m.message }))
    .filter(m => m.text);
}

function fmtTotalDuration(calls) {
  const totalMs = calls.reduce((s, c) => {
    if (!c.startedAt) return s;
    return s + ((new Date(c.endedAt || Date.now())) - new Date(c.startedAt));
  }, 0);
  if (totalMs <= 0) return '0m 00s';
  const s = Math.floor(totalMs / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

export default function Dashboard() {
  const [tickets, setTickets] = useState([]);
  const [docs, setDocs] = useState([]);
  const [agent, setAgent] = useState(null);
  const [calls, setCalls] = useState([]);
  const [phones, setPhones] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [loadingCall, setLoadingCall] = useState(false);
  const tenantName = getTenantName();

  useEffect(() => {
    getTickets().then(setTickets).catch(() => {});
    getDocuments().then(setDocs).catch(() => {});
    getOnboardingStatus().then(setAgent).catch(() => {});
    getCalls().then(d => setCalls(d.calls || [])).catch(() => {});
    getPhoneNumbers().then(d => setPhones(d.phones || [])).catch(() => {});
  }, []);

  const totalCost = calls.reduce((s, c) => {
    return s + (c.costs || []).reduce((x, cost) => x + (cost.cost || 0), 0);
  }, 0);

  const toggleExpand = async (call) => {
    if (expanded === call.id) {
      setExpanded(null);
      setTranscript(null);
      return;
    }
    setExpanded(call.id);
    setLoadingCall(true);
    setTranscript(null);
    try {
      const d = await getCallDetail(call.id);
      setTranscript(getTranscript(d?.call?.messages));
    } catch {
      setTranscript(null);
    } finally {
      setLoadingCall(false);
    }
  };

  const displayPhones = phones.length > 0 ? phones : (agent?.phone_number ? [{ number: agent.phone_number, provider: 'vapi', status: null }] : []);

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {tenantName || 'Dashboard'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Loggix AI Receptionist Console
        </p>
      </div>

      {agent && (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {displayPhones.length > 0 ? displayPhones.map(p => (
            <span key={p.id || p.number} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: 20, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: '0.8rem', fontWeight: 600 }}>
              <Phone size={13} /> {p.number}
              {p.status && (
                <span style={{ marginLeft: 4, padding: '0.1rem 0.5rem', borderRadius: 10, fontSize: '0.7rem', background: p.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: p.status === 'active' ? '#6ee7b7' : '#fbbf24' }}>
                  {p.status}
                </span>
              )}
              {p.provider && <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 500, textTransform: 'capitalize' }}>{p.provider}</span>}
            </span>
          )) : (
            <Link to="/onboarding" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: 20, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}>
              <Phone size={13} /> No phone number — finish setup
            </Link>
          )}
          {agent.assistant_id ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: 20, background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.3)', color: '#5eead4', fontSize: '0.8rem', fontWeight: 600 }}>
              <Mic size={13} /> Voice assistant active
            </span>
          ) : (
            <Link to="/onboarding" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: 20, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}>
              <Mic size={13} /> Assistant not set up
            </Link>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard value={calls.length} label="Total Calls" accent="purple" />
        <StatCard value={totalCost > 0 ? `$${totalCost.toFixed(2)}` : '$0.00'} label="Calls Cost" accent="gold" />
        <StatCard value={fmtTotalDuration(calls)} label="Total Time" accent="fire" />
        <StatCard value={tickets.filter(t => t.status === 'open').length} label="Open Tickets" accent="gold" />
        <StatCard value={docs.reduce((s, d) => s + (d.chunk_count || 0), 0)} label="Knowledge Chunks" accent="emerald" />
      </div>

      <div style={{
        background: 'var(--glass)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--glass-border)',
        borderRadius: 16,
        marginBottom: '2rem',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} color="#5eead4" /> Call Logs
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From Vapi</span>
        </div>

        {calls.length === 0 ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No calls yet. Once your assistant handles calls, the logs will appear here.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1.5rem' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>When</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Duration</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Cost</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1.5rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {calls.map(call => {
                  const typeMap = { inboundPhoneCall: { Icon: PhoneIncoming, color: '#6ee7b7', label: 'Inbound' }, outboundPhoneCall: { Icon: PhoneOutgoing, color: '#fbbf24', label: 'Outbound' }, webCall: { Icon: Globe, color: '#93c5fd', label: 'Web' } };
                  const t = typeMap[call.type] || { Icon: Phone, color: '#94a3b8', label: call.type || 'Call' };
                  const Icon = t.Icon;
                  const inProgress = call.status === 'in-progress' || call.status === 'queued' || call.status === 'ringing';
                  return (
                    <React.Fragment key={call.id}>
                      <tr style={{ borderTop: '1px solid var(--glass-border)' }}>
                        <td style={{ padding: '0.75rem 1.5rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.color }}>
                            <Icon size={15} /> {t.label}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
                          {new Date(call.startedAt || call.createdAt || call.id).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{fmtDuration(call.startedAt, call.endedAt)}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{fmtCost(call)}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.15rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: inProgress ? 'rgba(245,158,11,0.12)' : call.status === 'ended' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: inProgress ? '#fbbf24' : call.status === 'ended' ? '#6ee7b7' : '#fca5a5' }}>
                            {inProgress ? 'In Progress' : call.status === 'ended' ? 'Ended' : (call.status || 'Unknown')}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>
                          <button onClick={() => toggleExpand(call)} style={{ background: 'none', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', borderRadius: 8, padding: '0.35rem 0.8rem', cursor: 'pointer', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {expanded === call.id ? 'Close' : 'Transcript'} {expanded === call.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </td>
                      </tr>
                      {expanded === call.id && (
                        <tr>
                          <td colSpan={6} style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.15)' }}>
                            {loadingCall ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading transcript...</span>
                            ) : transcript && transcript.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                                {transcript.map((m, i) => (
                                  <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <span style={{ flexShrink: 0, fontSize: '0.7rem', fontWeight: 700, color: m.role === 'user' ? '#fbbf24' : '#5eead4', textTransform: 'uppercase', minWidth: 70 }}>{m.role === 'user' ? 'Caller' : 'Assistant'}</span>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>{m.text}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transcript available for this call.</span>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {[
          { to: '/voice', title: 'Voice Agent', desc: 'AI-powered voice support calls', icon: Mic },
          { to: '/tickets', title: 'Support Tickets', desc: 'Manage customer inquiries', icon: Ticket },
          { to: '/documents', title: 'Documents', desc: 'Upload & manage knowledge base', icon: FileText },
          { to: '/admin/widget', title: 'Widget Config', desc: 'Customize the chat widget', icon: Settings },
        ].map(item => {
          const Icon = item.icon;
          return (
          <Link key={item.to} to={item.to} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--glass)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 16,
              padding: '1.5rem',
              transition: 'all 0.3s',
              cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(37,99,235,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, marginBottom: '0.75rem',
                background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(20,184,166,0.18))',
                border: '1px solid rgba(20,184,166,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={22} color="#5eead4" />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{item.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{item.desc}</p>
            </div>
          </Link>
          );
        })}
      </div>
    </div>
  );
}