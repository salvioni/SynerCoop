import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import Login from './pages/Login.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import SelectPlan from './pages/SelectPlan.jsx';
import AppShell from './pages/AppShell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import ClientView from './pages/ClientView.jsx';
import AnalysisView from './pages/AnalysisView.jsx';
import AnalysesList from './pages/AnalysesList.jsx';
import Users from './pages/Users.jsx';
import Account from './pages/Account.jsx';
import Settings from './pages/Settings.jsx';
import NewAnalysis from './pages/NewAnalysis.jsx';
import AdminShell from './pages/admin/AdminShell.jsx';
import AdminTenants from './pages/admin/AdminTenants.jsx';
import Landing from './pages/Landing.jsx';

function Guard({ children, admin }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/app/dashboard" replace />;
  if (!admin && user.tenant_id && !user.plan) return <Navigate to="/select-plan" replace />;
  return children;
}

// Só acessível por quem já verificou o e-mail mas ainda não escolheu um
// plano — quem já tem plano ativo cai direto no dashboard.
function PlanGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  if (user.tenant_id && user.plan) return <Navigate to="/app/dashboard" replace />;
  return children;
}

// Contas de entidade única (cooperativa/empresa/associação/outro) não têm
// carteira de clientes — a rota /app/clients não se aplica a elas.
function SingleEntityGuard({ children }) {
  const { isSingleEntity } = useAuth();
  if (isSingleEntity) return <Navigate to="/app/dashboard" replace />;
  return children;
}

// Quem já está logado não deve ver login/cadastro — evita criar uma conta
// nova por engano enquanto já existe uma sessão ativa.
function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/app/dashboard'} replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/select-plan" element={<PlanGuard><SelectPlan /></PlanGuard>} />
      <Route path="/app" element={<Guard><AppShell /></Guard>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<SingleEntityGuard><Clients /></SingleEntityGuard>} />
        <Route path="clients/:id" element={<SingleEntityGuard><ClientView /></SingleEntityGuard>} />
        <Route path="analyses" element={<AnalysesList />} />
        <Route path="analyses/new" element={<NewAnalysis />} />
        <Route path="analyses/:id" element={<AnalysisView />} />
        <Route path="users" element={<Users />} />
        <Route path="account" element={<Account />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/admin" element={<Guard admin><AdminShell /></Guard>}>
        <Route index element={<Navigate to="tenants" replace />} />
        <Route path="tenants" element={<AdminTenants />} />
      </Route>
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </ThemeProvider>
  );
}
