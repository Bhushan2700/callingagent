import { Link } from 'react-router-dom';
import { MessageSquare, Mic, Database, Calendar, Ticket, Cpu, ArrowRight, Globe, Building2, ShoppingCart, Stethoscope, Scale, ChevronDown } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';

function RevealOnScroll({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (el) obs.observe(el);
    return () => { if (el) obs.unobserve(el); };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(30px)',
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

const heroPhrases = [
  'Your AI Receptionist, Always On',
  'Answer Every Call Instantly',
  'Never Miss a Customer Again',
  '24/7 AI Support, Zero Wait Time',
];

function useTypewriter(phrases) {
  const [text, setText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = phrases[phraseIndex];
    let timeout;

    if (!deleting && text === current) {
      timeout = setTimeout(() => setDeleting(true), 2200);
    } else if (deleting && text === '') {
      setDeleting(false);
      setPhraseIndex((i) => (i + 1) % phrases.length);
    } else {
      timeout = setTimeout(() => {
        setText(deleting
          ? current.slice(0, text.length - 1)
          : current.slice(0, text.length + 1));
      }, deleting ? 35 : 75);
    }
    return () => clearTimeout(timeout);
  }, [text, deleting, phraseIndex, phrases]);

  return text;
}

const features = [
  { icon: Mic, title: 'AI Voice Agent', desc: 'Natural voice conversations powered by Vapi.ai. Handles calls 24/7 with human-like responses.' },
  { icon: MessageSquare, title: 'Chat Widget', desc: 'Embeddable widget for your website. Text and voice support with real-time AI responses.' },
  { icon: Database, title: 'RAG Knowledge Base', desc: 'Upload your docs, FAQs, policies. The AI uses them to give accurate, context-aware answers.' },
  { icon: Calendar, title: 'Appointment Booking', desc: 'Integrates with Cal.com for seamless scheduling. Clients book in seconds.' },
  { icon: Ticket, title: 'Support Tickets', desc: 'Auto-generated tickets from calls and chats. Track, manage, and resolve issues.' },
  { icon: Cpu, title: 'Customizable', desc: 'Match your brand colors, greeting, and tone. Configure everything from a dashboard.' },
];

const useCases = [
  { icon: Building2, title: 'Real Estate', desc: 'Handle property inquiries, schedule viewings, qualify leads automatically.' },
  { icon: Stethoscope, title: 'Healthcare', desc: 'Book appointments, answer FAQs, provide patient info 24/7.' },
  { icon: ShoppingCart, title: 'E-commerce', desc: 'Order status, return inquiries, product questions — automated.' },
  { icon: Scale, title: 'Legal Firms', desc: 'Initial consultation scheduling, case status updates, client intake.' },
  { icon: Globe, title: 'Hospitality', desc: 'Booking management, concierge service, guest inquiries around the clock.' },
  { icon: Building2, title: 'SaaS Companies', desc: 'Customer support, onboarding assistance, feature explanations.' },
];

export default function LandingPage() {
  const typedText = useTypewriter(heroPhrases);

  return (
    <div>
      <nav style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 2.5rem',
        background: 'rgba(2,6,23,0.7)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 34, height: 34,
            borderRadius: 10,
            background: 'var(--brand-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', fontWeight: 800, color: '#fff',
            boxShadow: '0 4px 15px var(--brand-glow)',
          }}>L</div>
          <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.5px' }}>Loggix AI</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '0.55rem 1.4rem',
              borderRadius: 12,
              border: '1px solid var(--glass-border)',
              background: 'var(--glass)',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-hover)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--glass)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              Login
            </button>
          </Link>
          <Link to="/register" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '0.55rem 1.4rem',
              borderRadius: 12,
              border: 'none',
              background: 'var(--brand-gradient)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 4px 16px var(--brand-glow)',
              transition: 'all 0.3s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px var(--brand-glow)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px var(--brand-glow)' }}
            >
              Sign Up Free
            </button>
          </Link>
        </div>
      </nav>

      <div style={{
        minHeight: '90vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6rem 2rem 4rem',
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(37,99,235,0.16) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(6,182,212,0.12) 0%, transparent 50%)
        `,
      }}
        id="hero"
      >
        <div style={{ maxWidth: 800, textAlign: 'center', animation: 'fadeInUp 0.8s ease-out' }}>
          <div style={{
            display: 'inline-block',
            padding: '0.5rem 1.25rem',
            borderRadius: 20,
            background: 'rgba(20,184,166,0.12)',
            border: '1px solid rgba(20,184,166,0.3)',
            color: '#5eead4',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
          }}>
            AI-Powered Voice &amp; Chat Support
          </div>
          <h1 style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: '1.5rem',
            minHeight: '3.8em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            background: 'linear-gradient(135deg, #fff 0%, #7dd3fc 50%, #2DD4BF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            {typedText}
            <span style={{
              WebkitTextFillColor: '#2DD4BF',
              animation: 'blink 1s step-end infinite',
              marginLeft: '2px',
            }}>|</span>
          </h1>
          <p style={{
            fontSize: '1.2rem',
            color: '#94a3b8',
            lineHeight: 1.6,
            marginBottom: '2.5rem',
            maxWidth: 600,
            margin: '0 auto 2.5rem',
          }}>
            Never miss a lead or support request. Loggix AI handles voice calls, live chat, 
            and appointment booking — powered by your own knowledge base.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '1rem 2rem',
                borderRadius: 14,
                border: 'none',
                background: 'var(--brand-gradient)',
                color: 'white',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 4px 24px var(--brand-glow)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                animation: 'pulse-glow 2.5s infinite',
                transition: 'transform 0.3s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)' }}
              >
                Get Started Free <ArrowRight size={18} />
              </button>
            </Link>
            <Link to="/setup" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '1rem 2rem',
                borderRadius: 14,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass)',
                color: 'white',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <Mic size={18} /> Try Voice Agent
              </button>
            </Link>
          </div>
          <p style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--brand-accent)', fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
        <div style={{ position: 'absolute', bottom: '2rem', left: 0, right: 0, textAlign: 'center' }}>
          <ChevronDown size={32} color="#64748b" style={{ animation: 'bounce 2s infinite' }} />
        </div>
      </div>

      <RevealOnScroll>
        <div style={{ padding: '5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>How It Works</h2>
            <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: 600, margin: '0 auto' }}>
              Get your AI receptionist running in minutes. Three simple steps.
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '2rem',
          }}>
            {[
              { step: '01', title: 'Upload Your Knowledge', desc: 'Add your docs, FAQs, policies, and service info. The AI learns everything about your business.' },
              { step: '02', title: 'Configure & Customize', desc: 'Set your widget colors, greeting message, and voice agent settings from the dashboard.' },
              { step: '03', title: 'Embed & Go Live', desc: 'Copy one script tag into your website. Your AI receptionist is live — handling calls and chat.' },
            ].map((item, i) => (
              <div key={i} style={{
                background: 'var(--glass)',
                border: '1px solid var(--glass-border)',
                borderRadius: 20,
                padding: '2rem',
                textAlign: 'center',
                transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                transitionDelay: `${i * 0.1}s`,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-accent)'; e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(37,99,235,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: 'var(--brand-accent)',
                  marginBottom: '1rem',
                  opacity: 0.8,
                }}>
                  {item.step}
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.75rem' }}>{item.title}</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll delay={0.1}>
        <div style={{ padding: '5rem 2rem', background: 'var(--glass)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Everything You Need</h2>
              <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: 600, margin: '0 auto' }}>
                A complete AI receptionist platform — no piecemeal integrations.
              </p>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1.5rem',
            }}>
              {features.map((feat, i) => {
                const Icon = feat.icon;
                return (
                  <div key={i} style={{
                    background: 'var(--bg-dark)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 16,
                    padding: '1.75rem',
                    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transitionDelay: `${i * 0.05}s`,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-accent)'; e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(37,99,235,0.18)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{
                      width: 44, height: 44,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(37,99,235,0.18))',
                      border: '1px solid rgba(37,99,235,0.18)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '1rem',
                    }}>
                      <Icon size={22} color="#5eead4" />
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{feat.title}</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6 }}>{feat.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll delay={0.2}>
        <div style={{ padding: '5rem 2rem', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>Who It's For</h2>
            <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: 600, margin: '0 auto' }}>
              Perfect for any business that wants to automate front-desk operations.
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.5rem',
          }}>
            {useCases.map((uc, i) => {
              const Icon = uc.icon;
              return (
                <div key={i} style={{
                  background: 'var(--glass)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 16,
                  padding: '1.75rem',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transitionDelay: `${i * 0.05}s`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-accent)'; e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(6,182,212,0.18)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{
                    width: 44, height: 44,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(37,99,235,0.18), rgba(37,99,235,0.18))',
                    border: '1px solid rgba(37,99,235,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={22} color="#5eead4" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.3rem' }}>{uc.title}</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.88rem', lineHeight: 1.5 }}>{uc.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </RevealOnScroll>

      <RevealOnScroll delay={0.1}>
        <div style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          background: 'rgba(6,182,212,0.08)',
          borderTop: '1px solid rgba(6,182,212,0.18)',
        }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '1rem' }}>
            Ready to Try It?
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '1.05rem', marginBottom: '2rem', maxWidth: 500, margin: '0 auto 2rem' }}>
            Set up your AI receptionist in minutes. Start free.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '1rem 2.5rem',
                borderRadius: 14,
                border: 'none',
                background: 'var(--brand-gradient)',
                color: 'white',
                fontWeight: 700,
                fontSize: '1.05rem',
                cursor: 'pointer',
                boxShadow: '0 4px 24px var(--brand-glow)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                Sign Up Free <ArrowRight size={18} />
              </button>
            </Link>
            <Link to="/voice" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '1rem 2.5rem',
                borderRadius: 14,
                border: '1px solid var(--glass-border)',
                background: 'var(--glass)',
                color: 'white',
                fontWeight: 700,
                fontSize: '1.05rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <Mic size={18} /> Launch Voice Agent
              </button>
            </Link>
          </div>
        </div>
      </RevealOnScroll>

      <div style={{
        padding: '2rem',
        borderTop: '1px solid var(--glass-border)',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.85rem',
      }}>
        Loggix AI Receptionist &copy; {new Date().getFullYear()} Loggix. All rights reserved.
      </div>
    </div>
  );
}

