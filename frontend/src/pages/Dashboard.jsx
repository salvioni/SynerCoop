import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { getPlan } from '../lib/plans.js';
import UserAvatar from '../components/UserAvatar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ClientDashboard from '../components/ClientDashboard.jsx';
import { periodLabel } from '../lib/period.js';
import { SIGNING_ENABLED } from '../lib/constants.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Dashboard() {
  const { user, isSingleEntity } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (isSingleEntity) return;
    api.get('/stats').then(setStats).catch(() => {});
    api.get('/analyses?limit=5').then(r => setAnalyses(r.analyses || [])).catch(() => {});
    // Convites ainda não aceitos não contam como membro ativo do escritório.
    api.get('/users').then(r => setUsers((r.users || []).filter(u => !u.invite_pending))).catch(() => {});
  }, [isSingleEntity]);

  // Contas de entidade única (cooperativa/empresa/associação/outro) não têm
  // uma carteira de clientes — a "Visão geral" é direto o painel do cliente
  // espelhado na conta.
  if (isSingleEntity) return <ClientDashboard clientId={user.self_client_id} allowDelete={false} />;

  const firstName = user?.name?.split(' ')[0] || '';
  const plan = getPlan(stats?.plan || user?.plan);
  const monthly = stats?.monthlyAnalyses ?? 0;
  const limitLabel = plan.limit === Infinity ? '∞' : plan.limit;
  const pctUsed = plan.limit === Infinity ? 0 : Math.min(100, Math.round((monthly / plan.limit) * 100));

  return (
    <div className="page-body">
      <PageHeader subtitle={`${greeting()}, ${firstName}`} title="Visão geral" />

      <div className="dash-grid">
        {[
          { label: 'Análises este mês', val: monthly, sub: `de ${limitLabel} no plano ${plan.label}`, icon: 'ti-chart-bar' },
          { label: 'Clientes ativos', val: stats?.activeClients ?? '—', sub: stats?.newClientsMonth ? `+${stats.newClientsMonth} este mês` : '', icon: 'ti-users' },
          { label: 'Relatórios gerados', val: stats?.totalAnalyses ?? '—', sub: 'últimos 30 dias', icon: 'ti-file-text' },
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
                  {periodLabel(a)} · {new Date(a.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              {SIGNING_ENABLED && (
                <span className={`pill ${a.status === 'signed' ? 'pill-g' : 'pill-b'}`}>{a.status === 'signed' ? 'Assinada' : 'Editável'}</span>
              )}
            </div>
          )) : (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>
              Nenhuma análise recente.
            </div>
          )}
        </div>

        <div className="dash-section">
          <div className="dash-section-head" style={{ marginBottom: 28 }}>
            <span className="dash-section-title">Resumo do escritório</span>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t2)', fontWeight: 500, marginBottom: 8 }}>Plano atual</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, color: 'var(--t0)' }}>{plan.label}</div>
            <div className="s-meter-bar" style={{ marginTop: 10, height: 6, background: 'var(--bd)', borderRadius: 3 }}>
              <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 3, width: `${pctUsed}%` }}></div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 8 }}>{monthly} de {limitLabel} análises usadas</div>
          </div>
          <div style={{ marginBottom: 20, marginTop: 32 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t2)', fontWeight: 500, marginBottom: 10 }}>Membros</div>
            <div style={{ display: 'flex' }}>
              {(users.length ? users : [{ id: 'me', name: user?.name || 'Eu', avatar: user?.avatar, avatar_color: user?.avatar_color }]).slice(0, 4).map((u, i) => (
                <div key={u.id} style={{ marginLeft: i > 0 ? -8 : 0, border: '2px solid var(--bg1)', borderRadius: 999 }}>
                  <UserAvatar user={u} size={36} />
                </div>
              ))}
            </div>
          </div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/app/settings#escritorio')}>
            Gerenciar escritório
          </button>
        </div>
      </div>
    </div>
  );
}
