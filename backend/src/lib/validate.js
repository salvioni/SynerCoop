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

export function notFound(message = 'Não encontrado.') {
  return new HttpError(404, message);
}
