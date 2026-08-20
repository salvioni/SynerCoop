import { createContext, useCallback, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountInfo } from './accountInfo.jsx';
import { getPlan, trialStatus } from './plans.js';
import ConfirmModal from '../components/ConfirmModal.jsx';

const Ctx = createContext(() => {});

export const TRIAL_EXPIRADO_MSG =
  'Seus 7 dias de teste terminaram. As análises que você já fez continuam aqui para consulta e download — '
  + 'escolha um plano para voltar a criar análises.';

export function limiteMensalMsg(plan, used) {
  return `Você já usou ${used} de ${plan.limit} análises deste mês no plano ${plan.label}. `
       + 'Faça upgrade para continuar ou aguarde a virada do mês.';
}

/**
 * Porta de entrada da "Nova análise".
 *
 * Quando o limite do plano já foi atingido, não faz sentido levar a pessoa
 * para uma tela de upload que ela não pode usar: o aviso aparece sobre a tela
 * em que ela está, com o fundo escurecido, do mesmo jeito que o convite de
 * membro — ela lê, decide, e continua de onde estava.
 */
export function NewAnalysisGate({ children }) {
  const navigate = useNavigate();
  const { accountInfo } = useAccountInfo();
  const [blocked, setBlocked] = useState(null);

  const start = useCallback(() => {
    const plan = getPlan(accountInfo?.plan);
    const used = accountInfo?.monthlyAnalyses ?? 0;
    // Teste vencido vem primeiro: a conta está em somente leitura, então nem
    // faz sentido falar de cota mensal.
    if (trialStatus(accountInfo)?.expirado) {
      setBlocked({ titulo: 'Teste grátis encerrado', msg: TRIAL_EXPIRADO_MSG });
      return;
    }
    if (plan.limit !== Infinity && used >= plan.limit) {
      setBlocked({ titulo: 'Limite de análises atingido', msg: limiteMensalMsg(plan, used) });
      return;
    }
    navigate('/app/analyses/new');
  }, [accountInfo, navigate]);

  return (
    <Ctx.Provider value={start}>
      {children}
      {blocked && (
        <ConfirmModal
          title={blocked.titulo}
          message={blocked.msg}
          confirmLabel="Ver planos"
          cancelLabel="Entendi"
          onConfirm={() => navigate('/app/settings')}
          onClose={() => setBlocked(null)}
        />
      )}
    </Ctx.Provider>
  );
}

export const useNewAnalysis = () => useContext(Ctx);
