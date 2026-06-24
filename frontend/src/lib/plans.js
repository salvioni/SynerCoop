export const PLANS = {
  trial: { label: 'Free', price: 'R$ 0', priceNum: 0, limit: 3 },
  pro:   { label: 'Pro', price: 'R$ 297', priceNum: 297, limit: 100 },
  enterprise: { label: 'Enterprise', price: 'Sob consulta', priceNum: null, limit: Infinity },
};

export function getPlan(key) {
  return PLANS[key] || PLANS.trial;
}
