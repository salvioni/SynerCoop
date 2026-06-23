import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import FilterSelect from '../components/FilterSelect.jsx';

export default function AnalysesList() {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  useEffect(() => {
    api.get('/analyses?limit=100').then(r => setAnalyses(r.analyses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const years = [...new Set(analyses.map(a => a.year))].sort((a, b) => b - a);

  const filtered = analyses.filter(a => {
    if (search && !(a.client_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (yearFilter && a.year !== Number(yearFilter)) return false;
    return true;
  }
  );

  return (
    <div className="page-body" style={{ padding: '40px 32px' }}>
      <div style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--t2)' }}>Histórico</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', marginTop: 4, color: 'var(--t0)' }}>Análises</h1>
      </div>

      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="cl-search" style={{ flex: 1, maxWidth: 420 }}>
          <i className="ti ti-search"></i>
          <input className="inp" placeholder="Buscar por cliente, CNPJ..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <FilterSelect
          placeholder="Todos status"
          value={statusFilter}
          onChange={setStatusFilter}
          searchable={false}
          options={[
            { value: '', label: 'Todos status' },
            { value: 'done', label: 'Concluída' },
            { value: 'processing', label: 'Processando' },
            { value: 'draft', label: 'Rascunho' },
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

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div style={{ color: 'var(--t2)', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Carregando…</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
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
                    <td>{a.client_name || 'Cliente'}</td>
                    <td>{a.year}</td>
                    <td>{a.user_name || '—'}</td>
                    <td>{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                    <td><span className="pill pill-g">Concluída</span></td>
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
    </div>
  );
}
