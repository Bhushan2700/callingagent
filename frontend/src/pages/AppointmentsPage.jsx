import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { getAppointments } from '../api/admin.js';
import EmptyState from '../components/EmptyState.jsx';
import { resolveLabel, SOURCE_LABELS, APPT_STATUS_LABELS } from '../lib/labels.js';

export default function AppointmentsPage() {
  const [data, setData] = useState({ appointments: [], total: 0 });
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 50;

  useEffect(() => {
    getAppointments({ page, perPage, status, source }).then(setData).catch(() => setData({ appointments: [], total: 0 }));
  }, [page, status, source]);

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));
  const statusColor = (s) => ({ confirmed: '#7FB800', cancelled: '#F46036', pending: '#7FB800' }[s] || '#57A3AF');

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Appointments</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 1.25rem', fontSize: '0.9rem' }}>
        {data.total} appointment{data.total === 1 ? '' : 's'} · Cal.com is the source of truth; AI-booked ones are tracked locally
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All sources</option>
          <option value="ai">AI Booked</option>
          <option value="dashboard">Dashboard</option>
          <option value="external">External</option>
        </select>
      </div>

      {data.appointments.length === 0 ? (
        <EmptyState text="No appointments yet." />
      ) : (
        <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1.25rem' }}>Customer</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Start</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Topic</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Source</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem 1.25rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.appointments.map(a => (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '0.75rem 1.25rem', color: '#41808B', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Calendar size={14} color="#7FB800" /> {a.customer_name || a.customer_email || 'Unknown'}</span>
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>{a.start_time ? new Date(a.start_time).toLocaleString() : '—'}</td>
                    <td style={{ padding: '0.75rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.event_type || '—'}</td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: a.source === 'ai' ? '#7FB800' : '#57A3AF' }}>{resolveLabel(a.source, SOURCE_LABELS)}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1.25rem' }}>
                      <span style={{ display: 'inline-flex', padding: '0.15rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: `${statusColor(a.status)}1f`, color: statusColor(a.status) }}>
                        {resolveLabel(a.status, APPT_STATUS_LABELS)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={pagerStyle(page <= 1)}>Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={pagerStyle(page >= totalPages)}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const selectStyle = { padding: '0.55rem 0.8rem', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.65)', color: '#41808B', fontSize: '0.85rem' };
const pagerStyle = (disabled) => ({ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: disabled ? '#57A3AF' : '#41808B', cursor: disabled ? 'default' : 'pointer', fontSize: '0.8rem' });