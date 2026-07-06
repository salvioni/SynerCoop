import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import FilterSelect from '../components/FilterSelect.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import PageHeader from '../components/PageHeader.jsx';

const STATUS_LABELS = { editable: 'Editável', signed: 'Assinada' };

export default function AnalysesList() {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  useEffect(() => {
    api.get('/analyses?limit=100')
      .then(r => setAnalyses(r.analyses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const years = [...new Set(analyses.map(a => a.year))].sort((a, b) => b - a);

  const filtered = analyses.filter(a => {
    if (search && !(a.client_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (yearFilter && a.year !== Number(yearFilter)) return false;
    return true;
  });

  return (
    <div className="page-body">
      <PageHeader
        subtitle="Histórico"
        title="Análises"
        action={<button className="btn btn-p" onClick={() => navigate('/app/analyses/new')}><i className="ti ti-plus"></i> Nova análise</button>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <div className="cl-search" style={{ flex: 1, minWidth: 200 }}>
          <i className="ti ti-search"></i>
          <input className="inp" placeholder="Buscar por cliente..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
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
        <FilterSelect
          placeholder="Todos anos"
          value={yearFilter}
          onChange={setYearFilter}
          searchable={false}
          options={[
            { value: '', label: 'Todos anos' },
            ...years.map(y => ({ value: String(y), label: String(y) })),
          ]}
        />
      </div>

      {loading ? (
        <div style={{ color: 'var(--t2)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Carregando…</div>
      ) : (
        <div className="adm-table-wrap table-scroll">
          <table className="adm-table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Exercício</th>
                <th>Criada por</th>
                <th>Data</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/analyses/${a.id}`)}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {a.client_name || 'Cliente'}
                      {!a.client_active && <span className="pill pill-y">Arquivado</span>}
                    </span>
                  </td>
                  <td>{a.year}</td>
                  <td>
                    {a.user_name ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <UserAvatar user={{ name: a.user_name, avatar: a.user_avatar, avatar_color: a.user_avatar_color }} size={24} />
                        {a.user_name}
                      </div>
                    ) : '—'}
                  </td>
                  <td>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                  <td><span className={`pill ${a.status === 'signed' ? 'pill-g' : 'pill-b'}`}>{STATUS_LABELS[a.status] || a.status}</span></td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t3)' }}>Nenhuma análise encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
