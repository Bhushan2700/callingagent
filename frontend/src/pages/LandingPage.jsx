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
  return (
    <div>
      <div style={{
        minHeight: '90vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 2rem',
        position: 'relative',
        overflow: 'hidden',
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(0,97,255,0.12) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(0,97,255,0.06) 0%, transparent 50%)
        `,
      }}
        id="hero"
      >
        <div style={{ maxWidth: 800, textAlign: 'center', animation: 'fadeInUp 0.8s ease-out' }}>
          <div style={{
            display: 'inline-block',
            padding: '0.5rem 1.25rem',
            borderRadius: 20,
            background: 'rgba(0,97,255,0.15)',
            border: '1px solid rgba(0,97,255,0.3)',
            color: '#60a5fa',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
          }}>
            AI-Powered Voice & Chat Support
          </div>
          <h1 style={{
            fontSize: 'clamp(2.2rem, 5vw, 3.5rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            marginBottom: '1.5rem',
            background: 'linear-gradient(135deg, #fff 0%, #0061FF 50%, #60a5fa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Your AI Receptionist,<br />Always On
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
            <Link to="/voice" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '1rem 2rem',
                borderRadius: 14,
                border: 'none',
                background: 'linear-gradient(135deg, #0061FF, #0051d4)',
                color: 'white',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0,97,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                animation: 'pulse-glow 2s infinite',
              }}>
                Try Voice Agent <Mic size={18} />
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
              }}>
                Setup Guide
              </button>
            </Link>
          </div>
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
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,97,255,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: 'var(--brand-blue)',
                  marginBottom: '1rem',
                  opacity: 0.6,
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
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,97,255,0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{
                      width: 44, height: 44,
                      borderRadius: 12,
                      background: 'rgba(0,97,255,0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '1rem',
                    }}>
                      <Icon size={22} color="#0061FF" />
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
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,97,255,0.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{
                    width: 44, height: 44,
                    borderRadius: 12,
                    background: 'rgba(0,97,255,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={22} color="#0061FF" />
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
          background: 'rgba(0,97,255,0.05)',
          borderTop: '1px solid rgba(0,97,255,0.15)',
        }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '1rem' }}>
            Ready to Try It?
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '1.05rem', marginBottom: '2rem', maxWidth: 500, margin: '0 auto 2rem' }}>
            Hear the AI in action. No signup required.
          </p>
          <Link to="/voice" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '1rem 2.5rem',
              borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg, #0061FF, #0051d4)',
              color: 'white',
              fontWeight: 700,
              fontSize: '1.05rem',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(0,97,255,0.4)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              Launch Voice Agent <Mic size={18} />
            </button>
          </Link>
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
