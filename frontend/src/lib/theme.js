import { useEffect, useState } from 'react';

const KEY = 'finanalyze-theme';
const MQ = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'auto' && MQ.matches);
  document.documentElement.classList.toggle('theme-dark', dark);
}

export function initTheme() {
  const pref = localStorage.getItem(KEY) || 'auto';
  applyTheme(pref);
  MQ.addEventListener('change', () => {
    const current = localStorage.getItem(KEY) || 'auto';
    if (current === 'auto') applyTheme('auto');
  });
}

export function useTheme() {
  const [pref, setPref] = useState(() => localStorage.getItem(KEY) || 'auto');

  useEffect(() => {
    localStorage.setItem(KEY, pref);
    applyTheme(pref);
  }, [pref]);

  return { pref, setPref };
}
