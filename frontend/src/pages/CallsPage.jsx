import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Phone, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { getCalls } from '../api/admin.js';
import EmptyState from '../components/EmptyState.jsx';

const RESOLUTION_META = {
  ai_resolved: { color: '#6ee7b7', label: 'AI Resolved' },
  appointment_completed: { color: '#5eead4', label: 'Appointment Booked' },
  ticket_created: { color: '#93c5fd', label: 'Ticket Created' },
  human_resolved: { color: '#fbbf24', label: 'Human Resolved' },
  escalated: { color: '#fbbf24', label: 'Escalated' },
  abandoned: { color: '#fca5a5', label: 'Abandoned' },
  unresolved: { color: '#f87171', label: 'Unresolved' },
};

function fmtDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export default function CallsPage() {
  const [data, setData] = useState({ calls: [], total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const perPage = 20;

  useEffect(() => {
    getCalls({ page, perPage, status, search }).then(setData).catch(() => setData({ calls: [], total: 0 }));
  }, [page, status, search]);

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Call History</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 1.5rem', fontSize: '0.9rem' }}>
        {data.total} call{data.total === 1 ? '' : 's'} · stored locally from Vapi end-of-call reports
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 360 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search caller, phone, summary…"
            style={{ width: '100%', padding: '0.55rem 0.8rem 0.55rem 2.4rem', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none' }}
          />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={{ padding: '0.55rem 0.8rem', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: '0.85rem' }}>
          <option value="">All statuses</option>
          {Object.entries(RESOLUTION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {data.calls.length === 0 ? (
        <EmptyState text={search || status ? 'No calls match your filters.' : 'No calls yet. When the assistant handles calls, they appear here.'} />
      ) : (
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1.25rem' }}>Caller</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>When</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Duration</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Resolution</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1.25rem' }}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {data.calls.map(c => {
                  const r = RESOLUTION_META[c.resolution_status] || { color: '#64748b', label: c.resolution_status || 'Unknown' };
                  return (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '0.75rem 1.25rem' }}>
                        <Link to={`/calls/${c.id}`} style={{ color: '#e2e8f0', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                          <Phone size={14} color={r.color} /> {c.caller || c.phone || 'Unknown caller'}
                        </Link>
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{c.started_at ? new Date(c.started_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{fmtDuration(c.duration_seconds)}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.15rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: `${r.color}1f`, color: r.color }}>
                          {r.label}
                          {c.resolved_by === 'ai' && <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>AI</span>}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.summary || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: page <= 1 ? '#475569' : '#e2e8f0', cursor: page <= 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}><ChevronLeft size={14} /> Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: page >= totalPages ? '#475569' : '#e2e8f0', cursor: page >= totalPages ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>Next <ChevronRight size={14} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}