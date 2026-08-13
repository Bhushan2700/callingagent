import { useState, useEffect, useRef } from 'react';
import EmptyState from '../components/EmptyState.jsx';
import Loading from '../components/Loading.jsx';
import { getDocuments, uploadDocument, deleteDocument, reindexDocument } from '../api/documents.js';

export default function DocumentsPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, text: '' });
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadDocuments(); }, []);

  async function loadDocuments() {
    setLoading(true);
    const data = await getDocuments();
    setDocs(data);
    setLoading(false);
  }

  async function handleFiles(files) {
    if (!files.length) return;
    setUploading(true);
    let success = 0, error = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pct = Math.round(((i + 1) / files.length) * 100);
      setProgress({ pct, text: `Uploading ${file.name} (${i + 1}/${files.length})...` });

      try {
        const result = await uploadDocument(file);
        if (result.status === 'success') success++;
        else error++;
      } catch {
        error++;
      }
    }

    setUploading(false);
    setStatus(error === 0
      ? { type: 'success', text: `Successfully uploaded ${success} file(s)` }
      : { type: 'error', text: `Uploaded ${success}, failed ${error}` }
    );
    setTimeout(() => setStatus(null), 3000);
    loadDocuments();
  }

  function onDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function onDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--brand-accent)';
    e.currentTarget.style.background = 'rgba(37,99,235,0.1)';
  }

  function onDragLeave(e) {
    e.currentTarget.style.borderColor = 'rgba(20,184,166,0.3)';
    e.currentTarget.style.background = 'var(--glass)';
  }

  async function handleDelete(docId) {
    if (!confirm(`Delete "${docId}"?`)) return;
    await deleteDocument(docId);
    setStatus({ type: 'success', text: `Deleted ${docId}` });
    setTimeout(() => setStatus(null), 3000);
    loadDocuments();
  }

  async function handleReindex(docId) {
    await reindexDocument(docId);
    setStatus({ type: 'info', text: `Re-indexing ${docId}...` });
    setTimeout(() => { setStatus(null); loadDocuments(); }, 2000);
  }

  const totalChunks = docs.reduce((s, d) => s + (d.chunk_count || 0), 0);

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Document Manager</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Upload documents to the RAG knowledge base</p>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--glass)', padding: '1rem 1.5rem', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-accent)' }}>{docs.length}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Documents</div>
        </div>
        <div style={{ background: 'var(--glass)', padding: '1rem 1.5rem', borderRadius: 12, border: '1px solid var(--glass-border)' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-accent)' }}>{totalChunks}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Chunks</div>
        </div>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: '2px dashed rgba(20,184,166,0.3)',
          borderRadius: 16,
          padding: '3rem 2rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s',
          background: 'var(--glass)',
          marginBottom: '1rem',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Drag & drop files here or click to browse</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Supports .md, .pdf, .txt, .json</p>
        <input ref={fileInputRef} type="file" multiple accept=".md,.pdf,.txt,.json" style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {uploading && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ height: 6, background: 'rgba(20,184,166,0.15)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--brand-gradient)', transition: 'width 0.3s', width: `${progress.pct}%` }} />
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{progress.text}</div>
        </div>
      )}

      {status && (
        <div style={{
          marginBottom: '1rem',
          padding: '1rem',
          borderRadius: 8,
          background: status.type === 'success' ? '#064e3b' : status.type === 'error' ? '#7f1d1d' : '#1e3a5f',
          border: `1px solid ${status.type === 'success' ? '#10b981' : status.type === 'error' ? '#ef4444' : '#3b82f6'}`,
          color: status.type === 'success' ? '#6ee7b7' : status.type === 'error' ? '#fca5a5' : '#93c5fd',
        }}>
          {status.text}
        </div>
      )}

      <h2 style={{ fontSize: '1.2rem', margin: '1.5rem 0 1rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
        Ingested Documents
      </h2>

      {loading ? <Loading text="Loading documents..." /> : docs.length === 0 ? (
        <EmptyState message="No documents ingested yet" icon="📄" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {docs.map(doc => (
            <div key={doc.doc_id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              background: 'var(--glass)',
              borderRadius: 12,
              border: '1px solid var(--glass-border)',
              transition: 'all 0.3s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-accent)'; e.currentTarget.style.transform = 'translateX(2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateX(0)' }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, color: '#fff' }}>{doc.doc_id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {doc.chunk_count} chunks • {doc.doc_type}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => handleReindex(doc.doc_id)}>Re-index</button>
                <button className="btn btn-danger" onClick={() => handleDelete(doc.doc_id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
