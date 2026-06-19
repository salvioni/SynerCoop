import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function AnalysesList() {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/analyses?limit=100').then(r => setAnalyses(r.analyses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = analyses.filter(a =>
    !search || (a.client_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-body" style={{ padding: '40px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--t2)' }}>Histórico</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', marginTop: 4, color: 'var(--t0)' }}>Análises</h1>
        </div>
        <button className="btn btn-p" onClick={() => navigate('/app/clients')}>
          <i className="ti ti-plus"></i> Nova análise
        </button>
      </div>

      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="cl-search" style={{ flex: 1, maxWidth: 420 }}>
          <i className="ti ti-search"></i>
          <input className="inp" placeholder="Buscar por cliente, CNPJ..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="inp" style={{ width: 'auto', minWidth: 140 }}>
          <option>Todos status</option>
          <option>Concluída</option>
          <option>Processando</option>
          <option>Rascunho</option>
        </select>
        <select className="inp" style={{ width: 'auto', minWidth: 130 }}>
          <option>Todos anos</option>
          <option>2025</option>
          <option>2024</option>
          <option>2023</option>
        </select>
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
                  <th></th>
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
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ color: 'var(--t2)', fontSize: 14 }}>Abrir →</span>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t3)' }}>Nenhuma análise encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
