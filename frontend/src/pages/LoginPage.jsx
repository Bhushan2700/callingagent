import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mic, MessageSquare, Calendar, ArrowRight } from 'lucide-react';
import { login } from '../api/auth.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const highlights = [
  { icon: Mic, text: 'AI voice agent that takes calls 24/7' },
  { icon: MessageSquare, text: 'Smart chat widget for your website' },
  { icon: Calendar, text: 'Automatic appointment booking' },
];

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'stretch' }}>
      <div style={{
        flex: 1,
        display: 'none',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '4rem',
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: `
radial-gradient(circle at 20% 30%, rgba(37,99,235,0.18) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(6,182,212,0.10) 0%, transparent 50%)
        `,
      }} className="auth-brand-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '3rem' }}>
          <div style={{
            width: 40, height: 40,
            borderRadius: 12,
            background: 'var(--brand-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem', fontWeight: 800, color: '#fff',
            boxShadow: '0 4px 15px var(--brand-glow)',
          }}>L</div>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Loggix AI</span>
        </div>
        <h2 style={{
          fontSize: '2.3rem', fontWeight: 800, lineHeight: 1.15, marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #fff 0%, #7dd3fc 60%, #14B8A6 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Your AI receptionist is one login away.
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '3rem' }}>
          Manage your voice agent, chat widget, tickets, and knowledge base from one dashboard.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {highlights.map((h, i) => {
            const Icon = h.icon;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(20,184,166,0.18))',
                  border: '1px solid rgba(20,184,166,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color="#2DD4BF" />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{h.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        <form onSubmit={handleSubmit} style={{
          width: 400,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}>
          <Link to="/" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to home
          </Link>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>Welcome Back</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sign in to manage your AI receptionist</p>
          </div>
          {error && <p style={{
            color: '#fca5a5', fontSize: '0.85rem', padding: '0.75rem 1rem',
            background: 'var(--error-bg)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)',
          }}>{error}</p>}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>Email</label>
            <input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: 12, border: '1px solid var(--glass-border)', background: 'var(--glass)', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.3s, box-shadow 0.3s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,184,166,0.15)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>Password</label>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required
              style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: 12, border: '1px solid var(--glass-border)', background: 'var(--glass)', color: '#fff', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.3s, box-shadow 0.3s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#2DD4BF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20,184,166,0.15)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none' }} />
          </div>
          <p style={{ margin: '0', textAlign: 'right', fontSize: '0.85rem' }}>
            <Link to="/forgot-password" style={{ color: 'var(--text-muted)' }}>Forgot password?</Link>
          </p>
          <button type="submit" disabled={busy} style={{
            padding: '1rem',
            borderRadius: 12,
            border: 'none',
            background: 'var(--brand-gradient)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            boxShadow: '0 4px 20px var(--brand-glow)',
            transition: 'transform 0.3s, box-shadow 0.3s',
          }}
            onMouseEnter={e => { if (!busy) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 26px var(--brand-glow)' } }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px var(--brand-glow)' }}
          >
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
          <p style={{ textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Don't have an account? <Link to="/register" style={{ color: '#2DD4BF', fontWeight: 600 }}>Create one free</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
