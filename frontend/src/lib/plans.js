// Fonte única dos planos — usada tanto pelas telas que exibem o plano atual
// (Dashboard, Settings, AppShell) quanto pelas telas de venda/seleção
// (Landing, SelectPlan), para as duas nunca descreverem os planos de forma
// divergente.
export const PLANS = {
  trial: {
    key: 'trial', label: 'Teste grátis', price: 'R$ 0', priceNum: 0, limit: 3,
    trialDays: 7,
    desc: '7 dias para conhecer a plataforma.',
    feats: ['7 dias grátis', 'Até 3 análises', '1 empresa', '1 usuário'],
    cta: 'Começar teste grátis',
    // Depois dos 7 dias a conta não some: fica em somente leitura, com as
    // análises e os relatórios acessíveis até a assinatura (ver trialAtivo no
    // backend). O texto abaixo é o que a UI mostra quando isso acontece.
    expiredNote: 'Teste encerrado — suas análises seguem disponíveis para consulta.',
  },
  pro: {
    key: 'pro', label: 'Pro', price: 'R$ 297', priceNum: 297, limit: 100,
    desc: 'Para quem analisa todo mês.',
    feats: ['100 análises/mês', 'Clientes ilimitados', 'Até 5 usuários', 'Relatório personalizado', 'Exportação Word e Excel'],
    highlight: true, cta: 'Assinar Pro',
  },
  enterprise: {
    key: 'enterprise', label: 'Enterprise', price: 'Sob consulta', priceNum: null, limit: Infinity,
    desc: 'Para grandes operações.',
    feats: ['Análises ilimitadas', 'Usuários ilimitados', 'API + integrações', 'Suporte dedicado'],
    cta: 'Fale conosco',
  },
};

export const PLAN_ORDER = ['trial', 'pro', 'enterprise'];

export function getPlan(key) {
  return PLANS[key] || PLANS.trial;
}

/**
 * Estado do teste grátis, derivado do que o servidor manda em /account.
 *
 * O servidor é quem decide se venceu (`trialExpired`) — o relógio do navegador
 * pode estar errado ou adiantado de propósito. Aqui só se traduz aquilo em
 * texto e num aviso de "está acabando".
 */
export function trialStatus(info) {
  if (!info || info.plan !== 'trial') return null;
  const dias = info.trialDaysLeft;
  const expirado = !!info.trialExpired;
  return {
    expirado,
    dias,
    acabando: !expirado && dias != null && dias <= 2,
    texto: expirado
      ? 'Teste encerrado'
      : dias == null ? 'Teste grátis'
      : dias === 0 ? 'Último dia do teste'
      : dias === 1 ? 'Falta 1 dia de teste'
      : `Faltam ${dias} dias de teste`,
  };
}
