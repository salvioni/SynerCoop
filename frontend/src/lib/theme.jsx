import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const GLOBAL_KEY = 'synercoop-theme';
const ThemeCtx = createContext({ theme: 'light', setTheme: () => {} });

function resolveDark(theme) {
  if (theme === 'dark') return true;
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
}

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

/**
 * O tema escuro é uma preferência de trabalho, de quem passa o dia dentro do
 * sistema. As telas públicas — site, login, cadastro, recuperação de senha —
 * são a cara da marca e existem numa versão só, a clara: elas precisam sair
 * iguais em qualquer navegador, e não faz sentido a página de login herdar a
 * escolha da última pessoa que usou aquele computador.
 */
function areaEscura(pathname) {
  return pathname.startsWith('/app') || pathname.startsWith('/admin');
}

function applyTheme(theme, pathname = window.location.pathname) {
  const dark = areaEscura(pathname) && resolveDark(theme);
  document.documentElement.classList.toggle('theme-dark', dark);
}

// Chamado antes do React montar para evitar flash de tema errado
export function initTheme() {
  applyTheme(localStorage.getItem(GLOBAL_KEY) || 'light');
}

export function ThemeProvider({ children }) {
  const { pathname } = useLocation();
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

  // Depende também da rota: sair da conta leva pro /login, que é área clara,
  // e voltar pro /app restaura a preferência sem precisar recarregar.
  useEffect(() => {
    applyTheme(theme, pathname);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system', pathname);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme, pathname]);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
