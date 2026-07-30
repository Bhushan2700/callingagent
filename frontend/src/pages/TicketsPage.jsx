import { useState, useEffect, useRef } from 'react';
import StatCard from '../components/StatCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Loading from '../components/Loading.jsx';
import { getTickets, createTicket, getTicket, updateTicket } from '../api/tickets.js';

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [newStatus, setNewStatus] = useState('open');
  const [form, setForm] = useState({ name: '', email: '', phone: '', issue: '' });

  useEffect(() => { loadTickets(); }, []);

  useEffect(() => {
    const interval = setInterval(loadTickets, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadTickets() {
    setLoading(true);
    const data = await getTickets();
    setTickets(data);
    setLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    await createTicket(form);
    setCreateOpen(false);
    setForm({ name: '', email: '', phone: '', issue: '' });
    loadTickets();
  }

  async function openDetail(id) {
    const ticket = await getTicket(id);
    setCurrentTicket(ticket);
    setNewStatus(ticket.status);
    setDetailOpen(true);
  }

  async function handleStatusUpdate() {
    if (!currentTicket) return;
    await updateTicket(currentTicket.id, newStatus);
    setDetailOpen(false);
    loadTickets();
  }

  const stats = [
    { value: tickets.length, label: 'Total Tickets' },
    { value: tickets.filter(t => t.status === 'open').length, label: 'Open' },
    { value: tickets.filter(t => t.status === 'in_progress').length, label: 'In Progress' },
    { value: tickets.filter(t => t.status === 'closed').length, label: 'Closed' },
  ];

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Support Tickets
        </h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-ghost" onClick={loadTickets}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>+ New Ticket</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {stats.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      {loading ? <Loading text="Loading tickets..." /> : tickets.length === 0 ? (
        <EmptyState message="No support tickets yet" icon="📋" />
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {[...tickets].reverse().map(ticket => (
            <div key={ticket.id}
              onClick={() => openDetail(ticket.id)}
              style={{
                background: 'var(--glass)',
                backdropFilter: 'blur(20px)',
                border: '1px solid var(--glass-border)',
                borderRadius: 16,
                padding: '1.5rem',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-blue)'; e.currentTarget.style.background = 'var(--glass-hover)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.background = 'var(--glass)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--brand-blue)', background: 'rgba(0,97,255,0.1)', padding: '0.25rem 0.75rem', borderRadius: 20 }}>{ticket.id}</span>
                <StatusBadge status={ticket.status} />
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{ticket.name || 'Unknown'}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                {ticket.issue ? (ticket.issue.length > 120 ? ticket.issue.substring(0, 120) + '...' : ticket.issue) : 'No description'}
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>📧 {ticket.email || 'No email'}</span>
                <span>📱 {ticket.phone || 'No phone'}</span>
                <span>📅 {new Date(ticket.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Support Ticket">
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label>Name *</label>
            <input type="text" required placeholder="Customer name"
              value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" placeholder="customer@example.com"
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input type="text" placeholder="+31 6 12345678"
              value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Issue *</label>
            <textarea required placeholder="Describe the issue..."
              value={form.issue} onChange={e => setForm({ ...form, issue: e.target.value })} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Ticket</button>
          </div>
        </form>
      </Modal>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={currentTicket ? `Ticket ${currentTicket.id}` : ''}>
        {currentTicket && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <StatusBadge status={currentTicket.status} />
            </div>
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={currentTicket.name || ''} readOnly style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="text" value={currentTicket.email || ''} readOnly style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input type="text" value={currentTicket.phone || ''} readOnly style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label>Issue</label>
              <textarea readOnly style={{ opacity: 0.7 }} value={currentTicket.issue || ''} />
            </div>
            <div className="form-group">
              <label>Update Status</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                {['open', 'in_progress', 'closed'].map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Created</label>
              <input type="text" value={new Date(currentTicket.created_at).toLocaleString()} readOnly style={{ opacity: 0.7 }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDetailOpen(false)}>Close</button>
              <button className="btn btn-primary" onClick={handleStatusUpdate}>Update Status</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
