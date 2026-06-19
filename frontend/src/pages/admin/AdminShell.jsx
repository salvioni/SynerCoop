import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';

function initials(name) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  function doLogout() { logout(); navigate('/login', { replace: true }); }
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="s-logo">
          <div className="s-badge">S</div>
          <span className="s-name">Admin</span>
        </div>
        <nav className="s-nav">
          <div className="s-sect">Sistema</div>
          <NavLink to="/admin/tenants" className={({ isActive }) => `s-link${isActive ? ' active' : ''}`}>
            <i className="ti ti-building" aria-hidden="true"></i> Tenants
          </NavLink>
          <div className="sep"></div>
          <NavLink to="/app/clients" className="s-link">
            <i className="ti ti-arrow-left" aria-hidden="true"></i> Ir para App
          </NavLink>
        </nav>
        <div className="s-foot">
          <div className="s-user">
            <div className="s-av">{initials(user.name)}</div>
            <span className="s-uname">{user.name}</span>
            <button className="s-logout" onClick={doLogout} title="Sair">
              <i className="ti ti-logout" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}
