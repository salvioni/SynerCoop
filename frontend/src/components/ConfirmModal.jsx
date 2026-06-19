import { useEffect } from 'react';

export default function ConfirmModal({ title, message, warning, confirmLabel = 'Confirmar', danger = false, onConfirm, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={{ maxWidth: 340 }} role="alertdialog" aria-modal="true">
        <div className="modal-body" style={{ padding: '20px 20px 0' }}>
          <div className={`cfm-icon ${danger ? 'cfm-icon-d' : 'cfm-icon-i'}`}>
            <i className={`ti ${danger ? 'ti-alert-triangle' : 'ti-help-circle'}`}></i>
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--t0)', marginBottom: 6 }}>{title}</div>
          {message && <p style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.5, marginBottom: 6 }}>{message}</p>}
          {warning && (
            <div style={{ fontSize: 11, color: 'var(--blue-text)', background: 'var(--blue-dim)', borderRadius: 5, padding: '6px 9px', display: 'flex', gap: 5 }}>
              <i className="ti ti-info-circle" style={{ flexShrink: 0 }}></i> {warning}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-d' : 'btn-p'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
