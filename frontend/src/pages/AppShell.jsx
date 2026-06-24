import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { getPlan } from '../lib/plans.js';
import UserAvatar from '../components/UserAvatar.jsx';

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AppShell() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [accountInfo, setAccountInfo] = useState(null);
  useEffect(() => { api.get('/account').then(setAccountInfo).catch(() => {}); }, []);
  if (!user) return null;
  const plan = getPlan(accountInfo?.plan || user.plan);
  const monthly = accountInfo?.monthlyAnalyses ?? 0;
  const pctUsed = plan.limit === Infinity ? 0 : Math.min(100, Math.round((monthly / plan.limit) * 100));
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
          <div className="s-office-label">Escritório</div>
          <div className="s-office-name">{user.tenant_name || 'Meu Escritório'}</div>
          <div className="s-office-plan">Plano {plan.label}</div>
        </div>

        <button className="s-cta" onClick={() => navigate('/app/analyses/new')}>
          <i className="ti ti-plus"></i> Nova análise
        </button>

        <nav className="s-nav">
          <NavLink to="/app/dashboard" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
            <i className="ti ti-home" aria-hidden="true"></i> Visão geral
          </NavLink>
          <NavLink to="/app/clients" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
            <i className="ti ti-building" aria-hidden="true"></i> Clientes
          </NavLink>
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
          <div className="s-card-analyses">
            <div className="s-meter-row">
              <span>Análises este mês</span>
              <span>{monthly}/{plan.limit === Infinity ? '∞' : plan.limit}</span>
            </div>
            <div className="s-meter-bar">
              <div className="s-meter-fill" style={{ width: `${pctUsed}%` }}></div>
            </div>
            {plan.limit !== Infinity && (
              <div className="s-upgrade">
                <i className="ti ti-sparkles"></i> Upgrade para Enterprise
              </div>
            )}
          </div>

          <div className="s-user">
            <UserAvatar user={user} size={36} />
            <div className="s-uname">
              <div className="s-uname-name">{user.name}</div>
              <div className="s-uname-email">{user.email}</div>
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
        <NavLink to="/app/clients" className={({ isActive }) => isActive ? 'active' : ''}>
          <i className="ti ti-building"></i> Clientes
        </NavLink>
        <button className="bottom-nav-cta" onClick={() => navigate('/app/analyses/new')}>
          <i className="ti ti-plus"></i>
        </button>
        <NavLink to="/app/analyses" className={({ isActive }) => isActive ? 'active' : ''}>
          <i className="ti ti-chart-bar"></i> Análises
        </NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => isActive ? 'active' : ''}>
          <i className="ti ti-settings"></i> Ajustes
        </NavLink>
      </nav>
    </div>
  );
}
