import React from 'react';
import { X, BookOpen, Wrench } from 'lucide-react';
import { resolveLabel, RESOLUTION_LABELS, RESOLUTION_COLORS, TOOL_LABELS, CHANNEL_LABELS, humanizeLabel } from '../lib/labels.js';

const ROLE_LABEL = { user: 'Caller', assistant: 'Assistant', tool: 'Tool' };
const ROLE_COLOR = { user: '#7FB800', assistant: '#57A3AF', tool: '#41808B' };

export default function ConversationModal({ conversation, onClose }) {
  if (!conversation) return null;

  const statusColor = RESOLUTION_COLORS[conversation.resolution_status] || '#41808B';
  const channelName = CHANNEL_LABELS[conversation.channel] || humanizeLabel(conversation.channel) || 'Conversation';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          background: 'var(--glass)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeInUp 0.3s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--glass-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 12px ${statusColor}`,
            }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {channelName}{conversation.summary ? ` — ${conversation.summary}` : ''}
            </h3>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
              padding: '0.15rem 0.5rem', borderRadius: 10,
              background: `${statusColor}1f`, color: statusColor,
            }}>
              {resolveLabel(conversation.resolution_status, RESOLUTION_LABELS) || 'Unknown'}
            </span>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--glass-border)',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{
          flex: 1, overflowY: 'auto', padding: '1.25rem',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          {conversation.messages && conversation.messages.length > 0 ? (
            conversation.messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{
                  flexShrink: 0, fontSize: '0.68rem', fontWeight: 700,
                  color: ROLE_COLOR[m.role] || '#57A3AF',
                  textTransform: 'uppercase', minWidth: 70, paddingTop: 3,
                }}>
                  {ROLE_LABEL[m.role] || m.role}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    color: 'var(--text-secondary)', fontSize: '0.86rem',
                    lineHeight: 1.5, wordBreak: 'break-word',
                  }}>
                    {m.content}
                  </span>
                  {(m.sources && m.sources.length > 0) && (
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {m.sources.map((s, j) => (
                        <span key={j} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: '0.7rem', color: '#41808B',
                        }}>
                          <BookOpen size={11} /> {s.document_name || s.document_id}
                          {s.section && <span>· {s.section}</span>}
                          {s.final_relevance && <span>· score {s.final_relevance}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {(m.tools_used && m.tools_used.length > 0) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: '#7FB800', marginTop: 3 }}>
                      <Wrench size={11} /> {m.tools_used.map(t => resolveLabel(t, TOOL_LABELS)).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
              No messages in this conversation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}