import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AppShell() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
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
          <div className="s-office-plan">Plano Pro</div>
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
          <NavLink to="/app/analyses" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
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
              <span>18/100</span>
            </div>
            <div className="s-meter-bar">
              <div className="s-meter-fill" style={{ width: '18%' }}></div>
            </div>
            <div className="s-upgrade">
              <i className="ti ti-sparkles"></i> Upgrade para Enterprise
            </div>
          </div>

          <div className="s-user">
            <div className="s-av">{initials(user.name)}</div>
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
