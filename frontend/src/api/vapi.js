import { authHeaders } from './auth.js';

const BASE = '';

export async function getPhoneNumbers() {
  const res = await fetch(`${BASE}/api/admin/phone-numbers`, { headers: { ...authHeaders() } });
  if (!res.ok) return { phones: [] };
  return res.json();
}