// Limites mensais de análises por plano.
// O plano 'basic' (10/mês) é o intermediário entre trial e pro.
// Enterprise não tem limite — verificado como Infinity nos gates de acesso.
export const PLAN_LIMITS = {
  trial:      3,
  basic:      10,
  pro:        100,
  enterprise: Infinity,
};

// Nomes de exibição dos planos (usado em mensagens de erro e UI).
export const PLAN_LABELS = {
  trial:      'Trial',
  basic:      'Basic',
  pro:        'Pro',
  enterprise: 'Enterprise',
};

/**
 * Retorna o limite mensal de análises para um plano.
 * Planos desconhecidos (null, undefined, string inválida) caem no limite do Trial.
 */
export function getMonthlyLimit(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;
}
