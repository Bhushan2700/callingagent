import { authHeaders } from './auth.js';

const BASE = '';

export async function getCalls() {
  const res = await fetch(`${BASE}/api/admin/calls`, { headers: { ...authHeaders() } });
  if (!res.ok) return { calls: [] };
  return res.json();
}

export async function getCallDetail(callId) {
  const res = await fetch(`${BASE}/api/admin/calls/${callId}`, { headers: { ...authHeaders() } });
  if (!res.ok) return null;
  return res.json();
}

export async function getPhoneNumbers() {
  const res = await fetch(`${BASE}/api/admin/phone-numbers`, { headers: { ...authHeaders() } });
  if (!res.ok) return { phones: [] };
  return res.json();
}