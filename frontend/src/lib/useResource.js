import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useResource(path, selector = r => r) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get(path)
      .then(r => setData(selector(r)))
      .catch(e => setError(e.message || 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
