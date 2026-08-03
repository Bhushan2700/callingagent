import { authHeaders } from './auth.js';

const BASE = '';

export async function sendMessage(message, history = []) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message, history }),
  });
  const data = await res.json();
  return data.response || '';
}
