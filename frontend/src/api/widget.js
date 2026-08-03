import { authHeaders } from './auth.js';

const BASE = '';

export async function getWidgetConfig() {
  const res = await fetch(`${BASE}/api/admin/widget-config`, { headers: { ...authHeaders() } });
  return res.json();
}

export async function updateWidgetConfig(config) {
  const res = await fetch(`${BASE}/api/admin/widget-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(config),
  });
  return res.json();
}
