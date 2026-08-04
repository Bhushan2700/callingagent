export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        display: 'flex',
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(10,10,26,0.8)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-deep)',
          border: '1px solid var(--glass-border)',
          borderRadius: 20,
          padding: '2rem',
          width: '100%',
          maxWidth: 500,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(139,92,246,0.06)',
        }}
      >
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.5rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
