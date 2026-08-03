import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { loginUser } = useAuth();
  const nav = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await login(email, password);
      loginUser(data.token, data.tenant_id, data.name, data.email, data.assistant_id);
      nav('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--glass)',
        border: '1px solid var(--glass-border)',
        borderRadius: 30,
        padding: '3rem',
        width: 400,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>Welcome Back</h1>
        {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
          style={{ padding: '1rem', borderRadius: 14, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.95rem' }} />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required
          style={{ padding: '1rem', borderRadius: 14, border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.95rem' }} />
        <button type="submit" disabled={busy} style={{
          padding: '1rem',
          borderRadius: 14,
          border: 'none',
          background: 'var(--brand-blue)',
          color: '#fff',
          fontWeight: 700,
          fontSize: '1rem',
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}>
          {busy ? 'Signing in...' : 'Sign In'}
        </button>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Don't have an account? <Link to="/register" style={{ color: 'var(--brand-blue)' }}>Register</Link>
        </p>
      </form>
    </div>
  );
}
