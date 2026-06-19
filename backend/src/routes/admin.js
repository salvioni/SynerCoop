import { Router } from 'express';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { db } from '../lib/db.js';
import { authRequired, adminOnly } from '../middleware/auth.js';
import { badRequest, isValidEmail, trim } from '../lib/validate.js';
import { sendInviteEmail } from '../lib/email.js';

const router = Router();
router.use(authRequired, adminOnly);

// ── Tenants ──────────────────────────────────────────────────────────────────

router.post('/tenants', async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    if (!name) throw badRequest('Nome do tenant é obrigatório.', { name: 'Informe o nome.' });
    const existing = await db.prepare('SELECT id FROM tenants WHERE name = ?').get(name);
    if (existing) throw badRequest('Já existe um tenant com este nome.', { name: 'Nome já cadastrado.' });
    const id = nanoid(10);
    await db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run(id, name);
    res.status(201).json({ id, name });
  } catch (e) { next(e); }
});

router.get('/tenants', async (_req, res, next) => {
  try {
    const tenants = await db.prepare('SELECT * FROM tenants ORDER BY name').all();
    const stats = await db.prepare(`
      SELECT tenant_id,
        COUNT(*) AS managers
      FROM users WHERE tenant_id IS NOT NULL GROUP BY tenant_id
    `).all();
    const clientCounts = await db.prepare('SELECT tenant_id, COUNT(*) AS c FROM clients GROUP BY tenant_id').all();
    const analysisCounts = await db.prepare(`
      SELECT c.tenant_id, COUNT(a.id) AS c FROM analyses a
      JOIN clients c ON c.id = a.client_id
      GROUP BY c.tenant_id
    `).all();

    const statMap = {};
    stats.forEach(s => { statMap[s.tenant_id] = s; });
    const clientMap = {};
    clientCounts.forEach(x => { clientMap[x.tenant_id] = x.c; });
    const analysisMap = {};
    analysisCounts.forEach(x => { analysisMap[x.tenant_id] = x.c; });

    const result = tenants.map(t => ({
      ...t,
      managers: statMap[t.id]?.managers || 0,
      clientCount: clientMap[t.id] || 0,
      analysisCount: analysisMap[t.id] || 0,
    }));
    res.json({ tenants: result });
  } catch (e) { next(e); }
});

// PATCH /admin/tenants/:id/toggle
router.patch('/tenants/:id/toggle', async (req, res, next) => {
  try {
    const { id } = req.params;
    const tenant = await db.prepare('SELECT id, active FROM tenants WHERE id = ?').get(id);
    if (!tenant) throw badRequest('Tenant não encontrado.');
    const newActive = tenant.active === 0 ? 1 : 0;
    await db.prepare('UPDATE tenants SET active = ? WHERE id = ?').run(newActive, id);
    res.json({ ok: true, active: newActive });
  } catch (e) { next(e); }
});

// POST /admin/tenants/:id/invite
router.post('/tenants/:id/invite', async (req, res, next) => {
  try {
    const tenantId = req.params.id;
    const name = trim(req.body?.name);
    const email = trim(req.body?.email)?.toLowerCase();
    const role = 'manager';

    if (!name) throw badRequest('Nome é obrigatório.', { name: 'Informe o nome.' });
    if (!email || !isValidEmail(email)) throw badRequest('E-mail inválido.', { email: 'Informe um e-mail válido.' });

    const tenant = await db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(tenantId);
    if (!tenant) throw badRequest('Tenant não encontrado.');

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw badRequest('Já existe um usuário com este e-mail.', { email: 'E-mail já cadastrado.' });

    const userId = nanoid(10);
    const dummyHash = await bcrypt.hash(nanoid(32), 10);
    await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
                      VALUES (?, ?, ?, ?, ?, ?, 1)`)
      .run(userId, tenantId, name, email, dummyHash, role);

    const token = nanoid(40);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
    await db.prepare('INSERT INTO invites (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(10), userId, token, expiresAt);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${baseUrl}/accept-invite?token=${token}`;
    const emailRes = await sendInviteEmail({ to: email, name, companyName: tenant.name, link, role });

    res.json({ ok: true, devLink: emailRes.devLink });
  } catch (e) { next(e); }
});

// Alias para compatibilidade
router.get('/companies', async (req, res, next) => {
  req.url = '/tenants';
  next('route');
});

export default router;
