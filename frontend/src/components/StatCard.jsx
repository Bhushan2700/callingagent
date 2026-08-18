import React from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

export default function StatCard({ value, label, accent = 'purple', delta = null }) {
  const accents = {
    purple: { left: 'var(--brand-accent)', text: 'linear-gradient(135deg, #57A3AF 0%, #7FB800 100%)', glow: 'rgba(87,163,175,0.3)' },
    gold: { left: '#7FB800', text: 'linear-gradient(135deg, #7FB800 0%, #7FB800 100%)', glow: 'rgba(127,184,0,0.3)' },
    fire: { left: '#F46036', text: 'linear-gradient(135deg, #F46036 0%, #F46036 100%)', glow: 'rgba(244,96,54,0.3)' },
    emerald: { left: '#7FB800', text: 'linear-gradient(135deg, #57A3AF 0%, #7FB800 100%)', glow: 'rgba(127,184,0,0.3)' },
    rose: { left: '#F46036', text: 'linear-gradient(135deg, #F46036 0%, #F46036 100%)', glow: 'rgba(244,96,54,0.3)' },
  };
  const a = accents[accent] || accents.purple;

  let deltaChip = null;
  if (delta !== null && delta !== undefined) {
    const up = delta > 0;
    const flat = delta === 0;
    const good = accent !== 'rose'; // rose = bad when rising
    deltaChip = (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: '0.68rem', fontWeight: 700,
        color: flat ? '#57A3AF' : (up === good ? '#7FB800' : '#F46036'),
        background: flat ? 'rgba(65,128,139,0.1)' : (up === good ? 'rgba(127,184,0,0.12)' : 'rgba(244,96,54,0.12)'),
        padding: '0.15rem 0.45rem', borderRadius: 8,
      }}>
        {flat ? <Minus size={11} /> : up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
        {Math.abs(delta) > 0.05 ? `${Math.abs(delta).toFixed(1)}%` : '0%'}
      </span>
    );
  }

  return (
    <div style={{
      position: 'relative',
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      border: '1px solid var(--glass-border)',
      borderRadius: 16,
      padding: '1.25rem 1.25rem 1.25rem 1.5rem',
      overflow: 'hidden',
      transition: 'all 0.3s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = a.left; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 10px 30px ${a.glow}` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: a.left,
      }} />
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1 }}>
        <span style={{
          background: a.text,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          {value}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: '0.35rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{label}</span>
        {deltaChip}
      </div>
    </div>
  );
}