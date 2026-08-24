import { authHeaders } from './auth.js';

const BASE = '';

export async function getOnboardingStatus() {
  const res = await fetch(`${BASE}/api/admin/onboarding/status`, { headers: { ...authHeaders() } });
  if (!res.ok) return null;
  return res.json();
}

export async function saveOnboarding(payload) {
  const res = await fetch(`${BASE}/api/admin/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  try {
    return await res.json();
  } catch {
    return { status: 'error', message: `Server error (${res.status}). Please try again.` };
  }
}

export async function getVapiConfig() {
  const res = await fetch(`${BASE}/api/config/vapi`, { headers: { ...authHeaders() } });
  if (!res.ok) return { vapiKey: '', assistantId: '' };
  return res.json();
}