import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const nav = useNavigate();

  const steps = [
    {
      title: 'Your AI Receptionist is Ready!',
      desc: 'Your account has been created. We\'ve set up a dedicated AI voice assistant for your business.',
      icon: '🎉',
    },
    {
      title: '1. Upload Your Knowledge',
      desc: 'Go to Documents and upload your business info, FAQs, or any PDFs. The AI learns from them instantly.',
      icon: '📄',
    },
    {
      title: '2. Configure Your Widget',
      desc: 'Customize the chat widget colors, greeting, and position in Widget Config. Then copy the embed code to your website.',
      icon: '⚙️',
    },
    {
      title: '3. Test Your Voice Agent',
      desc: 'Visit the Voice Agent page to test your AI phone agent. It uses your knowledge base to answer customer calls.',
      icon: '🎙️',
    },
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      nav('/dashboard');
    }
  };

  const s = steps[step];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{
        background: 'var(--glass)',
        border: '1px solid var(--glass-border)',
        borderRadius: 30,
        padding: '3rem',
        width: 500,
        maxWidth: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>{s.icon}</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>{s.title}</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '2rem' }}>{s.desc}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: 10, height: 10,
              borderRadius: '50%',
              background: i === step ? 'var(--brand-blue)' : 'var(--glass-border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
        <button onClick={handleNext} style={{
          padding: '1rem 2rem',
          borderRadius: 14,
          border: 'none',
          background: 'var(--brand-blue)',
          color: '#fff',
          fontWeight: 700,
          fontSize: '1rem',
          cursor: 'pointer',
        }}>
          {step < steps.length - 1 ? 'Next' : 'Go to Dashboard'}
        </button>
      </div>
    </div>
  );
}
