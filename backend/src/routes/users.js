import { Router } from 'express';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { authRequired, managerOnly } from '../middleware/auth.js';
import { badRequest, isValidEmail, trim } from '../lib/validate.js';
import { sendInviteEmail } from '../lib/email.js';
import { audit, ACTIONS } from '../lib/audit.js';

const router = Router();

router.get('/', authRequired, async (req, res, next) => {
  try {
    const rows = await db.prepare(`
      SELECT u.id, u.name, u.email, u.role,
        EXISTS(SELECT 1 FROM invites i WHERE i.user_id = u.id AND i.used_at IS NULL) AS invite_pending
      FROM users u
      WHERE u.tenant_id = ?
      ORDER BY u.name
    `).all(req.user.tenant_id);
    res.json({ users: rows });
  } catch (e) { next(e); }
});

// POST /users/invite — gerente convida colaborador
router.post('/invite', authRequired, managerOnly, async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    const email = trim(req.body?.email)?.toLowerCase();
    const role = req.body?.role === 'manager' ? 'manager' : 'manager'; // só manager no finanalyze

    if (!name) throw badRequest('Nome é obrigatório.', { name: 'Informe o nome.' });
    if (!email || !isValidEmail(email)) throw badRequest('E-mail inválido.', { email: 'Informe um e-mail válido.' });

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw badRequest('Já existe um usuário com este e-mail.', { email: 'E-mail já cadastrado.' });

    const tenant = await db.prepare('SELECT name FROM tenants WHERE id = ?').get(req.user.tenant_id);

    const userId = nanoid(10);
    const dummyHash = await bcrypt.hash(nanoid(32), 10);
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
    res.json({ ok: true, devLink: emailRes.devLink });
  } catch (e) { next(e); }
});

// PATCH /users/:id/role
router.patch('/:id/role', authRequired, managerOnly, async (req, res, next) => {
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
router.delete('/:id', authRequired, managerOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await db.prepare('SELECT id, role FROM users WHERE id = ? AND tenant_id = ?')
      .get(id, req.user.tenant_id);
    if (!user) throw badRequest('Usuário não encontrado.');
    if (user.id === req.user.id) throw badRequest('Você não pode remover a si mesmo.');
    await db.prepare('DELETE FROM users WHERE id = ?').run(id);
    await audit(req, ACTIONS.USER_REMOVED, { targetType: 'user', targetId: id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
