import { useEffect } from 'react';

export function useEscapeKey(onEscape) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onEscape?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEscape]);
}
