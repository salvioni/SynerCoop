import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    api.get('/stats').then(setStats).catch(() => {});
    api.get('/analyses?limit=5').then(r => setAnalyses(r.analyses || [])).catch(() => {});
    api.get('/users').then(r => setUsers(r.users || [])).catch(() => {});
  }, []);

  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <div className="page-body" style={{ padding: '40px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 14, color: 'var(--t2)' }}>{greeting()}, {firstName}</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, letterSpacing: '-0.01em', marginTop: 4, color: 'var(--t0)' }}>Visão geral</h1>
        </div>
        <button className="btn btn-p" onClick={() => navigate('/app/clients')}>
          <i className="ti ti-plus"></i> Nova análise
        </button>
      </div>

      <div className="dash-grid">
        {[
          { label: 'Análises este mês', val: stats?.monthlyAnalyses ?? '—', sub: 'de 100 no plano Pro', icon: 'ti-chart-bar' },
          { label: 'Clientes ativos', val: stats?.activeClients ?? '—', sub: stats?.newClientsMonth ? `+${stats.newClientsMonth} este mês` : '', icon: 'ti-users' },
          { label: 'Relatórios gerados', val: stats?.totalAnalyses ?? '—', sub: 'últimos 30 dias', icon: 'ti-file-text' },
          { label: 'Tempo médio', val: '1m 23s', sub: 'do upload ao relatório', icon: 'ti-clock' },
        ].map(({ label, val, sub, icon }) => (
          <div key={label} className="dash-card">
            <div className="dash-card-head">
              <span className="dash-card-label">{label}</span>
              <i className={`ti ${icon} dash-card-icon`}></i>
            </div>
            <div className="dash-card-val">{val}</div>
            {sub && <div className="dash-card-sub">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="dash-cols">
        <div className="dash-section">
          <div className="dash-section-head">
            <span className="dash-section-title">Análises recentes</span>
            <span className="dash-section-link" onClick={() => navigate('/app/analyses')}>
              Ver todas <i className="ti ti-arrow-up-right"></i>
            </span>
          </div>
          {analyses.length ? analyses.map(a => (
            <div key={a.id} className="dash-analysis-row" onClick={() => navigate(`/app/analyses/${a.id}`)} style={{ cursor: 'pointer' }}>
              <div className="dash-analysis-info">
                <div className="dash-analysis-name">{a.client_name || 'Cliente'}</div>
                <div className="dash-analysis-meta">
                  Exercício {a.year} · {new Date(a.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <span className="pill pill-g">Concluída</span>
            </div>
          )) : (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>
              Nenhuma análise recente.
            </div>
          )}
        </div>

        <div className="dash-section">
          <div className="dash-section-head">
            <span className="dash-section-title">Resumo do escritório</span>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t2)', fontWeight: 500, marginBottom: 8 }}>Plano atual</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, color: 'var(--t0)' }}>Pro</div>
            <div className="s-meter-bar" style={{ marginTop: 10, height: 6, background: 'var(--bd)', borderRadius: 3 }}>
              <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 3, width: '18%' }}></div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 8 }}>18 de 100 análises usadas</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t2)', fontWeight: 500, marginBottom: 10 }}>Membros</div>
            <div style={{ display: 'flex' }}>
              {(users.length ? users : [{ id: 'me', name: user?.name || 'Eu' }]).slice(0, 4).map((u, i) => (
                <div key={u.id} style={{ width: 36, height: 36, borderRadius: 999, background: ['var(--gold)', '#1E2235', '#4A7C59', '#7C4A6B'][i % 4], color: i === 0 ? '#1E2235' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: '2px solid var(--bg1)', marginLeft: i > 0 ? -8 : 0 }}>
                  {initials(u.name)}
                </div>
              ))}
            </div>
          </div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/app/settings')}>
            Gerenciar escritório
          </button>
        </div>
      </div>
    </div>
  );
}
