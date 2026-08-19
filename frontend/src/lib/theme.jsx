import { createContext, useContext, useEffect, useState } from 'react';

const GLOBAL_KEY = 'synercoop-theme';
const ThemeCtx = createContext({ theme: 'light', setTheme: () => {} });

function userKey(userId) {
  return userId ? `synercoop-theme-u${userId}` : GLOBAL_KEY;
}

function getStoredTheme(userId) {
  // Prefere a preferência específica do usuário; cai na global como fallback
  return (
    (userId && localStorage.getItem(userKey(userId))) ||
    localStorage.getItem(GLOBAL_KEY) ||
    'light'
  );
}

function applyTheme(theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('theme-dark', isDark);
}

// Chamado antes do React montar para evitar flash de tema errado
export function initTheme() {
  applyTheme(localStorage.getItem(GLOBAL_KEY) || 'light');
}

export function ThemeProvider({ children }) {
  const [userId, setUserId] = useState(null);
  const [theme, setThemeState] = useState(() => {
    // Migrar chaves antigas
    const old = localStorage.getItem('fa_theme') || localStorage.getItem('finanalyze-theme');
    if (old) { localStorage.removeItem('fa_theme'); localStorage.removeItem('finanalyze-theme'); }
    return localStorage.getItem(GLOBAL_KEY) || old || 'light';
  });

  // Ouve login/logout vindos de auth.jsx e aplica a preferência de tema
  // específica da conta, isolando a escolha de cada usuário no dispositivo.
  useEffect(() => {
    function onUserChanged(e) {
      const uid = e.detail?.userId ?? null;
      setUserId(uid);
      setThemeState(getStoredTheme(uid));
    }
    window.addEventListener('auth:user-changed', onUserChanged);
    return () => window.removeEventListener('auth:user-changed', onUserChanged);
  }, []);

  function setTheme(t) {
    // Salva na chave do usuário e também na global (fallback pré-login)
    if (userId) localStorage.setItem(userKey(userId), t);
    localStorage.setItem(GLOBAL_KEY, t);
    setThemeState(t);
  }

  useEffect(() => {
    applyTheme(theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
