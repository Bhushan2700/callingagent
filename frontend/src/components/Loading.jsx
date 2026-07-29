export default function Loading({ text = 'Loading...' }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
      {text}
    </div>
  );
}
