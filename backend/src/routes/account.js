import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { db } from '../lib/db.js';
import { authRequired, managerOnly, planExempt } from '../middleware/auth.js';
import { badRequest, trim } from '../lib/validate.js';
import { audit, ACTIONS } from '../lib/audit.js';
import { startOfMonthISO } from '../lib/date.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const router = Router();

router.get('/', planExempt, authRequired, async (req, res, next) => {
  try {
    const tenant = await db.prepare('SELECT name, plan FROM tenants WHERE id = ?').get(req.user.tenant_id);
    const clientCount = await db.prepare('SELECT COUNT(*) AS cnt FROM clients WHERE tenant_id = ? AND active = 1').get(req.user.tenant_id);
    const analysisCount = await db.prepare(`
      SELECT COUNT(*) AS cnt FROM analyses a
      JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ?
    `).get(req.user.tenant_id);
    const monthlyCount = await db.prepare(`
      SELECT COUNT(*) AS cnt FROM analyses a
      JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ? AND a.created_at >= ?
    `).get(req.user.tenant_id, startOfMonthISO());
    res.json({
      companyName: tenant?.name || '',
      // null (não 'trial') enquanto o tenant ainda não escolheu um plano —
      // esta rota é acessível antes da escolha (ver PLAN_EXEMPT_ROUTES em
      // middleware/auth.js), então mentir aqui esconderia esse estado.
      plan: tenant?.plan || null,
      activeClients: clientCount?.cnt || 0,
      totalAnalyses: analysisCount?.cnt || 0,
      monthlyAnalyses: monthlyCount?.cnt || 0,
    });
  } catch (e) { next(e); }
});

// POST /account/select-plan — única forma de entrar no plano trial sem
// passar pelo checkout do Stripe. Planos pagos são definidos pelo webhook
// do Stripe (ver routes/stripe.js) após a assinatura ser confirmada.
router.post('/select-plan', planExempt, authRequired, managerOnly, async (req, res, next) => {
  try {
    if (req.body?.plan !== 'trial') throw badRequest('Plano inválido.');
    if (req.user.plan) throw badRequest('Este escritório já tem um plano ativo.');

    await db.prepare(`UPDATE tenants SET plan = 'trial', onboarded_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.user.tenant_id);
    await audit(req, ACTIONS.PLAN_SELECTED, { targetType: 'tenant', targetId: req.user.tenant_id, meta: { plan: 'trial' } });
    res.json({ ok: true, plan: 'trial' });
  } catch (e) { next(e); }
});

router.patch('/', authRequired, async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    if (!name) throw badRequest('Nome do escritório é obrigatório.', { name: 'Campo obrigatório.' });
    await db.prepare('UPDATE tenants SET name = ? WHERE id = ?').run(name, req.user.tenant_id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.patch('/profile', authRequired, async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    if (!name || name.length < 3) throw badRequest('Nome muito curto.', { name: 'Mínimo 3 caracteres.' });
    await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/avatar', authRequired, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('Nenhuma imagem enviada.');
    if (!req.file.mimetype.startsWith('image/')) throw badRequest('Arquivo precisa ser uma imagem.');
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(base64, req.user.id);
    res.json({ avatar: base64 });
  } catch (e) { next(e); }
});

router.patch('/avatar-color', authRequired, async (req, res, next) => {
  try {
    const color = req.body?.color;
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) throw badRequest('Cor inválida.');
    await db.prepare('UPDATE users SET avatar_color = ?, avatar = NULL WHERE id = ?').run(color, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/avatar', authRequired, async (req, res, next) => {
  try {
    await db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
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
