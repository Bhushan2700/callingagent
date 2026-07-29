const statusStyles = {
  open: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  in_progress: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  closed: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80', border: 'rgba(34,197,94,0.3)' },
};

export default function StatusBadge({ status }) {
  const s = statusStyles[status] || statusStyles.open;
  return (
    <span style={{
      padding: '0.25rem 0.75rem',
      borderRadius: 20,
      fontSize: '0.7rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {status?.replace('_', ' ')}
    </span>
  );
}
