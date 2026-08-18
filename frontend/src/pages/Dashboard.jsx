import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Calendar, MessageSquare, Mic, Users, BookOpen, CheckCircle2 } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getDashboard, getConversationDetail } from '../api/admin.js';
import { getPhoneNumbers } from '../api/vapi.js';
import StatCard from '../components/StatCard.jsx';
import ConversationModal from '../components/ConversationModal.jsx';
import { resolveLabel, RESOLUTION_LABELS, RESOLUTION_COLORS, INTENT_LABELS, fmtDate } from '../lib/labels.js';
import { getTenantName } from '../api/auth.js';

function pct(v) {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function chartTooltipStyle() {
  return {
    background: '#41808B',
    border: '1px solid rgba(65,128,139,0.2)',
    borderRadius: 10,
    fontSize: '0.8rem',
    color: '#ffffff',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };
}

function CallRow({ conv, onOpen }) {
  const caller = conv.id?.startsWith('call_') ? conv.summary || 'Phone call' : conv.summary || 'Conversation';
  const color = RESOLUTION_COLORS[conv.resolution_status] || '#41808B';
  return (
    <button
      onClick={() => onOpen(conv)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '0.55rem 0.7rem', borderRadius: 10, border: 'none',
        background: 'transparent', cursor: 'pointer', textAlign: 'left',
        color: 'var(--text-secondary)', fontSize: '0.82rem', transition: 'background 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(65,128,139,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#41808B', fontWeight: 600 }}>
        {caller || 'Recent call'}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', fontWeight: 700, color, textTransform: 'uppercase', background: `${color}1a`, padding: '0.12rem 0.45rem', borderRadius: 8, flexShrink: 0 }}>
        {resolveLabel(conv.resolution_status, RESOLUTION_LABELS)}
      </span>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', flexShrink: 0, minWidth: 108, textAlign: 'right' }}>
        {fmtDate(conv.created_at)}
      </span>
    </button>
  );
}

function ChartCard({ icon, color, title, children, height = 200 }) {
  return (
    <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.25rem 0.75rem' }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ color }}>{icon}</span> {title}
      </h3>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function ListCard({ icon, color, title, viewAllTo, empty, children }) {
  return (
    <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '1.1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color }}>{icon}</span> {title}
        </h3>
        {viewAllTo && <Link to={viewAllTo} style={{ fontSize: '0.75rem', color: '#41808B', textDecoration: 'none' }}>View all</Link>}
      </div>
      <div style={{ padding: '0.5rem 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 0.5rem', fontSize: '0.85rem' }}>{empty}</div>
        ) : children}
      </div>
    </div>
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
      <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', color: 'var(--text-muted)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{tenantName || 'Dashboard'}</h1>
        <p style={{ marginTop: '0.5rem' }}>Loading…</p>
      </div>
    );
  }

  const { kpis, trends, daily_calls: daily, recent_conversations: recent, upcoming_appointments: upcoming, intent_breakdown } = data;

  const intentData = Object.entries(intent_breakdown || {})
    .map(([k, v]) => ({ name: INTENT_LABELS[k] || k.replace(/_/g, ' '), count: v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const answeredCalls = kpis.total_calls - kpis.missed_calls;

  const insightDone = kpis.total_calls > 0;
  const insight = insightDone
    ? `Your AI receptionist handled ${answeredCalls} call${answeredCalls === 1 ? '' : 's'} and booked ${kpis.appointments_booked} appointment${kpis.appointments_booked === 1 ? '' : 's'} this period.`
    : 'No incoming calls yet — connect a phone number and share your number with customers.';

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            <span style={{ background: 'linear-gradient(135deg, #41808B 0%, #57A3AF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Welcome back{tenantName ? `, ${tenantName.split(' ')[0]}` : ''}
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
            {fmtDate(data.range.from)} → {fmtDate(data.range.to)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {phones.map(p => (
            <span key={p.id || p.number} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.8rem', borderRadius: 20, background: 'rgba(127,184,0,0.12)', border: '1px solid rgba(127,184,0,0.3)', color: '#7FB800', fontSize: '0.78rem', fontWeight: 600 }}>
              <Phone size={13} /> {p.number}
            </span>
          ))}
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '0.35rem 0.8rem', borderRadius: 8, border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
              background: days === d ? 'var(--brand-gradient)' : 'transparent', color: days === d ? '#fff' : '#57A3AF',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Insight line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.85rem 1.1rem', borderRadius: 12, background: 'rgba(87,163,175,0.07)', border: '1px solid rgba(87,163,175,0.2)', marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        <CheckCircle2 size={16} color="#7FB800" style={{ flexShrink: 0 }} />
        <span>{insight}</span>
        {!insightDone && (
          <Link to="/voice" style={{ marginLeft: 'auto', color: '#7FB800', textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem', flexShrink: 0 }}>
            Test voice agent →
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard value={kpis.total_calls} label="Calls Handled" accent="purple" delta={trends.total_calls} />
        <StatCard value={kpis.appointments_booked} label="Appointments Booked" accent="emerald" delta={trends.appointments_booked} />
        <StatCard value={pct(kpis.ai_resolution_rate)} label="AI Resolution Rate" accent="gold" delta={trends.ai_resolution_rate} />
        <StatCard value={kpis.missed_calls} label="Missed Calls" accent="rose" delta={trends.missed_calls} />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <ChartCard icon={<Phone size={14} />} color="#7FB800" title="Calls Over Time">
          {daily.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No calls in this period yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#57A3AF" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#57A3AF" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7FB800" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#7FB800" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(65,128,139,0.15)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 11, fill: '#41808B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#41808B' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle()} formatter={(v, name) => [v, name === 'ai_resolved' ? 'AI Resolved' : 'Calls']} />
                <Area type="monotone" dataKey="calls" stroke="#57A3AF" strokeWidth={2} fill="url(#callsGrad)" />
                <Area type="monotone" dataKey="ai_resolved" stroke="#7FB800" strokeWidth={2} fill="url(#resolvedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard icon={<MessageSquare size={14} />} color="#41808B" title="What Customers Ask">
          {intentData.length === 0 ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No conversations yet</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={intentData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(65,128,139,0.15)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#41808B' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#57A3AF' }} axisLine={false} tickLine={false} width={110} />
                <Tooltip contentStyle={chartTooltipStyle()} formatter={(v) => [v, 'Conversations']} />
                <Bar dataKey="count" fill="#57A3AF" radius={[0, 6, 6, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Lists */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <ListCard icon={<Users size={15} />} color="#41808B" title="Recent Calls & Conversations" viewAllTo="/calls" empty="No calls yet">
          {recent.map(c => <CallRow key={c.id} conv={c} onOpen={openConversation} />)}
        </ListCard>

        <ListCard icon={<Calendar size={15} />} color="#7FB800" title="Upcoming Appointments" viewAllTo="/appointments" empty="No upcoming appointments">
          {upcoming.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', padding: '0.55rem 0.7rem', color: 'var(--text-secondary)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#7FB800', flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#41808B', fontWeight: 600 }}>{a.customer_name || a.customer_email || 'Guest'}</span>
                {a.event_type && <span style={{ color: 'var(--text-muted)' }}> · {a.event_type}</span>}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', flexShrink: 0 }}>{fmtDate(a.start_time)}</span>
              {a.source === 'ai' && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7FB800', flexShrink: 0 }}>AI</span>}
            </div>
          ))}
        </ListCard>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <Link to="/documents" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1rem', borderRadius: 10, background: 'var(--brand-gradient)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 14px var(--brand-glow)' }}>
          <BookOpen size={15} /> Add Knowledge
        </Link>
        <Link to="/voice" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0.55rem 1rem', borderRadius: 10, border: '1px solid rgba(127,184,0,0.4)', background: 'rgba(87,163,175,0.1)', color: '#7FB800', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none' }}>
          <Mic size={15} /> Test Voice Agent
        </Link>
      </div>

      {modalConv && <ConversationModal conversation={modalConv} loading={modalLoading} onClose={() => setModalConv(null)} />}
    </div>
  );
}