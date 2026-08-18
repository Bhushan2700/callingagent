import React, { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { getKnowledgeGaps, updateKnowledgeGap } from '../api/admin.js';
import EmptyState from '../components/EmptyState.jsx';

const STATUS_META = {
  new: { color: '#7FB800', label: 'New' },
  reviewing: { color: '#41808B', label: 'Reviewing' },
  resolved: { color: '#7FB800', label: 'Resolved' },
  ignored: { color: '#41808B', label: 'Ignored' },
};

export default function KnowledgeGapsPage() {
  const [data, setData] = useState({ gaps: [], total: 0 });
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 20;

  useEffect(() => {
    getKnowledgeGaps({ page, perPage, status }).then(setData).catch(() => setData({ gaps: [], total: 0 }));
  }, [page, status]);

  const changeStatus = async (id, next) => {
    try {
      await updateKnowledgeGap(id, next);
      setData(d => ({ ...d, gaps: d.gaps.map(g => g.id === id ? { ...g, status: next } : g) }));
    } catch { /* ignore */ }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Knowledge Gaps</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 1.25rem', fontSize: '0.9rem' }}>
        Questions the AI couldn't answer confidently. Add these to your knowledge base to improve resolution.
      </p>

      <div style={{ marginBottom: '1.25rem' }}>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={{ padding: '0.55rem 0.8rem', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.65)', color: '#41808B', fontSize: '0.85rem' }}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {data.gaps.length === 0 ? (
        <EmptyState text="No knowledge gaps yet — good sign!" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {data.gaps.map(g => {
            const meta = STATUS_META[g.status] || STATUS_META.new;
            return (
              <div key={g.id} style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                <Lightbulb size={17} color={meta.color} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', color: '#41808B', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.question}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    {g.occurrence_count} occurrence{g.occurrence_count === 1 ? '' : 's'} · confidence {g.confidence.toFixed(2)} · last seen {new Date(g.last_seen_at).toLocaleString()}
                    {g.call_id ? ' · from a call' : ''}
                  </div>
                </div>
                <span style={{ display: 'inline-flex', padding: '0.15rem 0.6rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: `${meta.color}1f`, color: meta.color, flexShrink: 0 }}>{meta.label}</span>
                {g.status === 'new' && (
                  <button onClick={() => changeStatus(g.id, 'reviewing')} style={actionStyle}>Mark reviewing</button>
                )}
                {g.status !== 'ignored' && g.status !== 'resolved' && (
                  <button onClick={() => changeStatus(g.id, 'resolved')} style={{ ...actionStyle, color: '#7FB800', borderColor: 'rgba(127,184,0,0.3)' }}>Resolve</button>
                )}
                {g.status !== 'ignored' && (
                  <button onClick={() => changeStatus(g.id, 'ignored')} style={{ ...actionStyle, color: '#57A3AF' }}>Ignore</button>
                )}
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

const actionStyle = { padding: '0.35rem 0.75rem', borderRadius: 8, border: '1px solid rgba(87,163,175,0.3)', background: 'transparent', color: '#41808B', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0 };
const pagerStyle = (disabled) => ({ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: disabled ? '#57A3AF' : '#41808B', cursor: disabled ? 'default' : 'pointer', fontSize: '0.8rem' });