// Helpers de data compartilhados por rotas que calculam janelas de uso
// mensal (limite de plano em clients.js, dashboard em stats.js e account.js).
// Centralizados aqui para as três rotas nunca divergirem sobre o que
// significa "início do mês".

export function startOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function monthsAgoISO(n) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, 1).toISOString();
}
