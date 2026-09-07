import { getToken } from './auth.js';

const BASE = '';

function authHeaders() {
  const token = localStorage.getItem('loggix_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loginAdmin(email, password) {
  const res = await fetch(`${BASE}/api/super-admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Login failed');
  const data = await res.json();
  localStorage.setItem('loggix_admin_token', data.token);
  return data;
}

export function logoutAdmin() {
  localStorage.removeItem('loggix_admin_token');
}

export function getAdminToken() {
  return localStorage.getItem('loggix_admin_token');
}

export async function createPhoneRequest({ provider, phone_number, area_code, credentials }) {
  const token = getToken() || getAdminToken();
  const res = await fetch(`${BASE}/api/super-admin/phone-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ provider, phone_number, area_code, credentials }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save phone request');
  return res.json();
}

export async function getPhoneRequests() {
  const token = getAdminToken();
  const res = await fetch(`${BASE}/api/super-admin/phone-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to fetch phone requests');
  return res.json();
}

export async function getPhoneRequest(id) {
  const token = getAdminToken();
  const res = await fetch(`${BASE}/api/super-admin/phone-requests/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to fetch phone request');
  return res.json();
}

export async function updatePhoneRequest(id, { status, admin_notes }) {
  const token = getAdminToken();
  const res = await fetch(`${BASE}/api/super-admin/phone-requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, admin_notes }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to update phone request');
  return res.json();
}

export async function getTenants() {
  const token = getAdminToken();
  const res = await fetch(`${BASE}/api/super-admin/tenants`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to fetch tenants');
  return res.json();
}

export async function deleteTenant(tenantId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE}/api/super-admin/tenants/${tenantId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error((await res.json()).detail || 'Failed to delete tenant');
  return res.json();
}