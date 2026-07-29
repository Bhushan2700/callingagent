const BASE = '';

export async function getWidgetConfig() {
  const res = await fetch(`${BASE}/api/admin/widget-config`);
  return res.json();
}

export async function updateWidgetConfig(config) {
  const res = await fetch(`${BASE}/api/admin/widget-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}
