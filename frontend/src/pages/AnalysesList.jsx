import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import FilterSelect from '../components/FilterSelect.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { periodShort } from '../lib/period.js';
import { SIGNING_ENABLED } from '../lib/constants.js';
import { useNewAnalysis } from '../lib/newAnalysis.jsx';

const STATUS_LABELS = { editable: 'Editável', signed: 'Assinada' };

export default function AnalysesList() {
  const novaAnalise = useNewAnalysis();
  const navigate = useNavigate();
  // Contas de entidade única não têm carteira: a coluna "Cliente" repetiria o
  // nome da própria conta em todas as linhas, então ela some e a busca passa
  // a filtrar por período.
  const { isSingleEntity } = useAuth();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [deleteErr, setDeleteErr] = useState('');

  useEffect(() => {
    api.get('/analyses?limit=100')
      .then(r => setAnalyses(r.analyses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function deleteAnalysis(a) {
    try {
      await api.del(`/analyses/${a.id}`);
      setAnalyses(prev => prev.filter(x => x.id !== a.id));
    } catch (e) { setDeleteErr(e.message || 'Erro ao excluir análise.'); }
  }

  // Período = period_label quando existir (ex: "1º Trimestre de 2025"), senão o ano inteiro.
  const periods = [...new Map(analyses.map(a => {
    const key = a.period_label || String(a.year);
    return [key, { key, label: key, year: a.year }];
  })).values()].sort((a, b) => b.year - a.year || a.label.localeCompare(b.label, 'pt-BR'));


  const filtered = analyses.filter(a => {
    const haystack = isSingleEntity ? periodShort(a) : (a.client_name || '');
    if (search && !haystack.toLowerCase().includes(search.toLowerCase())) return false;
    if (SIGNING_ENABLED && statusFilter && a.status !== statusFilter) return false;
    if (periodFilter && (a.period_label || String(a.year)) !== periodFilter) return false;
    return true;
  });

  return (
    <div className="page-body">
      {deleteErr && <div className="err-banner" style={{ marginBottom: 16 }}>{deleteErr}</div>}
      <PageHeader
        subtitle="Histórico"
        title="Análises"
        action={<button className="btn btn-p" onClick={novaAnalise}><i className="ti ti-plus"></i> Nova análise</button>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div className="cl-search" style={{ flex: 1, minWidth: 200 }}>
          <i className="ti ti-search"></i>
          <input className="inp" placeholder={isSingleEntity ? "Buscar por período..." : "Buscar por cliente..."}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {SIGNING_ENABLED && (
          <FilterSelect
            placeholder="Todos status"
            value={statusFilter}
            onChange={setStatusFilter}
            searchable={false}
            options={[
              { value: '', label: 'Todos status' },
              { value: 'editable', label: 'Editável' },
              { value: 'signed', label: 'Assinada' },
            ]}
          />
        )}
        <FilterSelect
          placeholder="Todos períodos"
          value={periodFilter}
          onChange={setPeriodFilter}
          searchable={false}
          options={[
            { value: '', label: 'Todos períodos' },
            ...periods.map(p => ({ value: p.key, label: p.label })),
          ]}
        />
      </div>

      <style>{`
        .al-table-wrap { display: block; }
        .al-cards-wrap { display: none; }
        @media (max-width: 1024px) {
          .al-table-wrap { display: none; }
          .al-cards-wrap { display: flex; flex-direction: column; gap: 8px; }
        }
      `}</style>

      {loading ? (
        <div style={{ color: 'var(--t2)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Carregando…</div>
      ) : (
        <>
          {/* Tabela — desktop e tablet */}
          <div className="al-table-wrap adm-table-wrap table-scroll" style={{ overflowX: 'auto' }}>
            <table className="adm-table" style={{ minWidth: 480 }}>
              <thead>
                <tr>
                  {!isSingleEntity && <th>Cliente</th>}
                  <th>Exercício</th>
                  <th className="al-col-user">Criada por</th>
                  <th>Data</th>
                  {SIGNING_ENABLED && <th>Status</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/analyses/${a.id}`)}>
                    {!isSingleEntity && (
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {a.client_name || 'Cliente'}
                          {!a.client_active && <span className="pill pill-y">Arquivado</span>}
                        </span>
                      </td>
                    )}
                    <td>{periodShort(a)}</td>
                    <td className="al-col-user">
                      {a.user_name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UserAvatar user={{ name: a.user_name, avatar: a.user_avatar, avatar_color: a.user_avatar_color }} size={24} />
                          {a.user_name}
                        </div>
                      ) : '—'}
                    </td>
                    <td>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                    {SIGNING_ENABLED && (
                      <td><span className={`pill ${a.status === 'signed' ? 'pill-g' : 'pill-b'}`}>{STATUS_LABELS[a.status] || a.status}</span></td>
                    )}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                        <div onClick={e => e.stopPropagation()}>
                          <button className="ib ib-d" title="Excluir" onClick={() => setConfirm({
                            title: `Excluir análise de ${periodShort(a)}?`,
                            message: 'Esta ação é irreversível.',
                            danger: true, confirmLabel: 'Excluir',
                            onConfirm: () => deleteAnalysis(a),
                          })}>
                            <i className="ti ti-trash"></i>
                          </button>
                        </div>
                        <i className="ti ti-chevron-right" style={{ color: 'var(--t3)' }}></i>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={SIGNING_ENABLED ? 6 : 5} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t3)' }}>Nenhuma análise encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Cards — mobile */}
          <div className="al-cards-wrap">
            {filtered.map(a => (
              <div key={a.id} onClick={() => navigate(`/app/analyses/${a.id}`)}
                style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--t0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isSingleEntity ? periodShort(a) : (a.client_name || 'Cliente')}
                    </span>
                    {!isSingleEntity && !a.client_active && <span className="pill pill-y" style={{ flexShrink: 0 }}>Arquivado</span>}
                    {SIGNING_ENABLED && <span className={`pill ${a.status === 'signed' ? 'pill-g' : 'pill-b'}`} style={{ flexShrink: 0 }}>{STATUS_LABELS[a.status] || a.status}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t2)' }}>
                    {!isSingleEntity && (
                      <>
                        <span style={{ color: 'var(--t0)', fontWeight: 500 }}>{periodShort(a)}</span>
                        <span style={{ color: 'var(--t3)' }}>·</span>
                      </>
                    )}
                    <span>{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                    {a.user_name && (
                      <>
                        <span style={{ color: 'var(--t3)' }}>·</span>
                        <UserAvatar user={{ name: a.user_name, avatar: a.user_avatar, avatar_color: a.user_avatar_color }} size={18} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user_name}</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div onClick={e => e.stopPropagation()}>
                    <button className="ib ib-d" title="Excluir" onClick={() => setConfirm({
                      title: `Excluir análise de ${periodShort(a)}?`,
                      message: 'Esta ação é irreversível.',
                      danger: true, confirmLabel: 'Excluir',
                      onConfirm: () => deleteAnalysis(a),
                    })}>
                      <i className="ti ti-trash"></i>
                    </button>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: 'var(--t3)', fontSize: 16 }}></i>
                </div>
              </div>
            ))}
            {!filtered.length && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t3)', fontSize: 14 }}>Nenhuma análise encontrada.</div>
            )}
          </div>
        </>
      )}

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
