import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../../api/superAdmin.js';

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 12,
  border: '1px solid rgba(65,128,139,0.25)',
  background: 'rgba(255,255,255,0.65)',
  color: '#41808B',
  fontSize: '14px',
  outline: 'none',
};

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: '#57A3AF', marginBottom: 6 };
const cardStyle = { background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 24, padding: '2.5rem', width: 420, maxWidth: '100%' };

export default function AdminLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('nik68199@gmail.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginAdmin(email, password);
      nav('/super-admin/phone-requests', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 1.5rem', background: 'linear-gradient(135deg, #41808B 0%, #7FB800 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(87,163,175,0.4)' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>SA</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Super Admin Login</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Phone request management panel</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={labelStyle}>Email</label>
            <input type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="nik68199@gmail.com" required />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={labelStyle}>Password</label>
            <input type="password" style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
          </div>
          {error && <p style={{ color: '#F46036', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', padding: '0.75rem 1.5rem', borderRadius: 12, fontWeight: 700, fontSize: '14px' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}