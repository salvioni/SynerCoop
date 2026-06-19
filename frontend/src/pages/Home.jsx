import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/stats').then(d => setStats(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>Carregando…</div>;

  return (
    <div>
      <div className="ph">
        <div>
          <h1 className="pt">Olá, {user?.name?.split(' ')[0]} 👋</h1>
          <div className="ps">Painel do escritório — visão geral</div>
        </div>
        <button className="btn btn-p" onClick={() => navigate('/app/clients/new')}>
          <i className="ti ti-plus"></i> Novo cliente
        </button>
      </div>

      <div className="dash-grid">
        <div className="dash-stat">
          <div className="dash-stat-icon"><i className="ti ti-building"></i></div>
          <div className="dash-stat-val">{stats?.totalClients ?? '—'}</div>
          <div className="dash-stat-label">Total de clientes</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-icon"><i className="ti ti-building-check"></i></div>
          <div className="dash-stat-val">{stats?.activeClients ?? '—'}</div>
          <div className="dash-stat-label">Clientes ativos</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-icon"><i className="ti ti-file-analytics"></i></div>
          <div className="dash-stat-val">{stats?.totalAnalyses ?? '—'}</div>
          <div className="dash-stat-label">Análises realizadas</div>
        </div>
        <div className="dash-stat" style={{ cursor: 'pointer' }} onClick={() => navigate('/app/analyses/new')}>
          <div className="dash-stat-icon" style={{ background: 'var(--color-background-info)', color: 'var(--color-text-info)' }}>
            <i className="ti ti-upload"></i>
          </div>
          <div className="dash-stat-val" style={{ fontSize: 16, paddingTop: 4 }}>Nova análise</div>
          <div className="dash-stat-label">Enviar arquivo financeiro</div>
        </div>
      </div>

      {stats?.recentAnalyses?.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>
            Análises recentes
          </div>
          <div className="analysis-list">
            {stats.recentAnalyses.map(a => (
              <div key={a.id} className="analysis-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/analyses/${a.id}`)}>
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
        </>
      )}

      {stats?.totalClients === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-tertiary)' }}>
          <i className="ti ti-building-off" style={{ fontSize: 40, display: 'block', marginBottom: 12, opacity: .35 }}></i>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Nenhum cliente cadastrado ainda.</div>
          <button className="btn btn-p" onClick={() => navigate('/app/clients/new')}>
            <i className="ti ti-plus"></i> Cadastrar primeiro cliente
          </button>
        </div>
      )}
    </div>
  );
}
