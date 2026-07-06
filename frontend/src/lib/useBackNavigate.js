import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// navigate(-1) não faz nada (ou sai da SPA) quando a página é a primeira
// entrada do histórico da aba — ex.: link direto/aberto em nova aba, favorito,
// ou recarregada. React Router marca essa entrada com location.key === 'default',
// então caímos para um destino fixo nesse caso; do contrário voltamos de fato
// para a página anterior, de onde quer que o usuário tenha vindo.
export function useBackNavigate(fallback) {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    if (location.key === 'default') navigate(fallback);
    else navigate(-1);
  }, [navigate, location.key, fallback]);
}
