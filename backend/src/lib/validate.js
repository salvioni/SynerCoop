// Validações compartilhadas entre cliente e servidor.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s) {
  return typeof s === 'string' && EMAIL_RE.test(s.trim());
}

export function trim(s) {
  return typeof s === 'string' ? s.trim() : '';
}

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

export function badRequest(message, fields) {
  return new HttpError(400, message, fields);
}

export function unauthorized(message = 'Não autorizado.') {
  return new HttpError(401, message);
}

export function forbidden(message = 'Acesso negado.') {
  return new HttpError(403, message);
}

export function paymentRequired(message = 'Escolha um plano para continuar.') {
  return new HttpError(402, message, { code: 'PLAN_REQUIRED' });
}

/**
 * Teste vencido. Código próprio, e não PLAN_REQUIRED: o front redireciona
 * PLAN_REQUIRED para /select-plan, que é a tela de quem ainda não escolheu
 * plano nenhum — mandar pra lá quem já teve um teste seria dar a volta errada.
 */
export function trialExpired(message) {
  return new HttpError(402, message, { code: 'TRIAL_EXPIRED' });
}

export function notFound(message = 'Não encontrado.') {
  return new HttpError(404, message);
}
