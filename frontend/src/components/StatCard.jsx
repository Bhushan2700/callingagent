export default function StatCard({ value, label }) {
  return (
    <div style={{
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 16,
      padding: '1.25rem',
      transition: 'all 0.3s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{
        fontSize: '2rem',
        fontWeight: 800,
        background: 'linear-gradient(135deg, var(--brand-blue) 0%, #60a5fa 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        {value}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
        {label}
      </div>
    </div>
  );
}
