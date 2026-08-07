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

export async function getPhoneDetail() {
  const res = await fetch(`${BASE}/api/admin/phone-detail`, { headers: { ...authHeaders() } });
  if (!res.ok) return { detail: null };
  return res.json();
}