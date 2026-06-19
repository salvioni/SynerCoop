import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function Analyses() {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/analyses?limit=100').then(d => setAnalyses(d.analyses || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = analyses.filter(a =>
    !search || a.client_name?.toLowerCase().includes(search.toLowerCase()) || String(a.year).includes(search)
  );

  return (
    <div>
      <div className="ph">
        <div>
          <h1 className="pt">Análises</h1>
          <div className="ps">Todos os relatórios financeiros realizados</div>
        </div>
        <button className="btn btn-p" onClick={() => navigate('/app/analyses/new')}>
          <i className="ti ti-plus"></i> Nova análise
        </button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div className="filter-group" style={{ maxWidth: 320 }}>
          <div className="filter-icon"><i className="ti ti-search"></i></div>
          <input className="filter-text" placeholder="Buscar por cliente ou ano…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', color: 'var(--color-text-secondary)', fontSize: 13 }}>Carregando…</div>
      ) : !filtered.length ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          <i className="ti ti-file-off" style={{ fontSize: 36, display: 'block', marginBottom: 10, opacity: .35 }}></i>
          {search ? 'Nenhuma análise encontrada.' : 'Nenhuma análise realizada ainda.'}
        </div>
      ) : (
        <div className="analysis-list">
          {filtered.map(a => (
            <div key={a.id} className="analysis-item" style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/app/analyses/${a.id}`)}>
              <div className="analysis-year-badge">{a.year}</div>
              <div className="analysis-info">
                <div className="analysis-client">{a.client_name}</div>
                <div className="analysis-date">{new Date(a.created_at).toLocaleDateString('pt-BR')}</div>
              </div>
              <div className="analysis-actions">
                <span className="sb ss">{a.status === 'done' ? 'Concluída' : a.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
