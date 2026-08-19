import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, setRefreshToken, getRefreshToken, ApiError } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Atualiza o state e notifica o ThemeProvider para trocar para o tema
  // salvo na conta deste usuário (ou null ao deslogar).
  function setUser(u) {
    setUserState(u);
    window.dispatchEvent(new CustomEvent('auth:user-changed', { detail: { userId: u?.id ?? null } }));
  }

  // Ao carregar o app, tenta recuperar a sessão se houver token salvo.
  useEffect(() => {
    const token = localStorage.getItem('finanalyze_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(d => setUser(d.user))
      .catch(() => { setToken(null); setRefreshToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  // Quando o interceptor de 401 esgota o refresh, derruba a sessão local
  // sem precisar que cada componente trate isso individualmente.
  useEffect(() => {
    function onSessionExpired() {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
    }
    window.addEventListener('auth:session-expired', onSessionExpired);
    return () => window.removeEventListener('auth:session-expired', onSessionExpired);
  }, []);

  async function login(email, password, onRetry) {
    const d = await api.post('/auth/login', { email, password }, { onRetry });
    setToken(d.token);
    setRefreshToken(d.refreshToken);
    setUser(d.user);
    return d.user;
  }

  async function register(payload, onRetry) {
    return await api.post('/auth/register', payload, { onRetry });
  }

  // Login com Google. Se o e-mail ainda não tiver conta, retorna
  // { needsSignup: true, name, email } em vez de autenticar.
  async function loginWithGoogle(accessToken) {
    const d = await api.post('/auth/google', { accessToken });
    if (d.needsSignup) return d;
    setToken(d.token);
    setRefreshToken(d.refreshToken);
    setUser(d.user);
    return d.user;
  }

  // Conclui o cadastro de um usuário novo vindo do login com Google,
  // criando o tenant (com tipo e setor) com o nome informado.
  async function completeGoogleSignup(accessToken, company, companyType, sector, termsAccepted) {
    const d = await api.post('/auth/google/complete', { accessToken, company, companyType, sector, terms_accepted: termsAccepted });
    setToken(d.token);
    setRefreshToken(d.refreshToken);
    setUser(d.user);
    return d.user;
  }

  // Login com Facebook. Se o e-mail ainda não tiver conta, retorna
  // { needsSignup: true, name, email } em vez de autenticar.
  async function loginWithFacebook(accessToken) {
    const d = await api.post('/auth/facebook', { accessToken });
    if (d.needsSignup) return d;
    setToken(d.token);
    setRefreshToken(d.refreshToken);
    setUser(d.user);
    return d.user;
  }

  // Conclui o cadastro de um usuário novo vindo do login com Facebook,
  // criando o tenant (com tipo e setor) com o nome informado.
  async function completeFacebookSignup(accessToken, company, companyType, sector, termsAccepted) {
    const d = await api.post('/auth/facebook/complete', { accessToken, company, companyType, sector, terms_accepted: termsAccepted });
    setToken(d.token);
    setRefreshToken(d.refreshToken);
    setUser(d.user);
    return d.user;
  }

  async function verifyEmail(userId, code) {
    const d = await api.post('/auth/verify-email', { userId, code });
    setToken(d.token);
    setRefreshToken(d.refreshToken);
    setUser(d.user);
    return d.user;
  }

  async function refresh() {
    try {
      const d = await api.get('/auth/me');
      setUser(d.user);
    } catch { /* ignora */ }
  }

  async function logout() {
    // Invalida o refresh token no servidor (fire-and-forget — não bloqueia o logout local).
    const refreshToken = getRefreshToken();
    api.post('/auth/logout', { refreshToken }).catch(() => {});
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  }

  function acceptInvite(token, userData, refreshToken) {
    setToken(token);
    setRefreshToken(refreshToken ?? null);
    setUser(userData);
  }

  return (
    <AuthCtx.Provider value={{
      user,
      loading,
      login,
      register,
      loginWithGoogle,
      completeGoogleSignup,
      loginWithFacebook,
      completeFacebookSignup,
      verifyEmail,
      logout,
      acceptInvite,
      refresh,
      isManager: user?.role === 'manager',
      isAdmin: user?.role === 'admin',
      isSingleEntity: !!user?.self_client_id,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}

export { ApiError };
