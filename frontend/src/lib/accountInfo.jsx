import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AccountInfoContext = createContext(null);

// Dados de plano/uso da conta (plano atual, análises do mês, etc.), buscados
// uma vez e mantidos vivos enquanto o usuário estiver em /app/*. Componentes
// que executam uma ação capaz de mudar esses números (ex.: criar uma análise,
// trocar de plano) devem chamar refetch() explicitamente depois da ação —
// isso evita tanto dado desatualizado (a contagem só mudando no próximo
// F5) quanto refetch cego a cada navegação (que gera uma requisição a cada
// clique de menu sem necessidade, já que navegar sozinho nunca muda esses números).
export function AccountInfoProvider({ children }) {
  const [accountInfo, setAccountInfo] = useState(null);

  const refetch = useCallback(() => api.get('/account').then(setAccountInfo).catch(() => {}), []);

  useEffect(() => { refetch(); }, [refetch]);

  return (
    <AccountInfoContext.Provider value={{ accountInfo, refetch }}>
      {children}
    </AccountInfoContext.Provider>
  );
}

export function useAccountInfo() {
  const ctx = useContext(AccountInfoContext);
  if (!ctx) throw new Error('useAccountInfo() precisa estar dentro de um <AccountInfoProvider>.');
  return ctx;
}
