import { useEffect } from 'react';

export function SuccessFeedback({ message, onClose, autoClose = 1100 }) {
  useEffect(() => {
    if (!autoClose) return;
    const t = setTimeout(() => onClose?.(), autoClose);
    return () => clearTimeout(t);
  }, [autoClose, onClose]);

  return (
    <div className="mbd" onClick={onClose}>
      <div className="mod" style={{ maxWidth: 360 }}>
        <div className="mob" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: 'var(--color-background-success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem', color: 'var(--color-text-success)', fontSize: 22
          }}>
            <i className="ti ti-check"></i>
          </div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{message}</div>
        </div>
      </div>
    </div>
  );
}

export function ErrorFeedback({ message, onClose }) {
  return (
    <div className="mbd" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="mod" style={{ maxWidth: 380 }}>
        <div className="mob" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: 'var(--color-background-danger)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem', color: 'var(--color-text-danger)', fontSize: 22
          }}>
            <i className="ti ti-alert-triangle"></i>
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-danger)', marginBottom: '1rem' }}>{message}</div>
          <button className="btn" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
