import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { authRequired } from '../middleware/auth.js';
import { badRequest, trim } from '../lib/validate.js';
import { audit, ACTIONS } from '../lib/audit.js';

const router = Router();

router.get('/', authRequired, async (req, res, next) => {
  try {
    const tenant = await db.prepare('SELECT name, plan FROM tenants WHERE id = ?').get(req.user.tenant_id);
    const clientCount = await db.prepare('SELECT COUNT(*) AS cnt FROM clients WHERE tenant_id = ? AND active = 1').get(req.user.tenant_id);
    const analysisCount = await db.prepare(`
      SELECT COUNT(*) AS cnt FROM analyses a
      JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ?
    `).get(req.user.tenant_id);
    res.json({
      companyName: tenant?.name || '',
      plan: tenant?.plan || null,
      activeClients: clientCount?.cnt || 0,
      totalAnalyses: analysisCount?.cnt || 0,
    });
  } catch (e) { next(e); }
});

router.post('/change-password', authRequired, async (req, res, next) => {
  try {
    const current = req.body?.current || '';
    const next_ = req.body?.next || '';

    if (!current) throw badRequest('Informe a senha atual.', { current: 'Campo obrigatório.' });
    if (!next_) throw badRequest('Informe a nova senha.', { next: 'Campo obrigatório.' });
    if (next_.length < 8) throw badRequest('Senha nova muito curta.', { next: 'Mínimo 8 caracteres.' });

    const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const ok = await bcrypt.compare(current, row.password_hash);
    if (!ok) throw badRequest('Senha atual incorreta.', { current: 'Senha incorreta.' });

    const hash = await bcrypt.hash(next_, 12);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    await audit(req, ACTIONS.PW_CHANGED, { targetType: 'user', targetId: req.user.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
