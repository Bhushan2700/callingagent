import { authHeaders } from './auth.js';

const BASE = '';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders(), ...(opts.headers || {}) }, ...opts });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { detail = (await res.json()).detail || detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

export function getDashboard(from = '', to = '', days = 30) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (days && days !== 30) params.set('days', days);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return req(`/api/admin/dashboard${qs}`);
}

export function getCalls({ page = 1, perPage = 20, status = '', search = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  return req(`/api/admin/calls?${params.toString()}`);
}

export function getCallDetail(callId) {
  return req(`/api/admin/calls/${callId}`);
}

export function getConversations({ page = 1, perPage = 20, channel = '', status = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (channel) params.set('channel', channel);
  if (status) params.set('status', status);
  return req(`/api/admin/conversations?${params.toString()}`);
}

export function getConversationDetail(convId) {
  return req(`/api/admin/conversations/${convId}`);
}

export function getAppointments({ page = 1, perPage = 50, status = '', source = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (status) params.set('status', status);
  if (source) params.set('source', source);
  return req(`/api/admin/appointments?${params.toString()}`);
}

export function getKnowledgeGaps({ page = 1, perPage = 20, status = '' } = {}) {
  const params = new URLSearchParams({ page, per_page: perPage });
  if (status) params.set('status', status);
  return req(`/api/admin/knowledge-gaps?${params.toString()}`);
}

export function updateKnowledgeGap(gapId, status) {
  return req(`/api/admin/knowledge-gaps/${gapId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
}

export function getAiPerformance(days = 30) {
  return req(`/api/admin/analytics/ai-performance?days=${days}`);
}

export function getAssistantConfig() {
  return req('/api/admin/assistant/config');
}

export function saveAssistantConfig(config) {
  return req('/api/admin/assistant/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
}

export function publishAssistantConfig(draftId) {
  return req('/api/admin/assistant/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_id: draftId }) });
}
