import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LogOut, Users, Phone, Settings } from 'lucide-react';

const sidebarStyle = {
  width: 240,
  background: 'var(--glass)',
  borderRight: '1px solid var(--glass-border)',
  minHeight: '100vh',
  padding: '1.5rem 1rem',
  display: 'flex',
  flexDirection: 'column',
};

const mainStyle = {
  flex: 1,
  padding: '2rem 3rem',
  background: 'var(--bg)',
  minHeight: '100vh',
};

const logoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 0.5rem 1.5rem',
  borderBottom: '1px solid var(--glass-border)',
  marginBottom: '1rem',
};

const navItemStyle = (active) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '0.75rem 1rem',
  borderRadius: 12,
  color: active ? '#7FB800' : '#41808B',
  background: active ? 'rgba(127,184,0,0.12)' : 'transparent',
  fontWeight: 600,
  fontSize: '14px',
  textDecoration: 'none',
  border: '1px solid',
  borderColor: active ? 'rgba(127,184,0,0.3)' : 'transparent',
  marginBottom: 6,
  transition: 'all 0.2s',
});

export default function AdminLayout() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('loggix_admin_token');
    if (!token) {
      window.location.href = '/super-admin/login';
    } else {
      setAuthed(true);
    }
    setChecking(false);
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--glass-border)', borderTopColor: '#7FB800', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!authed) return null;

  const handleLogout = () => {
    localStorage.removeItem('loggix_admin_token');
    window.location.href = '/super-admin/login';
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={sidebarStyle}>
        <div style={logoStyle}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #41808B 0%, #7FB800 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(87,163,175,0.4)' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>SA</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#41808B' }}>Super Admin</span>
        </div>
        <nav>
          <a href="/super-admin/phone-requests" style={navItemStyle(location.pathname === '/super-admin/phone-requests')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            Phone Requests
          </a>
          <a href="/super-admin/tenants" style={navItemStyle(location.pathname === '/super-admin/tenants')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            Tenants
          </a>
          <a href="/super-admin/settings" style={navItemStyle(location.pathname === '/super-admin/settings')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 1 4.6 9a1.65 1.65 0 0 1 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 1-.33 1.82V15a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 1 1.51-1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 1-1.51 1z"></path></svg>
            Settings
          </a>
        </nav>
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
          <button onClick={() => { localStorage.removeItem('loggix_admin_token'); window.location.href = '/super-admin/login'; }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0.75rem 1rem', borderRadius: 12, background: 'transparent', border: '1px solid var(--glass-border)', color: '#F46036', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            Sign Out
          </button>
        </div>
      </aside>
      <main style={mainStyle}>
        <Outlet />
      </main>
    </div>
  );
}