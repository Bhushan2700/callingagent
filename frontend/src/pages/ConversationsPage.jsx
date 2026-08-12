import React, { useState, useEffect } from 'react';
import { MessageSquare, ChevronDown, ChevronUp, BookOpen, Wrench } from 'lucide-react';
import { getConversations, getConversationDetail } from '../api/admin.js';
import EmptyState from '../components/EmptyState.jsx';

const STATUS_META = {
  ai_resolved: { color: '#6ee7b7', label: 'AI Resolved' },
  appointment_completed: { color: '#5eead4', label: 'Appointment Booked' },
  ticket_created: { color: '#93c5fd', label: 'Ticket Created' },
  human_resolved: { color: '#fbbf24', label: 'Human Resolved' },
  escalated: { color: '#fbbf24', label: 'Escalated' },
  abandoned: { color: '#fca5a5', label: 'Abandoned' },
  unresolved: { color: '#f87171', label: 'Unresolved' },
};

export default function ConversationsPage() {
  const [data, setData] = useState({ conversations: [], total: 0 });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(false);
  const perPage = 20;

  useEffect(() => {
    getConversations({ page, perPage, status }).then(setData).catch(() => setData({ conversations: [], total: 0 }));
  }, [page, status]);

  const toggle = async (id) => {
    if (expanded === id) { setExpanded(null); setMessages(null); return; }
    setExpanded(id);
    setLoading(true);
    setMessages(null);
    try {
      const d = await getConversationDetail(id);
      setMessages(d.messages || []);
    } catch { setMessages([]); } finally { setLoading(false); }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));
  const roleColor = (r) => (r === 'assistant' ? '#5eead4' : r === 'tool' ? '#93c5fd' : '#fbbf24');
  const roleLabel = (r) => (r === 'assistant' ? 'Assistant' : r === 'tool' ? 'Tool' : 'Caller');

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Conversations</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 1.25rem', fontSize: '0.9rem' }}>{data.total} conversation{data.total === 1 ? '' : 's'}</p>

      <div style={{ marginBottom: '1.25rem' }}>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={{ padding: '0.55rem 0.8rem', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.03)', color: '#e2e8f0', fontSize: '0.85rem' }}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {data.conversations.length === 0 ? (
        <EmptyState text="No conversations yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {data.conversations.map(c => {
            const meta = STATUS_META[c.resolution_status] || { color: '#64748b', label: c.resolution_status || 'Unknown' };
            return (
              <div key={c.id} style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 14, overflow: 'hidden' }}>
                <button onClick={() => toggle(c.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
                  <MessageSquare size={15} color={meta.color} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.summary || `${c.channel} conversation · ${c.message_count} messages`}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(c.updated_at).toLocaleString()}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.15rem 0.6rem', borderRadius: 20, fontSize: '0.7rem', fontWeight: 600, background: `${meta.color}1f`, color: meta.color }}>{meta.label}</span>
                  {expanded === c.id ? <ChevronUp size={15} color="#94a3b8" /> : <ChevronDown size={15} color="#94a3b8" />}
                </button>
                {expanded === c.id && (
                  <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '0.7rem', maxHeight: 380, overflowY: 'auto' }}>
                    {loading ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading messages…</span>
                    ) : messages && messages.length > 0 ? messages.map((m, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <span style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, color: roleColor(m.role), textTransform: 'uppercase', minWidth: 70, paddingTop: 3 }}>{roleLabel(m.role)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{m.content}</span>
                          {(m.sources && m.sources.length > 0) && m.sources.map((s, j) => (
                            <span key={j} style={{ display: 'block', fontSize: '0.68rem', color: '#93c5fd', marginTop: 2 }}>
                              <BookOpen size={10} style={{ verticalAlign: -1 }} /> {s.document_name || s.document_id}{s.section ? ` · ${s.section}` : ''}
                            </span>
                          ))}
                          {(m.tools_used && m.tools_used.length > 0) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#5eead4', marginTop: 3 }}>
                              <Wrench size={10} /> {m.tools_used.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    )) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No messages stored.</span>
                    )}
                  </div>
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

function pagerStyle(disabled) {
  return { padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: disabled ? '#475569' : '#e2e8f0', cursor: disabled ? 'default' : 'pointer', fontSize: '0.8rem' };
}