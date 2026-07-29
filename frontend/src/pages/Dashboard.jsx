import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTickets } from '../api/tickets.js';
import { getDocuments } from '../api/documents.js';
import StatCard from '../components/StatCard.jsx';

export default function Dashboard() {
  const [tickets, setTickets] = useState([]);
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    getTickets().then(setTickets).catch(() => {});
    getDocuments().then(setDocs).catch(() => {});
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Loggix AI Receptionist Console
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard value={tickets.length} label="Total Tickets" />
        <StatCard value={tickets.filter(t => t.status === 'open').length} label="Open" />
        <StatCard value={docs.length} label="Documents" />
        <StatCard value={docs.reduce((s, d) => s + (d.chunk_count || 0), 0)} label="Total Chunks" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {[
          { to: '/voice', title: 'Voice Agent', desc: 'AI-powered voice support calls', icon: '🎙️' },
          { to: '/tickets', title: 'Support Tickets', desc: 'Manage customer inquiries', icon: '🎫' },
          { to: '/documents', title: 'Documents', desc: 'Upload & manage knowledge base', icon: '📄' },
          { to: '/admin/widget', title: 'Widget Config', desc: 'Customize the chat widget', icon: '⚙️' },
        ].map(item => (
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
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{item.icon}</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{item.title}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
