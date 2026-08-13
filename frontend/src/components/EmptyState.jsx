import { Inbox } from 'lucide-react';

export default function EmptyState({ message, text, icon = <Inbox size={48} strokeWidth={1.5} /> }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '4rem 2rem',
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 20,
      color: 'var(--text-muted)',
    }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', opacity: 0.7 }}>{icon}</div>
      <p style={{ fontSize: '1rem' }}>{message ?? text}</p>
    </div>
  );
}