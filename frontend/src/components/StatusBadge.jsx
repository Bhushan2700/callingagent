const statusStyles = {
  open: { bg: 'rgba(87,163,175,0.15)', color: '#7FB800', border: 'rgba(87,163,175,0.3)' },
  in_progress: { bg: 'rgba(127,184,0,0.15)', color: '#7FB800', border: 'rgba(127,184,0,0.3)' },
  closed: { bg: 'rgba(127,184,0,0.15)', color: '#7FB800', border: 'rgba(127,184,0,0.3)' },
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
