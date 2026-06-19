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
      verifyEmail,
      logout,
      acceptInvite,
      refresh,
      isManager: user?.role === 'manager',
      isAdmin: user?.role === 'admin',
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
