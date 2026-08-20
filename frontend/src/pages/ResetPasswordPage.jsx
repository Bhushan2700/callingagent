import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mic, MessageSquare, Calendar, ArrowRight, ArrowLeft, ShieldCheck, Zap, Mail } from 'lucide-react';
import { resetPassword, resendOtp, forgotPassword, sendOtpEmail } from '../api/auth.js';

const highlights = [
  { icon: ShieldCheck, text: 'Secure, one-time reset codes' },
  { icon: Zap, text: 'Back in — in under a minute' },
  { icon: Calendar, text: 'Your AI receptionist, ready 24/7' },
];

const inputStyle = {
  width: '100%', padding: '0.9rem 1.1rem', borderRadius: 12,
  border: '1px solid var(--glass-border)', background: 'var(--glass)',
  color: '#41808B', fontSize: '0.95rem', outline: 'none',
  transition: 'border-color 0.3s, box-shadow 0.3s',
};
const focusProps = {
  onFocus: e => { e.currentTarget.style.borderColor = '#7FB800'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(87,163,175,0.15)'; },
  onBlur: e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.boxShadow = 'none'; },
};
const labelStyle = { display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 };

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') || '');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(45);
  const [canResend, setCanResend] = useState(false);
  const nav = useNavigate();
  const otpRefs = useRef([]);

  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (otpRefs.current[0]) otpRefs.current[0].focus();
  }, []);

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!paste) return;
    const next = [...otp];
    for (let i = 0; i < 6; i++) next[i] = paste[i] || '';
    setOtp(next);
    otpRefs.current[Math.min(paste.length, 5)]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const code = otp.join('');
    if (code.length !== 6) { setError('Please enter the 6-digit code'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      await resetPassword(email, code, password);
      setSuccess(true);
      setTimeout(() => nav('/login'), 1800);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setCanResend(false);
    setCountdown(45);
    try {
      const res = await resendOtp(email);
      if (res.otp) await sendOtpEmail(res.name, email, res.otp);
    } catch (err) {
      if (err.message.includes('No verification')) {
        const res = await forgotPassword(email);
        if (res.otp) await sendOtpEmail(res.name, email, res.otp);
      } else {
        setError(err.message);
        setCanResend(true);
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'stretch' }}>
      <div style={{
        flex: 1, display: 'none', flexDirection: 'column', justifyContent: 'center',
        padding: '4rem', position: 'relative', overflow: 'hidden',
        backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(87,163,175,0.18) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(87,163,175,0.10) 0%, transparent 50%)',
      }} className="auth-brand-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '3rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--brand-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem', fontWeight: 800, color: '#fff',
            boxShadow: '0 4px 15px var(--brand-glow)',
          }}>L</div>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Loggix AI</span>
        </div>
        <h2 style={{
          fontSize: '2.3rem', fontWeight: 800, lineHeight: 1.15, marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, #41808B 0%, #57A3AF 60%, #7FB800 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Set a new password.</h2>
        <p style={{ color: '#57A3AF', fontSize: '1.05rem', lineHeight: 1.6, marginBottom: '3rem' }}>
          Enter the code we emailed you, then choose a fresh password.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {highlights.map((h, i) => {
            const Icon = h.icon;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(87,163,175,0.18), rgba(87,163,175,0.18))',
                  border: '1px solid rgba(87,163,175,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color="#7FB800" />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{h.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <Link to="/login" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to sign in
          </Link>

          {success ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem 0' }}>
              <div style={{
                width: 56, height: 56, margin: '0 auto', borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(127,184,0,0.2), rgba(87,163,175,0.2))',
                border: '1px solid rgba(127,184,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ShieldCheck size={26} color="#7FB800" />
              </div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Password updated!</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Redirecting you to sign in...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem' }}>Reset Password</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Enter the 6-digit code and your new password</p>
              </div>
              {error && <p style={{
                color: '#F46036', fontSize: '0.85rem', padding: '0.75rem 1rem',
                background: 'var(--error-bg)', borderRadius: 10, border: '1px solid rgba(244,96,54,0.25)',
              }}>{error}</p>}
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required
                  style={inputStyle} {...focusProps} />
              </div>
              <div>
                <label style={labelStyle}>Verification Code</label>
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => otpRefs.current[i] = el}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      style={{
                        width: 52, height: 60, borderRadius: 12,
                        border: `2px solid ${digit ? '#7FB800' : 'var(--glass-border)'}`,
                        background: 'var(--glass)', color: '#41808B',
                        fontSize: '1.5rem', fontWeight: 700, textAlign: 'center',
                        outline: 'none', transition: 'border-color 0.2s',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#7FB800'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = digit ? '#7FB800' : 'var(--glass-border)'; }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>New Password</label>
                <input type="password" autocomplete="new-password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  style={inputStyle} {...focusProps} />
              </div>
              <div>
                <label style={labelStyle}>Confirm Password</label>
                <input type="password" autocomplete="new-password" placeholder="Repeat your new password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                  style={inputStyle} {...focusProps} />
              </div>
              <button type="submit" disabled={busy} style={{
                padding: '1rem', borderRadius: 12, border: 'none',
                background: 'var(--brand-gradient)', color: '#fff', fontWeight: 700,
                fontSize: '1rem', cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1, boxShadow: '0 4px 20px var(--brand-glow)',
                transition: 'transform 0.3s, box-shadow 0.3s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              }}
                onMouseEnter={e => { if (!busy) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 26px var(--brand-glow)'; } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px var(--brand-glow)'; }}
              >
                {busy ? 'Resetting...' : 'Reset Password'} <Mail size={16} />
              </button>
              <p style={{ textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                {countdown > 0 ? (
                  <>Resend code in {countdown}s</>
                ) : (
                  <button type="button" onClick={handleResend}
                    style={{ background: 'none', border: 'none', color: '#7FB800', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem', padding: 0 }}>
                    Resend code
                  </button>
                )}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}