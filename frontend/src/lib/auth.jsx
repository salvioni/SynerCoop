import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, ApiError } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Ao carregar o app, tenta recuperar a sessão se houver token salvo.
  useEffect(() => {
    const token = localStorage.getItem('finanalyze_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(d => setUser(d.user))
      .catch(() => { setToken(null); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const d = await api.post('/auth/login', { email, password });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }

  async function register(payload) {
    return await api.post('/auth/register', payload);
  }

  // Login com Google. Se o e-mail ainda não tiver conta, retorna
  // { needsSignup: true, name, email } em vez de autenticar.
  async function loginWithGoogle(accessToken) {
    const d = await api.post('/auth/google', { accessToken });
    if (d.needsSignup) return d;
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }

  // Conclui o cadastro de um usuário novo vindo do login com Google,
  // criando o tenant (com tipo e setor) com o nome informado.
  async function completeGoogleSignup(accessToken, company, companyType, sector) {
    const d = await api.post('/auth/google/complete', { accessToken, company, companyType, sector });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }

  // Login com Facebook. Se o e-mail ainda não tiver conta, retorna
  // { needsSignup: true, name, email } em vez de autenticar.
  async function loginWithFacebook(accessToken) {
    const d = await api.post('/auth/facebook', { accessToken });
    if (d.needsSignup) return d;
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }

  // Conclui o cadastro de um usuário novo vindo do login com Facebook,
  // criando o tenant (com tipo e setor) com o nome informado.
  async function completeFacebookSignup(accessToken, company, companyType, sector) {
    const d = await api.post('/auth/facebook/complete', { accessToken, company, companyType, sector });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }

  async function verifyEmail(userId, code) {
    const d = await api.post('/auth/verify-email', { userId, code });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  }

  async function refresh() {
    try {
      const d = await api.get('/auth/me');
      setUser(d.user);
    } catch { /* ignora */ }
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  function acceptInvite(token, userData) {
    setToken(token);
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
