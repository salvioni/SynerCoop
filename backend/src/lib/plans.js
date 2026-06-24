export const PLAN_LIMITS = {
  trial: 3,
  pro: 100,
  enterprise: Infinity,
};

export function getMonthlyLimit(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
}
