import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useAccountInfo } from '../lib/accountInfo.jsx';
import { getPlan, trialStatus } from '../lib/plans.js';
import { TENANT_TYPES } from '../lib/constants.js';
import UserAvatar from '../components/UserAvatar.jsx';
import { NewAnalysisGate, useNewAnalysis } from '../lib/newAnalysis.jsx';

export default function AppShell() {
  // O portão precisa envolver a casca inteira: o aviso de limite atingido é um
  // modal sobre a tela atual, e tanto a lateral quanto as páginas de dentro
  // disparam "Nova análise".
  return (
    <NewAnalysisGate>
      <Shell />
    </NewAnalysisGate>
  );
}

function Shell() {
  const { user, logout, isAdmin, isSingleEntity } = useAuth();
  const navigate = useNavigate();
  const { accountInfo } = useAccountInfo();
  const novaAnalise = useNewAnalysis();
  if (!user) return null;
  const plan = getPlan(accountInfo?.plan || user.plan);
  const trial = trialStatus(accountInfo);
  const tenantTypeLabel = TENANT_TYPES.find(t => t.value === user.tenant_type)?.label;
  function doLogout() { logout(); navigate('/login', { replace: true }); }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="s-logo">
          <div className="s-badge">S</div>
          <div className="s-brand">
            <span className="s-name">SynerCoop</span>
            <span className="s-tagline">SINERGIA COOPERATIVA</span>
          </div>
        </div>

        <div className="s-office">
          <div className="s-office-label">{tenantTypeLabel || 'Escritório'}</div>
          <div className="s-office-name">{accountInfo?.companyName || user.tenant_name || 'Meu Escritório'}</div>
          {/* No teste, a contagem regressiva importa mais que o nome do plano:
              é o que responde "quanto tempo eu ainda tenho". */}
          <div className={`s-office-plan${trial?.acabando || trial?.expirado ? ' s-office-plan-alerta' : ''}`}>
            {trial ? trial.texto : `Plano ${plan.label}`}
          </div>
        </div>

        <button className="s-cta" onClick={novaAnalise}>
          <i className="ti ti-plus"></i> Nova análise
        </button>

        <nav className="s-nav">
          <NavLink to="/app/dashboard" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
            <i className="ti ti-home" aria-hidden="true"></i> Início
          </NavLink>
          {isSingleEntity ? (
            <NavLink to="/app/desempenho" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
              <i className="ti ti-chart-histogram" aria-hidden="true"></i> Desempenho
            </NavLink>
          ) : (
            <NavLink to="/app/clients" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
              <i className="ti ti-building" aria-hidden="true"></i> Clientes
            </NavLink>
          )}
          <NavLink to="/app/analyses" end className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
            <i className="ti ti-chart-bar" aria-hidden="true"></i> Análises
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
            <i className="ti ti-settings" aria-hidden="true"></i> Ajustes
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin/tenants" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
              <i className="ti ti-shield" aria-hidden="true"></i> Admin
            </NavLink>
          )}
        </nav>

        <div className="s-foot">
          <div className="s-user">
            <UserAvatar user={user} size={36} />
            <div className="s-uname">
              <div className="s-uname-name">{user.name}</div>
            </div>
            <button className="s-logout" onClick={doLogout} title="Sair">
              <i className="ti ti-logout" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>

      <nav className="bottom-nav">
        <NavLink to="/app/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
          <i className="ti ti-home"></i> Início
        </NavLink>
        {isSingleEntity ? (
          <NavLink to="/app/desempenho" className={({ isActive }) => isActive ? 'active' : ''}>
            <i className="ti ti-chart-histogram"></i> Desempenho
          </NavLink>
        ) : (
          <NavLink to="/app/clients" className={({ isActive }) => isActive ? 'active' : ''}>
            <i className="ti ti-building"></i> Clientes
          </NavLink>
        )}
        <button className="bottom-nav-cta" onClick={novaAnalise}>
          <i className="ti ti-plus"></i>
        </button>
        {/* `end` para /app/analyses/new (o botão + do meio) não acender também
            este item — sem ele o NavLink casa por prefixo. O menu lateral já
            fazia isso; aqui estava faltando. */}
        <NavLink to="/app/analyses" end className={({ isActive }) => isActive ? 'active' : ''}>
          <i className="ti ti-chart-bar"></i> Análises
        </NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => isActive ? 'active' : ''}>
          <i className="ti ti-settings"></i> Ajustes
        </NavLink>
      </nav>
    </div>
  );
}
