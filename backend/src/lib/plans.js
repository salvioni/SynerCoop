// Fonte única dos limites de plano no servidor.
//
// O 'basic' (10/mês) é o intermediário entre trial e pro. Enterprise não tem
// teto — verificado como Infinity nos gates de acesso.
export const PLAN_LIMITS = {
  trial:      3,
  basic:      10,
  pro:        100,
  enterprise: Infinity,
};

// Quantos usuários e quantas empresas cada plano comporta. `Infinity` = sem
// trava. Hoje só o teste é limitado: o Pro anuncia "até 5 usuários" na página
// de planos, mas isso ainda é promessa comercial, não regra do servidor —
// deixar Infinity aqui é a leitura honesta do que o código faz.
export const PLAN_USERS = {
  trial: 1,
  basic: Infinity,
  pro: Infinity,
  enterprise: Infinity,
};

export const PLAN_CLIENTS = {
  trial: 1,
  basic: Infinity,
  pro: Infinity,
  enterprise: Infinity,
};

// Duração do teste gratuito, em dias.
export const TRIAL_DAYS = 7;

// Nomes de exibição dos planos (usado em mensagens de erro e UI).
export const PLAN_LABELS = {
  trial:      'Teste grátis',
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

export function getUserLimit(plan) {
  return PLAN_USERS[plan] ?? PLAN_USERS.trial;
}

export function getClientLimit(plan) {
  return PLAN_CLIENTS[plan] ?? PLAN_CLIENTS.trial;
}

/**
 * Data em que o teste de um tenant termina, a partir da criação da conta.
 * Devolve um ISO string — o mesmo formato que o resto do schema usa.
 */
export function trialEndFrom(createdAt) {
  const base = createdAt ? new Date(createdAt) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(d.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * O teste acabou?
 *
 * Só vale para quem está no plano 'trial' — assinar move o tenant para outro
 * plano e a data deixa de importar. Sem data registrada (contas criadas antes
 * desta regra) o teste é tratado como ativo: derrubar retroativamente quem já
 * usava o sistema seria pior do que dar alguns dias a mais.
 */
export function trialExpirado(tenant) {
  if (!tenant || tenant.plan !== 'trial') return false;
  if (!tenant.trial_ends_at) return false;
  return new Date(tenant.trial_ends_at).getTime() <= Date.now();
}

/** Dias inteiros que faltam para o fim do teste (0 = último dia). */
export function diasRestantesTrial(tenant) {
  if (!tenant || tenant.plan !== 'trial' || !tenant.trial_ends_at) return null;
  const ms = new Date(tenant.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
