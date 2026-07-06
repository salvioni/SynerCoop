import { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'synercoop-theme';
const ThemeCtx = createContext({ theme: 'light', setTheme: () => {} });

function applyTheme(theme) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('theme-dark', isDark);
}

// Chamado antes do React montar para evitar flash de tema errado
export function initTheme() {
  const theme = localStorage.getItem(KEY) || 'light';
  applyTheme(theme);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Migrar chaves antigas
    const old = localStorage.getItem('fa_theme') || localStorage.getItem('finanalyze-theme');
    if (old) { localStorage.removeItem('fa_theme'); localStorage.removeItem('finanalyze-theme'); }
    return localStorage.getItem(KEY) || old || 'light';
  });

  useEffect(() => {
    localStorage.setItem(KEY, theme);
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
