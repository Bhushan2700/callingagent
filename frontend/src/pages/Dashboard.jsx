import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Calendar, AlertTriangle, MessageSquare, Mic, Clock } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getDashboard, getConversationDetail } from '../api/admin.js';
import { getPhoneNumbers } from '../api/vapi.js';
import StatCard from '../components/StatCard.jsx';
import ConversationModal from '../components/ConversationModal.jsx';
import { getTenantName } from '../api/auth.js';

function fmtDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function pct(v) {
  if (v === null || v === undefined) return null;
  return `${(v * 100).toFixed(1)}%`;
}

const INTENT_LABELS = {
  appointment_booking: 'Appointments',
  refund_policy: 'Refunds',
  pricing: 'Pricing',
  support: 'Support',
  business_hours: 'Hours',
  shipping: 'Shipping',
  general: 'General',
};

const RESOLUTION_LABELS = {
  ai_resolved: 'AI Resolved',
  appointment_completed: 'Appointment',
  ticket_created: 'Ticket',
  human_resolved: 'Human',
  escalated: 'Escalated',
  abandoned: 'Abandoned',
  unresolved: 'Unresolved',
};

const RESOLUTION_COLORS = {
  ai_resolved: '#34d399', appointment_completed: '#2dd4bf', ticket_created: '#60a5fa',
  human_resolved: '#fbbf24', escalated: '#f59e0b', abandoned: '#fb7185', unresolved: '#f87171',
};

const RES_STATUS_ORDER = ['ai_resolved', 'appointment_completed', 'ticket_created', 'human_resolved', 'abandoned', 'unresolved'];

function chartTooltipStyle() {
  return {
    background: '#0f172a',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: 10,
    fontSize: '0.8rem',
    color: '#e2e8f0',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };
}

function ConversationItem({ conv, onOpen }) {
  const label = conv.summary
    || (conv.channel === 'phone' ? 'Voice call' : 'Conversation');
  return (
    <button
      onClick={() => onOpen(conv)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '0.5rem 0.6rem', borderRadius: 10, border: 'none',
        background: 'transparent', cursor: 'pointer', textAlign: 'left',
        color: 'var(--text-secondary)', fontSize: '0.82rem',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 4, background: RESOLUTION_COLORS[conv.resolution_status] || '#64748b', flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', flexShrink: 0 }}>
        {new Date(conv.created_at).toLocaleDateString()} {new Date(conv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </button>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [phones, setPhones] = useState([]);
  const [days, setDays] = useState(7);
  const [modalConv, setModalConv] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const tenantName = getTenantName();

  useEffect(() => {
    getDashboard('', '', days).then(setData).catch(() => setData(null));
    getPhoneNumbers().then(d => setPhones(d.phones || [])).catch(() => {});
  }, [days]);

  const openConversation = async (conv) => {
    setModalLoading(true);
    setModalConv({ ...conv, messages: null });
    try {
      const d = await getConversationDetail(conv.id);
      setModalConv({ ...conv, messages: d.messages || [] });
    } catch {
      setModalConv({ ...conv, messages: [] });
    } finally {
      setModalLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="page-scroll" style={{ maxWidth: 1200, margin: '0 auto', color: 'var(--text-muted)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{tenantName || 'Dashboard'}</h1>
        <p style={{ marginTop: '0.5rem' }}>Loading command center…</p>
      </div>
    );
  }

  const { kpis, daily_calls: daily, recent_conversations: recent, upcoming_appointments: upcoming, needs_attention: attention, knowledge_gaps_new, intent_breakdown, resolution_breakdown } = data;

  const intentData = Object.entries(intent_breakdown || {})
    .map(([k, v]) => ({ name: INTENT_LABELS[k] || k.replace(/_/g, ' '), count: v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const resolutionData = RES_STATUS_ORDER
    .filter(k => (resolution_breakdown || {})[k])
    .map(k => ({ name: RESOLUTION_LABELS[k] || k, count: resolution_breakdown[k], fill: RESOLUTION_COLORS[k] }));

  return (
    <div className="page-scroll" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {tenantName || 'Dashboard'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
            {new Date(data.range.from).toLocaleDateString()} → {new Date(data.range.to).toLocaleDateString()}
            {knowledge_gaps_new > 0 && <span style={{ color: '#fbbf24' }}> · {knowledge_gaps_new} knowledge gap{knowledge_gaps_new === 1 ? '' : 's'} open</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {phones.map(p => (
            <span key={p.id || p.number} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.8rem', borderRadius: 20, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: '0.78rem', fontWeight: 600 }}>
              <Phone size={13} /> {p.number}
            </span>
          ))}
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '0.35rem 0.8rem', borderRadius: 8, border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
              background: days === d ? 'var(--brand-gradient)' : 'transparent', color: days === d ? '#fff' : '#94a3b8',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard value={kpis.total_calls} label="Total Calls" accent="purple" />
        <StatCard value={pct(kpis.ai_resolution_rate)} label="AI Resolution Rate" accent="emerald" />
        <StatCard value={fmtDuration(kpis.avg_duration_seconds)} label="Avg Call Time" accent="gold" />
        <StatCard value={kpis.appointments_booked} label="Appointments Booked" accent="fire" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.25rem 0.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={15} color="#5eead4" /> Calls Over Time
          </h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle()} formatter={(v, n) => [v, n === 'ai_resolved' ? 'AI Resolved' : n === 'calls' ? 'Calls' : n]} />
                <Area type="monotone" dataKey="calls" stroke="#14b8a6" strokeWidth={2} fill="url(#callsGrad)" />
                <Area type="monotone" dataKey="ai_resolved" stroke="#3b82f6" strokeWidth={2} fill="url(#resolvedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.25rem 0.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={15} color="#93c5fd" /> Conversation Topics
          </h3>
          {intentData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No conversation topics yet
            </div>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={intentData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#cbd5e1' }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={chartTooltipStyle()} />
                  <Bar dataKey="count" name="Messages" fill="#60a5fa" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.25rem 0.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={15} color="#34d399" /> Call Outcomes
          </h3>
          {resolutionData.length === 0 ? (
            <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No call outcomes yet
            </div>
          ) : (
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resolutionData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#cbd5e1' }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={chartTooltipStyle()} />
                  <Bar dataKey="count" name="Calls" radius={[0, 6, 6, 0]} maxBarSize={16}>
                    {resolutionData.map(d => <Bar fill={d.fill} key={d.name} dataKey="count" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageSquare size={15} color="#93c5fd" /> Recent Conversations
            </h3>
            <Link to="/calls" style={{ fontSize: '0.75rem', color: '#93c5fd', textDecoration: 'none' }}>View all</Link>
          </div>
          <div className="scroll-list" style={{ maxHeight: 220, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {recent.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No conversations yet</div>
            ) : (
              recent.map(c => <ConversationItem key={c.id} conv={c} onOpen={openConversation} />)
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={15} color="#fbbf24" /> Needs Attention
            </h3>
            <Link to="/knowledge-gaps" style={{ fontSize: '0.75rem', color: '#93c5fd', textDecoration: 'none' }}>View all</Link>
          </div>
          <div className="scroll-list" style={{ maxHeight: 220, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {attention.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>All clear</div>
            ) : (
              attention.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', padding: '0.5rem 0.6rem' }}>
                  <span style={{ flexShrink: 0, fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: a.type === 'knowledge_gap' ? '#fbbf24' : '#fca5a5', minWidth: 86 }}>
                    {a.type === 'knowledge_gap' ? 'Knowledge Gap' : 'Unresolved Call'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.title}>{a.title}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={15} color="#fbbf24" /> Upcoming Appointments
            </h3>
          </div>
          <div className="scroll-list" style={{ maxHeight: 220, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {upcoming.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No upcoming appointments</div>
            ) : (
              upcoming.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', padding: '0.5rem 0.6rem', color: 'var(--text-secondary)' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.customer_name || a.customer_email}
                    {a.event_type && <span style={{ color: 'var(--text-muted)' }}> · {a.event_type}</span>}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', flexShrink: 0 }}>
                    {new Date(a.start_time).toLocaleDateString()} {new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {a.source === 'ai' && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#5eead4' }}>AI</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <Link to="/documents" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1rem', borderRadius: 10, background: 'var(--brand-gradient)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 14px var(--brand-glow)' }}>Upload Document</Link>
        <Link to="/voice" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1rem', borderRadius: 10, border: '1px solid rgba(94,234,212,0.4)', background: 'rgba(20,184,166,0.1)', color: '#5eead4', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}><Mic size={15} /> Test Voice Agent</Link>
      </div>

      {modalConv && <ConversationModal conversation={modalConv} loading={modalLoading} onClose={() => setModalConv(null)} />}
    </div>
  );
}