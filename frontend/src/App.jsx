import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';
import AppShell from './pages/AppShell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import ClientView from './pages/ClientView.jsx';
import AnalysisView from './pages/AnalysisView.jsx';
import AnalysesList from './pages/AnalysesList.jsx';
import Users from './pages/Users.jsx';
import Account from './pages/Account.jsx';
import Settings from './pages/Settings.jsx';
import AdminShell from './pages/admin/AdminShell.jsx';
import AdminTenants from './pages/admin/AdminTenants.jsx';
import Landing from './pages/Landing.jsx';

function Guard({ children, admin }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/app/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/app" element={<Guard><AppShell /></Guard>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientView />} />
        <Route path="analyses" element={<AnalysesList />} />
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
