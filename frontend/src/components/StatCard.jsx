export default function StatCard({ value, label, accent = 'purple' }) {
  const accents = {
    purple: { left: 'var(--brand-accent)', text: 'linear-gradient(135deg, #3B82F6 0%, #14B8A6 100%)', glow: 'rgba(20,184,166,0.3)' },
    gold: { left: '#F59E0B', text: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)', glow: 'rgba(245,158,11,0.3)' },
    fire: { left: '#EF4444', text: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)', glow: 'rgba(239,68,68,0.3)' },
    emerald: { left: '#10B981', text: 'linear-gradient(135deg, #34D399 0%, #10B981 100%)', glow: 'rgba(16,185,129,0.3)' },
  };
  const a = accents[accent] || accents.purple;

  return (
    <div style={{
      position: 'relative',
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 16,
      padding: '1.25rem 1.25rem 1.25rem 1.5rem',
      overflow: 'hidden',
      transition: 'all 0.3s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = a.left; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 10px 30px ${a.glow}` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: a.left,
      }} />
      <div style={{
        fontSize: '2rem',
        fontWeight: 800,
        background: a.text,
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