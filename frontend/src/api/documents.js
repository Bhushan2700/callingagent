const BASE = '';

export async function getDocuments() {
  const res = await fetch(`${BASE}/admin/docs`);
  const data = await res.json();
  return data.documents || [];
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/admin/upload`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function deleteDocument(id) {
  const res = await fetch(`${BASE}/admin/docs/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function reindexDocument(id) {
  const res = await fetch(`${BASE}/admin/docs/${id}/reindex`, { method: 'POST' });
  return res.json();
}
