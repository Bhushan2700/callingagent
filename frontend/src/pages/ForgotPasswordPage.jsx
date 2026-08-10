import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MailCheck } from 'lucide-react';
import { forgotPassword } from '../api/auth.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await forgotPassword(email);
      setSent(true);
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
          Reset your password in seconds.
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '3rem' }}>
          We'll email you a one-time code. Enter it with your new password and you're back in.
        </p>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        {sent ? (
          <div style={{ width: 400, maxWidth: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              width: 56, height: 56, margin: '0 auto', borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(20,184,166,0.2))',
              border: '1px solid rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MailCheck size={26} color="#34D399" />
            </div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Check your email</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              If an account exists for <span style={{ color: '#fff', fontWeight: 600 }}>{email}</span>, a one-time code has been sent. The code expires in 15 minutes.
            </p>
            <Link to="/reset-password" style={{
              marginTop: '0.5rem', padding: '1rem', borderRadius: 12, textAlign: 'center',
              background: 'var(--brand-gradient)', color: '#fff', fontWeight: 700, fontSize: '1rem',
              textDecoration: 'none', boxShadow: '0 4px 20px var(--brand-glow)',
            }}>Enter the code</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ width: 400, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <Link to="/login" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to sign in
            </Link>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>Forgot Password</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Enter your account email to receive a reset code</p>
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
            <button type="submit" disabled={busy} style={{
              padding: '1rem', borderRadius: 12, border: 'none',
              background: 'var(--brand-gradient)', color: '#fff', fontWeight: 700, fontSize: '1rem',
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
              boxShadow: '0 4px 20px var(--brand-glow)', transition: 'transform 0.3s, box-shadow 0.3s',
            }}
              onMouseEnter={e => { if (!busy) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 26px var(--brand-glow)' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px var(--brand-glow)' }}
            >
              {busy ? 'Sending...' : 'Send Reset Code'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}