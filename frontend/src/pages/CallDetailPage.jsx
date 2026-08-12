import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Phone, FileText, Wrench, BookOpen } from 'lucide-react';
import { getCallDetail } from '../api/admin.js';

export default function CallDetailPage() {
  const { callId } = useParams();
  const [call, setCall] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCallDetail(callId).then(setCall).catch(e => setError(e.message));
  }, [callId]);

  if (error) return <div style={{ padding: '2rem', color: '#fca5a5' }}>{error}</div>;
  if (!call) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading call…</div>;

  const msgRole = (r) => (r === 'assistant' ? 'Assistant' : r === 'tool' ? 'Tool call' : 'Caller');
  const msgColor = (r) => (r === 'assistant' ? '#5eead4' : r === 'tool' ? '#93c5fd' : '#fbbf24');

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto', width: '100%' }}>
      <Link to="/calls" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1rem' }}>
        <ChevronLeft size={15} /> Back to calls
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <Phone size={20} color="#5eead4" />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{call.caller || call.phone || 'Unknown caller'}</h1>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        {call.started_at ? new Date(call.started_at).toLocaleString() : ''}
        {call.duration_seconds ? ` · ${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s` : ''}
        {call.resolution_status ? ` · ${call.resolution_status.replace('_', ' ')}` : ''}
      </p>

      {call.summary && (
        <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <strong style={{ color: '#e2e8f0' }}>Summary: </strong>{call.summary}
        </div>
      )}

      <div style={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--glass-border)', fontWeight: 700, fontSize: '0.95rem' }}>Transcript ({call.messages?.length || 0})</div>
        {(!call.messages || call.messages.length === 0) ? (
          <div style={{ padding: '2rem 1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transcript stored for this call.</div>
        ) : (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 480, overflowY: 'auto' }}>
            {call.messages.map((m, i) => {
              const isTool = m.role === 'tool';
              let content = m.content;
              let extra = null;
              if (isTool) {
                try {
                  const t = JSON.parse(m.content);
                  content = `${t.tool || 'tool'}(${JSON.stringify(t.arguments || {})})`;
                } catch { /* keep raw */ }
              }
              return (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, color: msgColor(m.role), textTransform: 'uppercase', minWidth: 74, paddingTop: 3 }}>{msgRole(m.role)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.5, wordBreak: 'break-word' }}>{content}</span>
                    {(m.sources && m.sources.length > 0) && (
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {m.sources.map((s, j) => (
                          <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#93c5fd' }}>
                            <BookOpen size={11} /> {s.document_name || s.document_id} {s.section ? `· ${s.section}` : ''} {s.final_relevance ? `· score ${s.final_relevance}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {(m.tools_used && m.tools_used.length > 0) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#5eead4', marginTop: 3 }}>
                        <Wrench size={11} /> {m.tools_used.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {call.resolution_status && (
        <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <FileText size={15} color="#94a3b8" />
          Resolved: <strong style={{ color: '#e2e8f0', textTransform: 'capitalize' }}>{call.resolution_status.replace('_', ' ')}</strong>
          {call.resolved_by && <span style={{ color: 'var(--text-muted)' }}>· by {call.resolved_by}</span>}
          {call.resolution_reason && <span style={{ color: 'var(--text-muted)' }}>· {call.resolution_reason}</span>}
        </div>
      )}
    </div>
  );
}