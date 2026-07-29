export default function EmptyState({ message, icon = '📋' }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '4rem 2rem',
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 20,
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
      <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>{message}</p>
    </div>
  );
}
