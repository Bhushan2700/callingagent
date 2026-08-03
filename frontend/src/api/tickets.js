import { authHeaders } from './auth.js';

const BASE = '';

export async function getTickets() {
  const res = await fetch(`${BASE}/api/tickets`, { headers: { ...authHeaders() } });
  const data = await res.json();
  return data.tickets || [];
}

export async function getTicket(id) {
  const res = await fetch(`${BASE}/api/tickets/${id}`, { headers: { ...authHeaders() } });
  return res.json();
}

export async function createTicket(ticket) {
  const res = await fetch(`${BASE}/tool/raise_ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  });
  return res.json();
}

export async function updateTicket(id, status) {
  const res = await fetch(`${BASE}/api/tickets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  return res.json();
}
