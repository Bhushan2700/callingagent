import emailjs from '@emailjs/browser';

emailjs.init('DSGUFelUkxLs5cwVW');

const EMAILJS_SERVICE = 'service_0ycp7gu';
const EMAILJS_OTP_TEMPLATE = 'template_qij1f0f';
const EMAILJS_WELCOME_TEMPLATE = 'template_uygt63e';

export async function sendOtpEmail(name, email, otp) {
  return emailjs.send(EMAILJS_SERVICE, EMAILJS_OTP_TEMPLATE, { name, email, otp });
}

export async function sendWelcomeEmail(name, email) {
  return emailjs.send(EMAILJS_SERVICE, EMAILJS_WELCOME_TEMPLATE, { name, email });
}

const BASE = '';

export function getToken() {
  return localStorage.getItem('loggix_token');
}

export function getTenantId() {
  return localStorage.getItem('loggix_tenant_id');
}

export function getTenantName() {
  return localStorage.getItem('loggix_tenant_name');
}

export function setAuth(token, tenantId, name, assistantId = '') {
  localStorage.setItem('loggix_token', token);
  localStorage.setItem('loggix_tenant_id', tenantId);
  localStorage.setItem('loggix_tenant_name', name);
  if (assistantId) localStorage.setItem('loggix_assistant_id', assistantId);
}

export function clearAuth() {
  localStorage.removeItem('loggix_token');
  localStorage.removeItem('loggix_tenant_id');
  localStorage.removeItem('loggix_tenant_name');
  localStorage.removeItem('loggix_assistant_id');
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function register(email, password, name) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Registration failed');
  }
  return res.json();
}

export async function requestOtp(email, password, name) {
  const res = await fetch(`${BASE}/api/auth/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to send code');
  }
  return res.json();
}

export async function verifyOtp(email, otp) {
  const res = await fetch(`${BASE}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Verification failed');
  }
  return res.json();
}

export async function resendOtp(email) {
  const res = await fetch(`${BASE}/api/auth/resend-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to resend code');
  }
  return res.json();
}

export async function forgotPassword(email) {
  const res = await fetch(`${BASE}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to send code');
  }
  return res.json();
}

export async function resetPassword(email, otp, newPassword) {
  const res = await fetch(`${BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Password reset failed');
  }
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Login failed');
  }
  return res.json();
}

export async function getMe() {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { ...authHeaders() },
  });
  if (!res.ok) return null;
  return res.json();
}
