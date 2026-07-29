import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/voice', label: 'Voice Agent' },
  { to: '/tickets', label: 'Tickets' },
  { to: '/documents', label: 'Documents' },
  { to: '/admin/widget', label: 'Widget Config' },
  { to: '/widget', label: 'Widget Demo' },
  { to: '/setup', label: 'Setup Guide' },
];

export default function Navbar() {
  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.75rem 2rem',
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--glass-border)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <NavLink to="/" style={{
        fontSize: '1.2rem',
        fontWeight: 800,
        background: 'linear-gradient(135deg, #fff 0%, var(--brand-blue) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        textDecoration: 'none',
      }}>
        Loggix AI
      </NavLink>
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            style={({ isActive }) => ({
              padding: '0.5rem 1rem',
              borderRadius: 10,
              fontSize: '0.85rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: isActive ? '#fff' : '#94a3b8',
              background: isActive ? 'var(--brand-blue)' : 'transparent',
              transition: 'all 0.3s',
              textDecoration: 'none',
            })}
          >
            {l.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
