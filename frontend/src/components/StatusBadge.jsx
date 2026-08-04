const statusStyles = {
  open: { bg: 'rgba(168,85,247,0.15)', color: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  in_progress: { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  closed: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', border: 'rgba(16,185,129,0.3)' },
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
