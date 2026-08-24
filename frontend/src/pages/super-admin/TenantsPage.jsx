import { useEffect, useState } from 'react';
import { Loader2, Search, Trash2, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { getTenants, deleteTenant } from '../../api/superAdmin.js';

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };
const thStyle = { textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 700, color: '#57A3AF', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--glass-border)' };
const tdStyle = { padding: '1rem', borderBottom: '1px solid var(--glass-border)', color: '#41808B' };

const buttonStyle = (primary, danger) => ({
  padding: '0.5rem 1rem', borderRadius: 8, fontWeight: 600, fontSize: '12px', cursor: 'pointer',
  background: danger ? 'rgba(244,96,54,0.9)' : primary ? 'linear-gradient(135deg, #7FB800 0%, #57A3AF 100%)' : 'var(--glass)',
  color: primary || danger ? '#fff' : '#41808B',
  border: primary ? 'none' : '1px solid var(--glass-border)',
});

const cardStyle = { background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.5rem' };

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const data = await getTenants();
      setTenants(data.tenants || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = tenants.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.company_name || '').toLowerCase().includes(q)
      || (t.name || '').toLowerCase().includes(q)
      || (t.email || '').toLowerCase().includes(q);
  });

  const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const handleDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(confirmTarget.id);
    try {
      await deleteTenant(confirmTarget.id);
      setTenants(prev => prev.filter(t => t.id !== confirmTarget.id));
      setConfirmTarget(null);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAllIncomplete = async () => {
    setDeletingAll(true);
    try {
      const targets = tenants.filter(t => !t.onboarding_complete);
      for (const t of targets) {
        await deleteTenant(t.id);
      }
      await loadTenants();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setDeletingAll(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 size={32} color="#7FB800" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#41808B', marginBottom: '0.25rem' }}>Users</h1>
          <p style={{ color: '#57A3AF', fontSize: '0.9rem' }}>All registered users — deleting removes all their data</p>
        </div>
        <button
          onClick={handleDeleteAllIncomplete}
          disabled={deletingAll || tenants.filter(t => !t.onboarding_complete).length === 0}
          style={{ ...buttonStyle(false, true), opacity: deletingAll || tenants.filter(t => !t.onboarding_complete).length === 0 ? 0.5 : 1 }}
        >
          {deletingAll ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
          {' '}Delete All Incomplete ({tenants.filter(t => !t.onboarding_complete).length})
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#57A3AF' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company, name, or email..."
            style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.25rem', borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--bg)', color: '#41808B', fontSize: '13px' }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Onboarding</th>
                <th style={thStyle}>Registered</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No users found
                  </td>
                </tr>
              ) : (
                filtered.map(t => (
                  <tr key={t.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#41808B' }}>{t.company_name || t.name || '—'}</div>
                    </td>
                    <td style={tdStyle}>{t.email}</td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.25rem 0.75rem', borderRadius: 20,
                        fontSize: '11px', fontWeight: 700,
                        background: t.onboarding_complete ? 'rgba(87,163,175,0.12)' : 'rgba(244,96,54,0.12)',
                        border: `1px solid ${t.onboarding_complete ? 'rgba(87,163,175,0.3)' : 'rgba(244,96,54,0.3)'}`,
                        color: t.onboarding_complete ? '#57A3AF' : '#F46036',
                      }}>
                        {t.onboarding_complete ? <CheckCircle size={11} /> : <XCircle size={11} />}
                        {t.onboarding_complete ? 'Complete' : 'Incomplete'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: '12px', color: '#57A3AF' }}>{formatDate(t.created_at)}</div>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => setConfirmTarget(t)}
                        disabled={deleting === t.id}
                        style={{ ...buttonStyle(false, true), opacity: deleting === t.id ? 0.5 : 1 }}
                      >
                        {deleting === t.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 1000, animation: 'fadeIn 0.2s' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 16, padding: '2rem', width: 480, maxWidth: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
              <AlertTriangle size={24} color="#F46036" />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#F46036' }}>Delete User?</h2>
            </div>
            <p style={{ color: '#41808B', fontSize: '14px', marginBottom: '0.75rem' }}>
              This permanently deletes <strong>{confirmTarget.company_name || confirmTarget.name}</strong> ({confirmTarget.email}) and ALL related data:
            </p>
            <ul style={{ color: '#57A3AF', fontSize: '12px', marginBottom: '1.5rem', paddingLeft: '1.25rem', lineHeight: 1.7 }}>
              <li>Account + assistant configuration</li>
              <li>Vapi assistant (deleted from Vapi)</li>
              <li>Calls, conversations, messages, tickets, appointments</li>
              <li>Knowledge base, widget config, phone requests</li>
            </ul>
            <p style={{ color: '#F46036', fontSize: '12px', fontWeight: 700, marginBottom: '1.5rem' }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmTarget(null)} style={buttonStyle(false)}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting === confirmTarget.id} style={buttonStyle(false, true)}>
                {deleting === confirmTarget.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                {' '}Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
