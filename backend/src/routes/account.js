import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { db } from '../lib/db.js';
import { authRequired, managerOnly, planExempt } from '../middleware/auth.js';
import { badRequest, trim, isValidEmail } from '../lib/validate.js';
import { audit, ACTIONS } from '../lib/audit.js';
import { startOfMonthISO } from '../lib/date.js';
import { stripe } from '../lib/stripe.js';
import logger from '../lib/logger.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const router = Router();

router.get('/', planExempt, authRequired, async (req, res, next) => {
  try {
    const tenant = await db.prepare('SELECT name, plan, logo, cnpj, phone, billing_email FROM tenants WHERE id = ?').get(req.user.tenant_id);
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
      logo: tenant?.logo || null,
      cnpj: tenant?.cnpj || '',
      phone: tenant?.phone || '',
      billingEmail: tenant?.billing_email || '',
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
    const cnpj = trim(req.body?.cnpj) || null;
    const phone = trim(req.body?.phone) || null;
    const billingEmail = trim(req.body?.billingEmail) || null;
    if (!name) throw badRequest('Nome do escritório é obrigatório.', { name: 'Campo obrigatório.' });
    if (billingEmail && !isValidEmail(billingEmail)) throw badRequest('E-mail de cobrança inválido.', { billingEmail: 'E-mail inválido.' });

    const tenant = await db.prepare('SELECT stripe_customer_id, billing_email FROM tenants WHERE id = ?').get(req.user.tenant_id);
    await db.prepare('UPDATE tenants SET name = ?, cnpj = ?, phone = ?, billing_email = ? WHERE id = ?')
      .run(name, cnpj, phone, billingEmail, req.user.tenant_id);

    // Mantém o customer no Stripe sincronizado — sem isso, editar aqui não
    // teria efeito real na fatura (Stripe manda pro e-mail salvo no
    // customer, não consulta nosso banco a cada cobrança). Falha do Stripe
    // não deve derrubar o salvamento local: melhor gravar a mudança e ficar
    // fora de sincronia por instantes do que perder a edição inteira por uma
    // falha transitória de rede/API de terceiro.
    if (stripe && tenant?.stripe_customer_id && billingEmail !== tenant.billing_email) {
      try {
        await stripe.customers.update(tenant.stripe_customer_id, { email: billingEmail || undefined });
      } catch (err) {
        logger.error({ err: err.message }, 'Falha ao sincronizar e-mail de cobrança com o Stripe');
      }
    }

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

// GIF é bloqueado tanto aqui quanto no logo (abaixo): arquivos animados nunca
// são desejáveis numa foto de perfil/logo institucional, então a checagem é
// feita por allow-list explícita em vez de um bloqueio pontual do tipo.
const IMAGE_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp'];
router.post('/avatar', authRequired, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('Nenhuma imagem enviada.');
    if (!IMAGE_ALLOWED_MIMES.includes(req.file.mimetype)) throw badRequest('Formato não suportado. Use PNG, JPG ou BMP.');
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

// Logo do escritório/empresa — usado na marca branca dos relatórios DOCX
// gerados (ver lib/report.js). Fica em tenants, não em users: é o mesmo
// logo pra todo mundo do escritório, independente de quem gerou o relatório.
// Restrito aos formatos que a biblioteca `docx` sabe embutir num .docx —
// diferente do avatar de usuário (decorativo, só CSS), esse logo precisa
// renderizar de verdade dentro do relatório baixável.
router.post('/logo', authRequired, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('Nenhuma imagem enviada.');
    if (!IMAGE_ALLOWED_MIMES.includes(req.file.mimetype)) throw badRequest('Formato não suportado. Use PNG, JPG ou BMP.');
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    await db.prepare('UPDATE tenants SET logo = ? WHERE id = ?').run(base64, req.user.tenant_id);
    res.json({ logo: base64 });
  } catch (e) { next(e); }
});

router.delete('/logo', authRequired, async (req, res, next) => {
  try {
    await db.prepare('UPDATE tenants SET logo = NULL WHERE id = ?').run(req.user.tenant_id);
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
