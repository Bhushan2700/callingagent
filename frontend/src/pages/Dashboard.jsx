import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mic, Ticket, FileText, Settings } from 'lucide-react';
import { getTickets } from '../api/tickets.js';
import { getDocuments } from '../api/documents.js';
import StatCard from '../components/StatCard.jsx';
import { getTenantName } from '../api/auth.js';

export default function Dashboard() {
  const [tickets, setTickets] = useState([]);
  const [docs, setDocs] = useState([]);
  const tenantName = getTenantName();

  useEffect(() => {
    getTickets().then(setTickets).catch(() => {});
    getDocuments().then(setDocs).catch(() => {});
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {tenantName || 'Dashboard'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Loggix AI Receptionist Console
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard value={tickets.length} label="Total Tickets" accent="purple" />
        <StatCard value={tickets.filter(t => t.status === 'open').length} label="Open" accent="gold" />
        <StatCard value={docs.length} label="Documents" accent="fire" />
        <StatCard value={docs.reduce((s, d) => s + (d.chunk_count || 0), 0)} label="Total Chunks" accent="emerald" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {[
          { to: '/voice', title: 'Voice Agent', desc: 'AI-powered voice support calls', icon: Mic },
          { to: '/tickets', title: 'Support Tickets', desc: 'Manage customer inquiries', icon: Ticket },
          { to: '/documents', title: 'Documents', desc: 'Upload & manage knowledge base', icon: FileText },
          { to: '/admin/widget', title: 'Widget Config', desc: 'Customize the chat widget', icon: Settings },
        ].map(item => {
          const Icon = item.icon;
          return (
          <Link key={item.to} to={item.to} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--glass)',
              backdropFilter: 'blur(20px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 16,
              padding: '1.5rem',
              transition: 'all 0.3s',
              cursor: 'pointer',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(139,92,246,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, marginBottom: '0.75rem',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.2))',
                border: '1px solid rgba(139,92,246,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={22} color="#c084fc" />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{item.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{item.desc}</p>
            </div>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
