export const RESOLUTION_LABELS = {
  ai_resolved: 'AI Resolved',
  appointment_completed: 'Appointment Booked',
  ticket_created: 'Ticket Created',
  human_resolved: 'Human Resolved',
  escalated: 'Escalated',
  abandoned: 'Abandoned',
  unresolved: 'Unresolved',
};

export const RESOLUTION_COLORS = {
  ai_resolved: '#7FB800',
  appointment_completed: '#7FB800',
  ticket_created: '#41808B',
  human_resolved: '#7FB800',
  escalated: '#7FB800',
  abandoned: '#F46036',
  unresolved: '#F46036',
};

export const INTENT_LABELS = {
  appointment_booking: 'Appointment booking',
  refund_policy: 'Refund policy',
  pricing: 'Pricing',
  support: 'Support',
  business_hours: 'Business hours',
  shipping: 'Shipping',
  general: 'General',
};

export const INTENT_COLORS = {
  appointment_booking: '#7FB800',
  refund_policy: '#7FB800',
  pricing: '#41808B',
  support: '#F46036',
  business_hours: '#57A3AF',
  shipping: '#7FB800',
  general: '#41808B',
};

export const TOOL_LABELS = {
  search_knowledge: 'Knowledge search',
  book_appointment: 'Book appointment',
  raise_ticket: 'Raise ticket',
};

export const SOURCE_LABELS = {
  ai: 'AI Booked',
  dashboard: 'Dashboard',
  external: 'External',
};

export const APPT_STATUS_LABELS = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  pending: 'Pending',
};

export const CHANNEL_LABELS = {
  phone: 'Phone call',
  chat: 'Chat',
  web: 'Web chat',
  widget: 'Widget',
};

export function humanizeLabel(s) {
  return String(s || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Unknown';
}

export function resolveLabel(key, map) {
  return map[key] || humanizeLabel(key);
}

export function fmtDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDocName(docId) {
  return humanizeLabel(docId);
}

export function ticketNumber(index) {
  return `#${index + 1}`;
}