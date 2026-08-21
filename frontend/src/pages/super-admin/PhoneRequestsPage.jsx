import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, Loader2, Eye, Edit, AlertCircle, Clock, CheckCircle, Truck } from 'lucide-react';
import { getPhoneRequests, updatePhoneRequest, getTenants } from '../../api/superAdmin.js';

const STATUS_COLORS = {
  pending: { bg: 'rgba(244,96,54,0.12)', border: 'rgba(244,96,54,0.3)', text: '#F46036', icon: Clock },
  in_progress: { bg: 'rgba(127,184,0,0.12)', border: 'rgba(127,184,0,0.3)', text: '#7FB800', icon: Truck },
  completed: { bg: 'rgba(87,163,175,0.12)', border: 'rgba(87,163,175,0.3)', text: '#57A3AF', icon: CheckCircle },
};

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };
const thStyle = { textAlign: 'left', padding: '0.75rem 1rem', fontWeight: 700, color: '#57A3AF', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--glass-border)' };
const tdStyle = { padding: '1rem', borderBottom: '1px solid var(--glass-border)', color: '#41808B' };

const badgeStyle = (status) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.25rem 0.75rem', borderRadius: 20, fontSize: '11px', fontWeight: 700, background: c.bg, border: `1px solid ${c.border}`, color: c.text };
};

const buttonStyle = (primary) => ({
  padding: '0.5rem 1rem', borderRadius: 8, fontWeight: 600, fontSize: '12px', cursor: 'pointer',
  background: primary ? 'linear-gradient(135deg, #7FB800 0%, #57A3AF 100%)' : 'var(--glass)',
  color: primary ? '#fff' : '#41808B',
  border: primary ? 'none' : '1px solid var(--glass-border)',
});

const cardStyle = { background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: '1.5rem' };

export default function PhoneRequestsPage() {
  const nav = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    loadRequests();
    loadTenants();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await getPhoneRequests();
      setRequests(data.requests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTenants = async () => {
    try {
      const data = await getTenants();
      setTenants(data.tenants || []);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredRequests = statusFilter === 'all'
    ? requests
    : requests.filter(r => r.status === statusFilter);

  const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const maskNumber = (num) => {
    if (!num || num.length < 8) return '****';
    return num.slice(0, 4) + '****' + num.slice(-4);
  };

  const getTenantName = (tenantId) => {
    const t = tenants.find(t => t.id === tenantId);
    return t ? (t.company_name || t.name || t.email) : tenantId;
  };

  const handleStatusChange = async (id, newStatus) => {
    if (updating === id) return;
    setUpdating(id);
    try {
      await updatePhoneRequest(id, { status: newStatus });
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setUpdating(null);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#41808B', marginBottom: '0.25rem' }}>Phone Requests</h1>
          <p style={{ color: '#57A3AF', fontSize: '0.9rem' }}>Manage phone number configuration requests from onboarding</p>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {['all', 'pending', 'in_progress', 'completed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} style={{
              ...buttonStyle(statusFilter === s),
              opacity: statusFilter === s ? 1 : 0.7,
            }}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.15rem 0.5rem', borderRadius: 10, fontSize: '10px', marginLeft: 6 }}>
                {s === 'all' ? requests.length : requests.filter(r => r.status === s).length}
              </span>
            </button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Business</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Provider</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Requested</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                    No phone requests found
                  </td>
                </tr>
              ) : (
                filteredRequests.map(r => {
                  const colors = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
                  const Icon = colors.icon;
                  return (
                    <tr key={r.id} style={{ background: r.status === 'pending' ? 'rgba(244,96,54,0.03)' : 'transparent' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#41808B' }}>{r.company_name}</div>
                        <div style={{ fontSize: '11px', color: '#57A3AF' }}>{getTenantName(r.tenant_id)}</div>
                      </td>
                      <td style={tdStyle}>
                        <div>{r.tenant_email}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: '#41808B' }}>{r.provider}</span>
                      </td>
                      <td style={tdStyle}>
                        <code style={{ fontSize: '12px', color: '#41808B', background: 'var(--bg)', padding: '0.15rem 0.5rem', borderRadius: 6 }}>
                          {r.phone_number}
                        </code>
                      </td>
                      <td style={tdStyle}>
                        <span style={badgeStyle(r.status)}>
                          <colors.icon size={11} />
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1).replace('_', ' ')}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: '12px', color: '#57A3AF' }}>{formatDate(r.created_at)}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setSelectedRequest(r)} style={buttonStyle(false)}>
                            <Eye size={13} />
                          </button>
                          {r.status !== 'completed' && (
                            <button
                              onClick={() => handleStatusChange(r.id, r.status === 'pending' ? 'in_progress' : 'completed')}
                              disabled={updating === r.id}
                              style={buttonStyle(true)}
                            >
                              {updating === r.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 1000, animation: 'fadeIn 0.2s' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 16, padding: '2rem', width: 520, maxWidth: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#41808B' }}>Request Details</h2>
              <button onClick={() => setSelectedRequest(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.5rem' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ background: 'var(--glass)', borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontWeight: 700, color: '#41808B', marginBottom: 4 }}>{selectedRequest.company_name}</div>
                <div style={{ fontSize: '12px', color: '#57A3AF' }}>{getTenantName(selectedRequest.tenant_id)} • {selectedRequest.tenant_email}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: 'var(--glass)', borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontSize: '11px', color: '#57A3AF', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Provider</div>
                  <div style={{ fontWeight: 600, color: '#41808B' }}>{selectedRequest.provider}</div>
                </div>
                <div style={{ background: 'var(--glass)', borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontSize: '11px', color: '#57A3AF', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone Number</div>
                  <code style={{ fontSize: '13px', color: '#41808B', fontFamily: 'monospace' }}>{selectedRequest.phone_number}</code>
                </div>
              </div>
              <div style={{ background: 'var(--glass)', borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: '11px', color: '#57A3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Credentials (masked)</div>
                {Object.entries(selectedRequest.credentials || {}).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: '0.5rem', fontSize: '12px' }}>
                    <span style={{ color: '#57A3AF' }}>{k}: </span>
                    <code style={{ color: '#41808B' }}>{v ? v.slice(0, 8) + '****' : '—'}</code>
                  </div>
                ))}
              </div>
              <div style={{ background: 'var(--glass)', borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: '11px', color: '#57A3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin Notes</div>
                <textarea
                  value={selectedRequest.admin_notes || ''}
                  onChange={e => setSelectedRequest({ ...selectedRequest, admin_notes: e.target.value })}
                  placeholder="Add internal notes..."
                  style={{ width: '100%', minHeight: 80, borderRadius: 8, border: '1px solid var(--glass-border)', background: 'var(--bg)', color: '#41808B', padding: '0.75rem', fontSize: '13px', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button onClick={() => setSelectedRequest(null)} style={buttonStyle(false)}>Close</button>
                <button
                  onClick={() => handleStatusChange(selectedRequest.id, selectedRequest.status === 'pending' ? 'in_progress' : 'completed')}
                  disabled={updating === selectedRequest.id}
                  style={buttonStyle(true)}
                >
                  {updating === selectedRequest.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                  {selectedRequest.status === 'pending' ? ' Mark In Progress' : ' Mark Complete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}