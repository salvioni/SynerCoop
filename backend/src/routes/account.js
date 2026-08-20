import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import multer from 'multer';
import { db } from '../lib/db.js';
import { authRequired, managerOnly, planExempt } from '../middleware/auth.js';
import { badRequest, trim, isValidEmail } from '../lib/validate.js';
import { audit, ACTIONS, countMonthlyAnalyses } from '../lib/audit.js';
import { stripe } from '../lib/stripe.js';
import { saveImage, deleteImage } from '../lib/storage.js';
import { signToken, generateRefreshToken, hashRefreshToken } from '../lib/jwt.js';
import logger from '../lib/logger.js';
import { trialEndFrom, diasRestantesTrial, trialExpirado, getUserLimit, getClientLimit, getMonthlyLimit } from '../lib/plans.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60_000;

const router = Router();

// Infinity não sobrevive ao JSON (vira null). Como null já significa "não
// informado" em vários campos desta resposta, o ilimitado viaja como a string
// 'ilimitado' — explícito dos dois lados.
const jsonLimit = v => (v === Infinity ? 'ilimitado' : v);

// GET /account — dados do escritório + estatísticas
router.get('/', planExempt, authRequired, async (req, res, next) => {
  try {
    const tenant = await db.prepare(
      'SELECT name, plan, logo, cnpj, phone, billing_email, member_count, type, sector, created_at, trial_ends_at FROM tenants WHERE id = ?'
    ).get(req.user.tenant_id);
    const clientCount = await db.prepare(
      'SELECT COUNT(*) AS cnt FROM clients WHERE tenant_id = ? AND active = 1'
    ).get(req.user.tenant_id);
    const analysisCount = await db.prepare(`
      SELECT COUNT(*) AS cnt FROM analyses a
      JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ?
    `).get(req.user.tenant_id);
    const monthlyCount = await countMonthlyAnalyses(req.user.tenant_id);
    res.json({
      companyName:     tenant?.name          || '',
      logo:            tenant?.logo          || null,
      cnpj:            tenant?.cnpj          || '',
      phone:           tenant?.phone         || '',
      billingEmail:    tenant?.billing_email || '',
      plan:            tenant?.plan          || null,
      activeClients:   clientCount?.cnt      || 0,
      totalAnalyses:   analysisCount?.cnt    || 0,
      monthlyAnalyses: monthlyCount,
      memberCount:     tenant?.member_count ?? null,
      type:            tenant?.type          || null,
      sector:          tenant?.sector        || null,
      createdAt:       tenant?.created_at    || null,
      // O front usa isto pra avisar quantos dias faltam e pra desligar as
      // ações de escrita quando o teste vence — sem recalcular a regra lá.
      trialEndsAt:     tenant?.trial_ends_at || null,
      trialDaysLeft:   diasRestantesTrial(tenant),
      trialExpired:    trialExpirado(tenant),
      userLimit:       jsonLimit(getUserLimit(tenant?.plan)),
      clientLimit:     jsonLimit(getClientLimit(tenant?.plan)),
      analysisLimit:   jsonLimit(getMonthlyLimit(tenant?.plan)),
    });
  } catch (e) { next(e); }
});

// POST /account/select-plan — entra no plano trial (único plano sem Stripe)
router.post('/select-plan', planExempt, authRequired, managerOnly, async (req, res, next) => {
  try {
    if (req.body?.plan !== 'trial') throw badRequest('Plano inválido.');
    if (req.user.plan) throw badRequest('Este escritório já tem um plano ativo.');

    // O relógio do teste começa aqui, e não no cadastro: entre criar a conta e
    // escolher o plano pode passar um dia inteiro verificando e-mail, e esse
    // dia não deve ser descontado dos 7.
    const trialEndsAt = trialEndFrom(new Date());
    await db.prepare(
      `UPDATE tenants SET plan = 'trial', onboarded_at = CURRENT_TIMESTAMP, trial_ends_at = ? WHERE id = ?`
    ).run(trialEndsAt, req.user.tenant_id);
    await audit(req, ACTIONS.PLAN_SELECTED, { targetType: 'tenant', targetId: req.user.tenant_id, meta: { plan: 'trial', trialEndsAt } });
    res.json({ ok: true, plan: 'trial', trialEndsAt });
  } catch (e) { next(e); }
});

// PATCH /account — dados do escritório (somente gerentes)
router.patch('/', authRequired, managerOnly, async (req, res, next) => {
  try {
    const name         = trim(req.body?.name);
    const cnpj         = trim(req.body?.cnpj)         || null;
    const phone        = trim(req.body?.phone)        || null;
    const billingEmail = trim(req.body?.billingEmail) || null;
    // Campo opcional: string vazia limpa, número inválido é rejeitado em vez de
    // virar 0 silenciosamente (0 cooperados e "não informado" são coisas
    // diferentes).
    const rawMembers = req.body?.memberCount;
    let memberCount = null;
    if (rawMembers !== undefined && rawMembers !== null && String(rawMembers).trim() !== '') {
      const n = Number(rawMembers);
      if (!Number.isInteger(n) || n < 0) {
        throw badRequest('Número de membros inválido.', { memberCount: 'Informe um número inteiro.' });
      }
      memberCount = n;
    }

    if (!name) throw badRequest('Nome do escritório é obrigatório.', { name: 'Campo obrigatório.' });
    if (billingEmail && !isValidEmail(billingEmail)) {
      throw badRequest('E-mail de cobrança inválido.', { billingEmail: 'E-mail inválido.' });
    }

    const tenant = await db.prepare(
      'SELECT stripe_customer_id, billing_email, self_client_id FROM tenants WHERE id = ?'
    ).get(req.user.tenant_id);
    await db.prepare('UPDATE tenants SET name = ?, cnpj = ?, phone = ?, billing_email = ?, member_count = ? WHERE id = ?')
      .run(name, cnpj, phone, billingEmail, memberCount, req.user.tenant_id);

    // Contas de entidade única têm um cliente-espelho (criado no cadastro com o
    // nome do tenant) que é o que aparece em "Nova análise", na lista de
    // análises e no cabeçalho dos relatórios. Sem este UPDATE ele congela com o
    // nome antigo e a conta passa a se chamar de dois jeitos diferentes.
    if (tenant?.self_client_id) {
      await db.prepare('UPDATE clients SET name = ?, cnpj = ? WHERE id = ? AND tenant_id = ?')
        .run(name, cnpj || '', tenant.self_client_id, req.user.tenant_id);
    }

    // Mantém customer do Stripe sincronizado com o e-mail de cobrança
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

// PATCH /account/profile — nome do usuário (qualquer membro)
router.patch('/profile', authRequired, async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    if (!name || name.length < 3) throw badRequest('Nome muito curto.', { name: 'Mínimo 3 caracteres.' });
    await db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GIF bloqueado: avatars animados não são desejáveis em foto de perfil corporativa.
const IMAGE_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp'];

// POST /account/avatar
router.post('/avatar', authRequired, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('Nenhuma imagem enviada.');
    if (!IMAGE_ALLOWED_MIMES.includes(req.file.mimetype)) {
      throw badRequest('Formato não suportado. Use PNG, JPG ou BMP.');
    }
    // Remove avatar anterior se estiver em disco
    const prev = await db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
    await deleteImage(prev?.avatar);

    const value = await saveImage(req.file.buffer, req.file.mimetype, 'avatars', req.user.tenant_id);
    await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(value, req.user.id);
    res.json({ avatar: value });
  } catch (e) { next(e); }
});

// PATCH /account/avatar-color
router.patch('/avatar-color', authRequired, async (req, res, next) => {
  try {
    const color = req.body?.color;
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) throw badRequest('Cor inválida.');
    // Remove avatar do disco se existir
    const prev = await db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
    await deleteImage(prev?.avatar);
    await db.prepare('UPDATE users SET avatar_color = ?, avatar = NULL WHERE id = ?').run(color, req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /account/avatar
router.delete('/avatar', authRequired, async (req, res, next) => {
  try {
    const prev = await db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
    await deleteImage(prev?.avatar);
    await db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /account/logo — logo do escritório (somente gerentes)
router.post('/logo', authRequired, managerOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('Nenhuma imagem enviada.');
    if (!IMAGE_ALLOWED_MIMES.includes(req.file.mimetype)) {
      throw badRequest('Formato não suportado. Use PNG, JPG ou BMP.');
    }
    const prev = await db.prepare('SELECT logo, self_client_id FROM tenants WHERE id = ?').get(req.user.tenant_id);
    await deleteImage(prev?.logo);

    const value = await saveImage(req.file.buffer, req.file.mimetype, 'logos', req.user.tenant_id);
    await db.prepare('UPDATE tenants SET logo = ? WHERE id = ?').run(value, req.user.tenant_id);
    // Espelha no cliente-espelho — ver comentário em PATCH /account.
    if (prev?.self_client_id) {
      await db.prepare('UPDATE clients SET logo = ? WHERE id = ? AND tenant_id = ?')
        .run(value, prev.self_client_id, req.user.tenant_id);
    }
    res.json({ logo: value });
  } catch (e) { next(e); }
});

// DELETE /account/logo — somente gerentes
router.delete('/logo', authRequired, managerOnly, async (req, res, next) => {
  try {
    const prev = await db.prepare('SELECT logo, self_client_id FROM tenants WHERE id = ?').get(req.user.tenant_id);
    await deleteImage(prev?.logo);
    await db.prepare('UPDATE tenants SET logo = NULL WHERE id = ?').run(req.user.tenant_id);
    if (prev?.self_client_id) {
      await db.prepare('UPDATE clients SET logo = NULL WHERE id = ? AND tenant_id = ?')
        .run(prev.self_client_id, req.user.tenant_id);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /account/change-password
// Após trocar a senha:
//  1. Revoga TODOS os refresh tokens ativos do usuário (encerra outras sessões)
//  2. Emite um novo par (access + refresh) para a sessão atual
//  3. O frontend salva os novos tokens — o usuário não é deslogado
router.post('/change-password', authRequired, async (req, res, next) => {
  try {
    const current = req.body?.current || '';
    const next_   = req.body?.next    || '';

    if (!current) throw badRequest('Informe a senha atual.', { current: 'Campo obrigatório.' });
    if (!next_)   throw badRequest('Informe a nova senha.',  { next:    'Campo obrigatório.' });
    if (next_.length < 8) throw badRequest('Senha nova muito curta.', { next: 'Mínimo 8 caracteres.' });

    const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const ok  = await bcrypt.compare(current, row.password_hash);
    if (!ok) throw badRequest('Senha atual incorreta.', { current: 'Senha incorreta.' });

    const hash = await bcrypt.hash(next_, 12);

    // Incrementa token_version (invalida todos os access tokens em circulação)
    await db.prepare(
      'UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?'
    ).run(hash, req.user.id);

    // Revoga todos os refresh tokens (impede renovação por outras sessões)
    await db.prepare(
      'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL'
    ).run(req.user.id);

    // Emite novo par apenas para esta sessão, para que o usuário continue logado
    const updatedUser = await db.prepare(
      'SELECT id, tenant_id, role, token_version FROM users WHERE id = ?'
    ).get(req.user.id);

    const accessToken = signToken({
      uid: updatedUser.id,
      cid: updatedUser.tenant_id,
      role: updatedUser.role,
      tv:  updatedUser.token_version,
    });
    const rawRefresh = generateRefreshToken();
    const tokenHash  = hashRefreshToken(rawRefresh);
    const expiresAt  = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
    await db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).run(nanoid(10), updatedUser.id, tokenHash, expiresAt);

    await audit(req, ACTIONS.PW_CHANGED, { targetType: 'user', targetId: req.user.id });

    res.json({
      ok: true,
      token: accessToken,
      refreshToken: rawRefresh,
      message: 'Senha alterada. Outras sessões foram encerradas.',
    });
  } catch (e) { next(e); }
});

// ── LGPD — Exportação de dados do titular (Art. 18) ──────────────────────────
//
// Retorna todos os dados pessoais do usuário autenticado em um único JSON.
// Cobre o direito de portabilidade e acesso à informação da LGPD.
router.get('/export', authRequired, async (req, res, next) => {
  try {
    const user = await db.prepare(`
      SELECT id, name, email, role, created_at, consented_at, avatar_color
      FROM users WHERE id = ?
    `).get(req.user.id);

    const tenant = req.user.tenant_id
      ? await db.prepare(
          'SELECT name, type, sector, cnpj, phone, billing_email, plan, created_at FROM tenants WHERE id = ?'
        ).get(req.user.tenant_id)
      : null;

    // Entradas de auditoria em que o usuário foi o ator
    const auditEntries = await db.prepare(`
      SELECT action, target_type, target_label, created_at
      FROM audit_logs WHERE actor_id = ?
      ORDER BY created_at DESC LIMIT 500
    `).all(req.user.id);

    // Análises criadas pelo usuário
    const analyses = await db.prepare(`
      SELECT a.id, a.year, a.period_label, a.status, a.created_at, c.name AS client_name
      FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE a.created_by = ? AND c.tenant_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id, req.user.tenant_id);

    await audit(req, ACTIONS.DATA_EXPORTED, { targetType: 'user', targetId: req.user.id });

    res.json({
      exportedAt: new Date().toISOString(),
      user: {
        id:           user.id,
        name:         user.name,
        email:        user.email,
        role:         user.role,
        created_at:   user.created_at,
        consented_at: user.consented_at,
        avatar_color: user.avatar_color,
      },
      company: tenant,
      auditLog: auditEntries,
      analyses: analyses.map(a => ({
        id:           a.id,
        client_name:  a.client_name,
        year:         a.year,
        period_label: a.period_label,
        status:       a.status,
        created_at:   a.created_at,
      })),
    });
  } catch (e) { next(e); }
});

export default router;
