import { verifyToken } from '../lib/jwt.js';
import { db } from '../lib/db.js';
import { unauthorized, forbidden } from '../lib/validate.js';

export async function authRequired(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(unauthorized('Token ausente.'));
    const payload = verifyToken(token);
    if (!payload) return next(unauthorized('Token inválido ou expirado.'));
    const user = await db.prepare(`
      SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.email_verified, t.plan, t.active AS tenant_active
      FROM users u
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = ?
    `).get(payload.uid);
    if (!user) return next(unauthorized('Usuário não existe.'));
    if (!user.email_verified) return next(forbidden('E-mail não verificado.'));
    if (user.tenant_id && user.tenant_active === 0) return next(forbidden('Este tenant está desativado. Entre em contato com o suporte.'));
    req.user = user;
    next();
  } catch (e) { next(e); }
}

export function managerOnly(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'manager') return next(forbidden('Apenas gerentes podem realizar esta ação.'));
  next();
}

export function adminOnly(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Acesso restrito ao administrador do sistema.'));
  next();
}
