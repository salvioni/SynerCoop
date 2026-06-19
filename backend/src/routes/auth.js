import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import { db } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { isValidEmail, trim, badRequest, unauthorized } from '../lib/validate.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

const loginLimit = rateLimit({
  windowMs: 60_000, max: 5,
  message: { error: 'Muitas tentativas de login. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false
});
const registerLimit = rateLimit({
  windowMs: 60_000, max: 3,
  message: { error: 'Muitas tentativas de cadastro. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false
});
const verifyLimit = rateLimit({
  windowMs: 60_000, max: 10,
  message: { error: 'Muitas tentativas de verificação. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false
});
const forgotLimit = rateLimit({
  windowMs: 60_000, max: 3,
  message: { error: 'Muitas solicitações. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false
});

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60_000;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /auth/register
router.post('/register', registerLimit, async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    const email = trim(req.body?.email).toLowerCase();
    const password = req.body?.password || '';
    const company = trim(req.body?.company);
    const role = 'manager';

    const fields = {};
    if (!name) fields.name = 'Informe seu nome completo.';
    else if (name.length < 3) fields.name = 'Nome muito curto.';
    else if (!/\s/.test(name)) fields.name = 'Informe nome e sobrenome.';

    if (!email) fields.email = 'Informe seu e-mail.';
    else if (!isValidEmail(email)) fields.email = 'E-mail inválido.';

    if (!company) fields.company = 'Informe o nome do escritório.';
    if (!password) fields.password = 'Crie uma senha.';
    else if (password.length < 8) fields.password = 'Senha muito curta. Mínimo 8 caracteres.';

    if (Object.keys(fields).length) throw badRequest('Dados inválidos.', fields);

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) throw badRequest('E-mail já cadastrado.', { email: 'Este e-mail já está cadastrado. Tente entrar ou use outro.' });

    const tenantId = nanoid(10);
    const userId = nanoid(10);
    const hash = await bcrypt.hash(password, 10);

    await db.prepare('INSERT INTO tenants (id, name) VALUES (?, ?)').run(tenantId, company);
    await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role)
                      VALUES (?, ?, ?, ?, ?, ?)`).run(userId, tenantId, name, email, hash, role);

    const code = genCode();
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    await db.prepare('INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(10), userId, code, expires);

    const emailRes = await sendVerificationEmail({ to: email, code });
    res.json({ userId, email, devCode: emailRes.devCode });
  } catch (e) { next(e); }
});

// POST /auth/verify-email
router.post('/verify-email', verifyLimit, async (req, res, next) => {
  try {
    const userId = trim(req.body?.userId);
    const code = trim(req.body?.code);
    if (!userId || !code) throw badRequest('Dados inválidos.', { code: 'Código obrigatório.' });
    if (!/^\d{6}$/.test(code)) throw badRequest('Código inválido.', { code: 'O código deve ter 6 dígitos.' });

    const rec = await db.prepare(`SELECT id, code, expires_at, used FROM email_verifications
                                   WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).get(userId);
    if (!rec) throw badRequest('Nenhum código pendente.', { code: 'Solicite um novo código.' });
    if (rec.used) throw badRequest('Código já utilizado.', { code: 'Solicite um novo código.' });
    if (new Date(rec.expires_at).getTime() < Date.now()) throw badRequest('Código expirado.', { code: 'Solicite um novo código.' });
    if (rec.code !== code) throw badRequest('Código incorreto.', { code: 'Código incorreto. Verifique e tente novamente.' });

    await db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(rec.id);
    await db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);

    const user = await db.prepare('SELECT id, tenant_id, name, email, role FROM users WHERE id = ?').get(userId);
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token, user });
  } catch (e) { next(e); }
});

// POST /auth/resend-code
router.post('/resend-code', verifyLimit, async (req, res, next) => {
  try {
    const userId = trim(req.body?.userId);
    const user = await db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
    if (!user) throw badRequest('Usuário não encontrado.');

    const code = genCode();
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();
    await db.prepare('INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(10), userId, code, expires);

    const emailRes = await sendVerificationEmail({ to: user.email, code });
    res.json({ ok: true, devCode: emailRes.devCode });
  } catch (e) { next(e); }
});

// POST /auth/login
router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const email = trim(req.body?.email).toLowerCase();
    const password = req.body?.password || '';

    const fields = {};
    if (!email) fields.email = 'Informe o e-mail.';
    else if (!isValidEmail(email)) fields.email = 'E-mail inválido.';
    if (!password) fields.password = 'Informe a senha.';
    if (Object.keys(fields).length) throw badRequest('Dados inválidos.', fields);

    const user = await db.prepare(`SELECT id, tenant_id, name, email, password_hash, role, email_verified,
                                            failed_login_count, locked_until
                                     FROM users WHERE email = ?`).get(email);
    if (!user) throw unauthorized('E-mail ou senha incorretos.');

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60_000);
      throw unauthorized(`Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${mins} minuto${mins > 1 ? 's' : ''}.`);
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const newCount = (user.failed_login_count || 0) + 1;
      if (newCount >= MAX_FAILED_LOGINS) {
        const lockUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
        await db.prepare('UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?')
          .run(newCount, lockUntil, user.id);
        throw unauthorized('Conta bloqueada por 15 minutos devido a múltiplas tentativas falhas.');
      } else {
        await db.prepare('UPDATE users SET failed_login_count = ? WHERE id = ?').run(newCount, user.id);
      }
      throw unauthorized('E-mail ou senha incorretos.');
    }

    if (user.failed_login_count > 0 || user.locked_until) {
      await db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(user.id);
    }

    if (!user.email_verified) {
      const code = genCode();
      const expires = new Date(Date.now() + 15 * 60_000).toISOString();
      await db.prepare('INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)')
        .run(nanoid(10), user.id, code, expires);
      const emailRes = await sendVerificationEmail({ to: user.email, code });
      return res.status(403).json({
        error: 'E-mail não verificado.', needsVerification: true,
        userId: user.id, email: user.email, devCode: emailRes.devCode
      });
    }

    const tenant = user.tenant_id
      ? await db.prepare('SELECT plan FROM tenants WHERE id = ?').get(user.tenant_id)
      : null;
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    const safeUser = { id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role, plan: tenant?.plan || null };
    res.json({ token, user: safeUser });
  } catch (e) { next(e); }
});

// POST /auth/forgot-password
router.post('/forgot-password', forgotLimit, async (req, res, next) => {
  try {
    const email = trim(req.body?.email).toLowerCase();
    if (!email || !isValidEmail(email)) {
      throw badRequest('E-mail inválido.', { email: 'Informe um e-mail válido.' });
    }

    const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

    if (!user) {
      console.log(`[forgot] tentativa pra e-mail inexistente: ${email}`);
      return res.json({ ok: true, message: 'Se o e-mail existir, um link foi enviado.' });
    }

    const token = nanoid(32);
    const expires = new Date(Date.now() + 60 * 60_000).toISOString();
    await db.prepare('INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(10), user.id, token, expires);

    const link = `${FRONTEND_URL}/reset-password?token=${token}`;
    const emailRes = await sendPasswordResetEmail({ to: user.email, link });
    res.json({ ok: true, message: 'Se o e-mail existir, um link foi enviado.', devLink: emailRes.devLink });
  } catch (e) { next(e); }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const token = trim(req.body?.token);
    const newPassword = req.body?.password || '';

    const fields = {};
    if (!token) fields.token = 'Token inválido.';
    if (!newPassword) fields.password = 'Crie uma nova senha.';
    else if (newPassword.length < 8) fields.password = 'Senha muito curta. Mínimo 8 caracteres.';
    if (Object.keys(fields).length) throw badRequest('Dados inválidos.', fields);

    const rec = await db.prepare('SELECT id, user_id, expires_at, used FROM password_resets WHERE token = ?').get(token);
    if (!rec) throw badRequest('Token inválido.', { token: 'Token inválido ou já utilizado.' });
    if (rec.used) throw badRequest('Token já utilizado.', { token: 'Este link já foi usado. Solicite um novo.' });
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      throw badRequest('Token expirado.', { token: 'O link expirou. Solicite um novo.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.prepare('UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?')
      .run(hash, rec.user_id);
    await db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(rec.id);

    res.json({ ok: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (e) { next(e); }
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// GET /auth/accept-invite/:token
router.get('/accept-invite/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const invite = await db.prepare(`
      SELECT i.id, i.user_id, i.expires_at, i.used_at,
             u.name, u.email, u.role, t.name AS company_name
      FROM invites i
      JOIN users u ON u.id = i.user_id
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE i.token = ?
    `).get(token);

    if (!invite) return res.status(404).json({ error: 'Convite inválido ou não encontrado.' });
    if (invite.used_at) return res.status(410).json({ error: 'Este convite já foi utilizado.' });
    if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Este convite expirou.' });

    res.json({ name: invite.name, email: invite.email, role: invite.role, companyName: invite.company_name });
  } catch (e) { next(e); }
});

// POST /auth/accept-invite/:token
router.post('/accept-invite/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const password = req.body?.password;
    if (!password || password.length < 6) throw badRequest('Senha deve ter pelo menos 6 caracteres.', { password: 'Mínimo 6 caracteres.' });

    const invite = await db.prepare(`
      SELECT i.id, i.user_id, i.expires_at, i.used_at, u.tenant_id, u.role
      FROM invites i JOIN users u ON u.id = i.user_id
      WHERE i.token = ?
    `).get(token);

    if (!invite) throw badRequest('Convite inválido ou não encontrado.');
    if (invite.used_at) throw badRequest('Este convite já foi utilizado.');
    if (new Date(invite.expires_at) < new Date()) throw badRequest('Este convite expirou.');

    const hash = await bcrypt.hash(password, 10);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, invite.user_id);
    await db.prepare('UPDATE invites SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(invite.id);

    const user = await db.prepare(`
      SELECT u.id, u.tenant_id, u.name, u.email, u.role, t.plan
      FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = ?
    `).get(invite.user_id);

    const jwtToken = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token: jwtToken, user: { id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role, plan: user.plan } });
  } catch (e) { next(e); }
});

export default router;
