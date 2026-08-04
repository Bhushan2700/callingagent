import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

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
  const { user, logoutUser } = useAuth();
  const nav = useNavigate();

  const handleLogout = () => {
    logoutUser();
    nav('/');
  };

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
        background: 'linear-gradient(135deg, #fff 0%, var(--brand-accent) 100%)',
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
        alignItems: 'center',
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
              background: isActive ? 'var(--brand-gradient)' : 'transparent',
              boxShadow: isActive ? '0 4px 12px var(--brand-glow)' : 'none',
              transition: 'all 0.3s',
              textDecoration: 'none',
            })}
          >
            {l.label}
          </NavLink>
        ))}
        {user && (
          <>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>{user.name}</span>
            <button onClick={handleLogout} style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '0.8rem',
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-hover)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
            >
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
