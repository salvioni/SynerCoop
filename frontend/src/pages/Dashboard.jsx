import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useAccountInfo } from '../lib/accountInfo.jsx';
import { TENANT_TYPES, BUSINESS_SECTORS } from '../lib/constants.js';
import { api } from '../lib/api.js';
import { getPlan } from '../lib/plans.js';
import UserAvatar from '../components/UserAvatar.jsx';
import PageHeader from '../components/PageHeader.jsx';
import AnalysisRow from '../components/AnalysisRow.jsx';
import { periodShort } from '../lib/period.js';
import EmptyNote from '../components/EmptyNote.jsx';

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
    api.get('/analyses?limit=3').then(r => setAnalyses(r.analyses || [])).catch(() => {});
    // Convites ainda não aceitos não contam como membro ativo do escritório.
    api.get('/users').then(r => setUsers((r.users || []).filter(u => !u.invite_pending))).catch(() => {});
  }, [isSingleEntity]);

  const firstName = user?.name?.split(' ')[0] || '';

  // Contas de entidade única (cooperativa/empresa/associação/outro) não têm
  // carteira: o Início fala da própria organização — quantos cooperados,
  // quantas análises, quem são os membros. Os gráficos de evolução moram em
  // "Desempenho", no menu.
  if (isSingleEntity) {
    return <VisaoGeralOrganizacao greeting={`${greeting()}, ${firstName}`} />;
  }

  const plan = getPlan(stats?.plan || user?.plan);
  const monthly = stats?.monthlyAnalyses ?? 0;
  const limitLabel = plan.limit === Infinity ? '∞' : plan.limit;
  const pctUsed = plan.limit === Infinity ? 0 : Math.min(100, Math.round((monthly / plan.limit) * 100));

  return (
    <div className="page-body">
      <PageHeader subtitle={`${greeting()}, ${firstName}`} title="Início" />

      <div className="dash-grid">
        {[
          { label: 'Análises este mês', val: monthly, sub: `de ${limitLabel} no plano ${plan.label}`, icon: 'ti-chart-bar' },
          { label: 'Clientes ativos', val: stats?.activeClients ?? '—', sub: stats?.newClientsMonth ? `+${stats.newClientsMonth} este mês` : '', icon: 'ti-users' },
          { label: 'Análises realizadas', val: stats?.totalAnalyses ?? '—', sub: 'desde o cadastro', icon: 'ti-file-text' },
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
            <AnalysisRow key={a.id} analysis={a} compact />
          )) : (
            <EmptyNote>
              {stats?.activeClients
                ? 'Nenhuma análise ainda.'
                : 'Nenhuma análise ainda — cadastre um cliente para começar.'}
            </EmptyNote>
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
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--t2)', fontWeight: 500, marginBottom: 10 }}>Quem usa o sistema</div>
            <div style={{ display: 'flex' }}>
              {[
                // Usuário logado sempre primeiro com dados frescos do contexto de auth
                { id: user.id, name: user.name, avatar: user.avatar, avatar_color: user.avatar_color },
                ...users.filter(u => u.id !== user.id),
              ].slice(0, 4).map((u, i) => (
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

// ── Início das contas de entidade única ─────────────────────────────────────
// Espelha a estrutura do painel de escritório (cartões + coluna de resumo),
// trocando "clientes" por aquilo que define a organização: quantas pessoas a
// compõem, seu ramo e seus membros de sistema.
const MEMBER_WORD = {
  cooperativa: 'Cooperados',
  associacao:  'Associados',
  empresa:     'Colaboradores',
  outro:       'Membros',
};

function VisaoGeralOrganizacao({ greeting }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { accountInfo, refetch } = useAccountInfo();
  const [analyses, setAnalyses] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refetch?.();
    Promise.all([
      api.get('/analyses?limit=3').then(r => setAnalyses(r.analyses || [])).catch(() => {}),
      api.get('/users').then(r => setUsers((r.users || []).filter(u => !u.invite_pending))).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const plan        = getPlan(accountInfo?.plan || user?.plan);
  const monthly     = accountInfo?.monthlyAnalyses ?? 0;
  const total       = accountInfo?.totalAnalyses ?? 0;
  const limitLabel  = plan.limit === Infinity ? '∞' : plan.limit;
  const pctUsed     = plan.limit === Infinity ? 0 : Math.min(100, Math.round((monthly / plan.limit) * 100));
  const memberWord  = MEMBER_WORD[user?.tenant_type] || MEMBER_WORD.outro;
  const tipoLabel   = TENANT_TYPES.find(t => t.value === user?.tenant_type)?.label;
  const ramoLabel   = BUSINESS_SECTORS.find(b => b.value === accountInfo?.sector)?.label;
  const ultima      = analyses[0];

  return (
    <div className="page-body">
      <PageHeader subtitle={greeting} title="Início" />

      <div className="dash-grid">
        {[
          {
            label: memberWord,
            // Sem número informado o cartão vira um convite a preencher, em vez
            // de exibir um "0" que ninguém digitou.
            val: accountInfo?.memberCount ?? '—',
            sub: accountInfo?.memberCount == null ? 'informe em Ajustes' : `${tipoLabel || ''}${ramoLabel ? ` · ${ramoLabel}` : ''}`,
            icon: 'ti-users',
          },
          { label: 'Análises realizadas', val: total, sub: total ? 'desde o cadastro' : 'nenhuma ainda', icon: 'ti-file-text' },
          { label: 'Análises este mês', val: monthly, sub: `de ${limitLabel} no plano ${plan.label}`, icon: 'ti-chart-bar' },
          { label: 'Último período', val: ultima ? periodShort(ultima) : '—', sub: ultima ? new Date(ultima.created_at).toLocaleDateString('pt-BR') : 'sem análises', icon: 'ti-calendar' },
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
          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>Carregando…</div>
          ) : analyses.length ? (
            analyses.map(a => <AnalysisRow key={a.id} analysis={a} hideClient compact />)
          ) : (
            <EmptyNote>Nenhuma análise ainda.</EmptyNote>
          )}
        </div>

        <div className="dash-section">
          <div className="dash-section-head" style={{ marginBottom: 28 }}>
            <span className="dash-section-title">{tipoLabel ? `Resumo d${tipoLabel === 'Escritório' ? 'o' : 'a'} ${tipoLabel.toLowerCase()}` : 'Resumo da conta'}</span>
          </div>

          <div style={{ marginBottom: 20 }}>
            <div className="ty-label" style={{ marginBottom: 8 }}>Plano atual</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, fontWeight: 400, color: 'var(--t0)' }}>{plan.label}</div>
            <div className="s-meter-bar" style={{ marginTop: 10, height: 6, background: 'var(--bd)', borderRadius: 3 }}>
              <div style={{ height: '100%', background: 'var(--gold)', borderRadius: 3, width: `${pctUsed}%` }}></div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 8 }}>{monthly} de {limitLabel} análises usadas</div>
          </div>

          <div style={{ marginBottom: 20, marginTop: 32 }}>
            <div className="ty-label" style={{ marginBottom: 10 }}>Quem usa o sistema</div>
            <div style={{ display: 'flex' }}>
              {[
                { id: user.id, name: user.name, avatar: user.avatar, avatar_color: user.avatar_color },
                ...users.filter(u => u.id !== user.id),
              ].slice(0, 4).map((u, i) => (
                <div key={u.id} style={{ marginLeft: i > 0 ? -8 : 0, border: '2px solid var(--bg1)', borderRadius: 999 }}>
                  <UserAvatar user={u} size={36} />
                </div>
              ))}
            </div>
          </div>

          <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate('/app/settings#escritorio')}>
            Gerenciar conta
          </button>
        </div>
      </div>
    </div>
  );
}
