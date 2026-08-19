import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from './ConfirmModal.jsx';
import UserAvatar from './UserAvatar.jsx';
import { periodLabel, periodShort } from '../lib/period.js';
import { SIGNING_ENABLED } from '../lib/constants.js';

/**
 * AnalysisRow — linha de análise reutilizável.
 *
 * Props:
 *   analysis   — objeto analysis com id, year, period_label, client_name, etc.
 *   onDelete   — função (analysis) => void chamada após confirmação de exclusão.
 *                Omitir para esconder o botão de excluir.
 *   hideClient — true quando exibido dentro da tela do próprio cliente.
 *   compact    — true para modo compacto (sem year badge, usado no Dashboard).
 */
export default function AnalysisRow({ analysis: a, onDelete, hideClient = false, compact = false }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(null);

  function requestDelete(e) {
    e.stopPropagation();
    setConfirm({
      title: `Excluir análise de ${periodShort(a)}?`,
      message: 'Esta ação é irreversível.',
      danger: true,
      confirmLabel: 'Excluir',
      onConfirm: () => { onDelete(a); setConfirm(null); },
    });
  }

  return (
    <>
      <div
        className={`an-row${compact ? ' an-row-compact' : ''}`}
        onClick={() => navigate(`/app/analyses/${a.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && navigate(`/app/analyses/${a.id}`)}
      >
        {!compact && (
          <div className="an-row-badge">
            {a.year}
          </div>
        )}

        <div className="an-row-body">
          {!hideClient && (
            <div className="an-row-client">
              {a.client_name || 'Cliente'}
              {!a.client_active && <span className="pill pill-y" style={{ marginLeft: 6, fontSize: 10 }}>Arquivado</span>}
            </div>
          )}
          <div className="an-row-period">{periodLabel(a)}</div>
          <div className="an-row-meta">
            {new Date(a.created_at).toLocaleDateString('pt-BR')}
            {a.user_name && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: 'var(--t3)' }}>·</span>
                <UserAvatar
                  user={{ name: a.user_name, avatar: a.user_avatar, avatar_color: a.user_avatar_color }}
                  size={14}
                />
                {a.user_name}
              </span>
            )}
          </div>
        </div>

        <div className="an-row-tail" onClick={e => e.stopPropagation()}>
          {SIGNING_ENABLED && (
            <span className={`pill ${a.status === 'signed' ? 'pill-g' : 'pill-b'}`}>
              {a.status === 'signed' ? 'Assinada' : 'Editável'}
            </span>
          )}
          {onDelete && (
            <button className="ib ib-d" title="Excluir análise" onClick={requestDelete}>
              <i className="ti ti-trash" />
            </button>
          )}
          <i className="ti ti-chevron-right" style={{ color: 'var(--t3)', fontSize: 14 }} />
        </div>
      </div>

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
