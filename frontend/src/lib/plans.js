// Fonte única dos planos — usada tanto pelas telas que exibem o plano atual
// (Dashboard, Settings, AppShell) quanto pelas telas de venda/seleção
// (Landing, SelectPlan), para as duas nunca descreverem os planos de forma
// divergente.
export const PLANS = {
  trial: {
    key: 'trial', label: 'Free', price: 'R$ 0', priceNum: 0, limit: 3,
    desc: 'Para testar com 1 ou 2 clientes.',
    feats: ['3 análises por mês', '1 usuário', 'Relatório padrão'],
    cta: 'Começar grátis',
  },
  pro: {
    key: 'pro', label: 'Pro', price: 'R$ 297', priceNum: 297, limit: 100,
    desc: 'Para escritórios em operação.',
    feats: ['100 análises/mês', 'Até 5 usuários', 'Relatório personalizado', 'Exportação PDF/Word'],
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
