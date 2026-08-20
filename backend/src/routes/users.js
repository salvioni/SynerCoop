import { Router } from 'express';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { authRequired, managerOnly, trialAtivo } from '../middleware/auth.js';
import { getUserLimit, PLAN_LABELS } from '../lib/plans.js';
import { badRequest, isValidEmail, trim } from '../lib/validate.js';
import { sendInviteEmail } from '../lib/email.js';
import { audit, ACTIONS } from '../lib/audit.js';

const router = Router();

router.get('/', authRequired, async (req, res, next) => {
  try {
    const rows = await db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.avatar, u.avatar_color,
        -- invite_status diferencia convites válidos (pending), expirados (expired) e
        -- usuários que já aceitaram (null). "pending" = há invite com used_at NULL
        -- E ainda dentro do prazo. "expired" = invite nunca usado mas prazo vencido.
        -- A query anterior não filtrava expires_at, então convites expirados
        -- voltavam como pending indistintamente.
        CASE
          WHEN EXISTS(
            SELECT 1 FROM invites i
            WHERE i.user_id = u.id AND i.used_at IS NULL
              AND i.expires_at > CURRENT_TIMESTAMP
          ) THEN 'pending'
          WHEN EXISTS(
            SELECT 1 FROM invites i
            WHERE i.user_id = u.id AND i.used_at IS NULL
              AND i.expires_at <= CURRENT_TIMESTAMP
          ) THEN 'expired'
          ELSE NULL
        END AS invite_status
      FROM users u
      WHERE u.tenant_id = ?
      ORDER BY u.name
    `).all(req.user.tenant_id);

    // Manter campo legado invite_pending para retrocompatibilidade com
    // quaisquer outros clientes que já dependam dele.
    const users = rows.map(r => ({
      ...r,
      invite_pending: r.invite_status === 'pending' || r.invite_status === 'expired',
    }));
    res.json({ users });
  } catch (e) { next(e); }
});

// POST /users/invite — gerente convida colaborador
router.post('/invite', authRequired, trialAtivo, managerOnly, async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    const email = trim(req.body?.email)?.toLowerCase();
    const role = 'manager';

    if (!name) throw badRequest('Nome é obrigatório.', { name: 'Informe o nome.' });
    if (!email || !isValidEmail(email)) throw badRequest('E-mail inválido.', { email: 'Informe um e-mail válido.' });

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw badRequest('Já existe um usuário com este e-mail.', { email: 'E-mail já cadastrado.' });

    const tenant = await db.prepare('SELECT name, plan FROM tenants WHERE id = ?').get(req.user.tenant_id);

    // Convite pendente já ocupa vaga: o usuário existe na tabela desde o
    // convite, e não travar aqui deixaria o gerente disparar dez convites e
    // estourar a cota assim que todos aceitassem.
    const limiteUsuarios = getUserLimit(tenant?.plan);
    if (limiteUsuarios !== Infinity) {
      const { cnt } = await db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = ?')
        .get(req.user.tenant_id);
      if (cnt >= limiteUsuarios) {
        throw badRequest(
          `O ${(PLAN_LABELS[tenant?.plan] || 'plano atual').toLowerCase()} permite ${limiteUsuarios} `
          + `${limiteUsuarios === 1 ? 'usuário' : 'usuários'}. Assine um plano para convidar mais pessoas.`,
          { code: 'USER_LIMIT_REACHED' }
        );
      }
    }

    const userId = nanoid(10);
    const dummyHash = await bcrypt.hash(nanoid(32), 12);
    await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
                      VALUES (?, ?, ?, ?, ?, ?, 1)`)
      .run(userId, req.user.tenant_id, name, email, dummyHash, role);

    const token = nanoid(40);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
    await db.prepare('INSERT INTO invites (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(10), userId, token, expiresAt);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${baseUrl}/accept-invite?token=${token}`;
    const emailRes = await sendInviteEmail({ to: email, name, companyName: tenant?.name, link, role });
    await audit(req, ACTIONS.USER_INVITED, { targetType: 'user', targetId: userId, targetLabel: name, meta: { email, role } });
    const IS_PROD = process.env.NODE_ENV === 'production';
    res.json({ ok: true, ...(IS_PROD ? {} : { devLink: emailRes.devLink }) });
  } catch (e) { next(e); }
});

// POST /users/:id/resend-invite — reenvia o convite com token novo e prazo renovado
router.post('/:id/resend-invite', authRequired, trialAtivo, managerOnly, async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await db.prepare(
      'SELECT id, name, email, has_password FROM users WHERE id = ? AND tenant_id = ?'
    ).get(id, req.user.tenant_id);
    if (!user) throw badRequest('Usuário não encontrado.');
    if (user.has_password) throw badRequest('Este membro já aceitou o convite e definiu uma senha.');

    // Invalida todos os convites anteriores (expira imediatamente) para que
    // links antigos não funcionem mais — só o novo link ficará válido.
    await db.prepare(
      `UPDATE invites SET expires_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND used_at IS NULL`
    ).run(id);

    // Novo token com prazo de 48h
    const token = nanoid(40);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
    await db.prepare('INSERT INTO invites (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(10), id, token, expiresAt);

    const tenant = await db.prepare('SELECT name FROM tenants WHERE id = ?').get(req.user.tenant_id);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${baseUrl}/accept-invite?token=${token}`;
    const emailRes = await sendInviteEmail({ to: user.email, name: user.name, companyName: tenant?.name, link, role: 'manager' });

    await audit(req, ACTIONS.USER_INVITED, {
      targetType: 'user', targetId: id, targetLabel: user.name,
      meta: { email: user.email, role: 'manager', resend: true },
    });

    const IS_PROD = process.env.NODE_ENV === 'production';
    res.json({ ok: true, ...(IS_PROD ? {} : { devLink: emailRes?.devLink }) });
  } catch (e) { next(e); }
});

// PATCH /users/:id/role
router.patch('/:id/role', authRequired, trialAtivo, managerOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const role = req.body?.role;
    if (role !== 'manager') throw badRequest('Perfil inválido. Apenas "manager" disponível.');
    if (id === req.user.id) throw badRequest('Você não pode alterar seu próprio perfil.');
    const target = await db.prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ?')
      .get(id, req.user.tenant_id);
    if (!target) throw badRequest('Usuário não encontrado.');
    await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    await audit(req, ACTIONS.USER_ROLE, { targetType: 'user', targetId: id, meta: { newRole: role } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /users/:id
router.delete('/:id', authRequired, trialAtivo, managerOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await db.prepare('SELECT id, role FROM users WHERE id = ? AND tenant_id = ?')
      .get(id, req.user.tenant_id);
    if (!user) throw badRequest('Usuário não encontrado.');
    if (user.id === req.user.id) throw badRequest('Você não pode remover a si mesmo.');
    await db.prepare('DELETE FROM users WHERE id = ?').run(id);
    // Limpa refresh tokens órfãos — sem FK cascade no SQLite eles ficam
    // na tabela e ainda seriam aceitos pelo endpoint /auth/refresh.
    await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(id);
    await audit(req, ACTIONS.USER_REMOVED, { targetType: 'user', targetId: id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
