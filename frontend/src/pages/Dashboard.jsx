import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Phone, Calendar, AlertTriangle, MessageSquare, Clock, TrendingDown, TrendingUp } from 'lucide-react';
import { getDashboard } from '../api/admin.js';
import { getPhoneNumbers } from '../api/vapi.js';
import StatCard from '../components/StatCard.jsx';
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

function Trend({ value, goodWhenUp = true }) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  const good = up === goodWhenUp;
  const color = good ? '#6ee7b7' : '#fca5a5';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem', fontWeight: 600, color }}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {Math.abs(value * 100).toFixed(0)}%
    </span>
  );
}

const RESOLUTION_COLORS = {
  ai_resolved: '#6ee7b7', appointment_completed: '#5eead4', ticket_created: '#93c5fd',
  human_resolved: '#fbbf24', escalated: '#fbbf24', abandoned: '#fca5a5', unresolved: '#fca5a5',
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [phones, setPhones] = useState([]);
  const [days, setDays] = useState(7);
  const tenantName = getTenantName();

  useEffect(() => {
    getDashboard('', '', days).then(setData).catch(() => setData(null));
    getPhoneNumbers().then(d => setPhones(d.phones || [])).catch(() => {});
  }, [days]);

  if (!data) {
    return (
      <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%', color: 'var(--text-muted)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>{tenantName || 'Dashboard'}</h1>
        <p style={{ marginTop: 0, fontSize: '1rem' }}>Loading command center…</p>
      </div>
    );
  }

  const { kpis, trends, daily_calls: daily, recent_conversations: recent, upcoming_appointments: upcoming, needs_attention: attention, knowledge_gaps_new } = data;
  const maxDaily = Math.max(1, ...daily.map(d => d.calls));

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{tenantName || 'Dashboard'}</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {data.range.from} → {data.range.to} · <span style={{ color: knowledge_gaps_new > 0 ? '#fbbf24' : 'inherit' }}>{knowledge_gaps_new} knowledge gap{knowledge_gaps_new === 1 ? '' : 's'} open</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '0.4rem 0.9rem', borderRadius: 8, border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              background: days === d ? 'var(--brand-gradient)' : 'transparent', color: days === d ? '#fff' : '#94a3b8',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {phones.map(p => (
          <span key={p.id || p.number} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: 20, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', fontSize: '0.8rem', fontWeight: 600 }}>
            <Phone size={13} /> {p.number}
          </span>
        ))}
        <Link to="/voice" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.9rem', borderRadius: 20, background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.3)', color: '#5eead4', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none' }}>
          <Mic size={13} /> Voice Control Center
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard value={kpis.total_calls} label={<span>Calls <Trend value={trends.total_calls} /></span>} accent="purple" />
        <StatCard value={pct(kpis.ai_resolution_rate)} label={<span>AI Resolution <Trend value={trends.ai_resolution_rate} /></span>} accent="emerald" />
        <StatCard value={fmtDuration(kpis.avg_duration_seconds)} label="Avg Call Time" accent="gold" />
        <StatCard value={kpis.appointments_booked} label={<span>Appointments <Trend value={trends.appointments_booked} /></span>} accent="fire" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={15} color="#5eead4" /> Calls per day
          </h3>
          {daily.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No calls in this range yet.</p> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {daily.map(d => (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.calls}</span>
                  <div style={{ width: '100%', maxWidth: 34, height: Math.max(4, (d.calls / maxDaily) * 90), borderRadius: '6px 6px 0 0', background: 'linear-gradient(180deg, #14b8a6, #2563eb)', opacity: 0.85 }} title={`${d.date}: ${d.calls} calls (${d.ai_resolved} AI-resolved)`} />
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={15} color="#fbbf24" /> Needs attention
          </h3>
          {attention.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>All clear.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 180, overflowY: 'auto' }}>
              {attention.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  <span style={{ flexShrink: 0, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: a.type === 'knowledge_gap' ? '#fbbf24' : '#fca5a5', minWidth: 92 }}>{a.type.replace('_', ' ')}</span>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.title}>{a.title}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.7rem' }}>{a.meta}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={15} color="#93c5fd" /> Recent conversations
          </h3>
          {recent.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No conversations yet.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {recent.map(c => (
                <Link key={c.id} to={`/conversations/${c.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: RESOLUTION_COLORS[c.resolution_status] || '#64748b', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.summary || c.id.slice(0, 24)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{new Date(c.created_at).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={15} color="#fbbf24" /> Upcoming appointments
          </h3>
          {upcoming.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No upcoming appointments.</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {upcoming.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span style={{ flex: 1 }}>{a.customer_name || a.customer_email} {a.event_type && <span style={{ color: 'var(--text-muted)' }}>· {a.event_type}</span>}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{new Date(a.start_time).toLocaleString()}</span>
                  {a.source === 'ai' && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#5eead4', textTransform: 'uppercase' }}>AI</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}