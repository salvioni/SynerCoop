import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import { db } from '../lib/db.js';
import { signToken } from '../lib/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { isValidEmail, trim, badRequest, unauthorized } from '../lib/validate.js';
import { authRequired, planExempt } from '../middleware/auth.js';
import { DEMO_MODE } from '../lib/demo.js';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const router = Router();

const loginLimit = rateLimit({
  windowMs: 60_000, max: 5,
  message: { error: 'Muitas tentativas de login. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false
});
const registerLimit = rateLimit({
  windowMs: 60_000, max: 3,
  message: { error: 'Muitas tentativas de cadastro. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test'
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
const googleLimit = rateLimit({
  windowMs: 60_000, max: 10,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false
});
const facebookLimit = rateLimit({
  windowMs: 60_000, max: 10,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false
});

const TENANT_TYPES = ['cooperativa', 'escritorio', 'empresa', 'associacao', 'outro'];

// Ramos de atuação (baseado na classificação da OCB), usado para segmentar
// o tipo de negócio do escritório/cooperativa que está se cadastrando.
const BUSINESS_SECTORS = [
  'agropecuario', 'agricultura', 'consumo', 'credito', 'educacional', 'especial',
  'habitacional', 'hospitalar', 'infraestrutura', 'mineral', 'producao', 'saude',
  'trabalho', 'transporte', 'turismo_lazer', 'outro'
];

// Validação dos campos de tenant (escritório/cooperativa/empresa) usada por
// /register, /google/complete e /facebook/complete — os três criam um
// tenant novo a partir dos mesmos três campos.
function validateTenantFields(company, companyType, sector) {
  const fields = {};
  if (!company) fields.company = 'Informe o nome do escritório.';
  if (!companyType) fields.companyType = 'Selecione o tipo.';
  else if (!TENANT_TYPES.includes(companyType)) fields.companyType = 'Tipo inválido.';
  if (!sector) fields.sector = 'Selecione a área de atuação.';
  else if (!BUSINESS_SECTORS.includes(sector)) fields.sector = 'Área de atuação inválida.';
  return fields;
}

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60_000;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';

function genCode() {
  return String(crypto.randomInt(100000, 999999));
}

// Verifica um access token OAuth2 do Google (obtido via botão customizado +
// google.accounts.oauth2, não mais o widget renderizado pelo Google — isso
// permite um botão com a mesma cara dos outros, já que o widget oficial vem
// num iframe cuja fonte/tamanho o Google controla e não conseguimos estilizar).
async function verifyGoogleAccessToken(accessToken) {
  if (!GOOGLE_CLIENT_ID) throw badRequest('Login com Google não está configurado neste servidor.');
  if (!accessToken) throw badRequest('Token do Google ausente.');

  let tokenInfo;
  try {
    const infoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    tokenInfo = await infoRes.json();
  } catch {
    throw unauthorized('Não foi possível validar o token do Google.');
  }
  if (!tokenInfo?.aud || tokenInfo.aud !== GOOGLE_CLIENT_ID) {
    throw unauthorized('Token do Google inválido ou expirado.');
  }

  let profile;
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    profile = await profileRes.json();
  } catch {
    throw unauthorized('Não foi possível obter os dados da conta Google.');
  }
  if (!profile?.email || String(profile.email_verified) !== 'true') {
    throw unauthorized('Não foi possível confirmar o e-mail da conta Google.');
  }
  return profile;
}

async function verifyFacebookAccessToken(accessToken) {
  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) throw badRequest('Login com Facebook não está configurado neste servidor.');
  if (!accessToken) throw badRequest('Token do Facebook ausente.');

  const appToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
  let debugData;
  try {
    const debugRes = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`);
    debugData = await debugRes.json();
  } catch {
    throw unauthorized('Não foi possível validar o token do Facebook.');
  }
  const info = debugData?.data;
  if (!info?.is_valid || String(info.app_id) !== FACEBOOK_APP_ID) {
    throw unauthorized('Token do Facebook inválido ou expirado.');
  }

  let profile;
  try {
    const profileRes = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(info.user_id)}?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
    profile = await profileRes.json();
  } catch {
    throw unauthorized('Não foi possível obter os dados da conta Facebook.');
  }
  if (!profile?.email) throw unauthorized('Não foi possível confirmar o e-mail da conta Facebook. Verifique se seu Facebook possui um e-mail associado.');
  return profile;
}

function toSafeUser(user, tenant) {
  return {
    id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role,
    plan: tenant?.plan || null, tenant_name: tenant?.name || null,
    tenant_type: tenant?.type || null, self_client_id: tenant?.self_client_id || null,
    avatar: user.avatar || null, avatar_color: user.avatar_color || null
  };
}

// Cria o tenant e, quando o tipo não é "escritorio" (ou seja, não há uma
// carteira de clientes a gerenciar), cria também um cliente-espelho com o
// próprio nome do tenant e vincula via tenants.self_client_id — é essa
// vinculação (não o valor de `type`) que o resto do app usa para decidir
// entre o painel de escritório (multi-cliente) e o painel de entidade única.
async function createTenantWithType(tx, { tenantId, company, companyType, sector }) {
  await tx.prepare('INSERT INTO tenants (id, name, type, sector, plan) VALUES (?, ?, ?, ?, NULL)').run(tenantId, company, companyType, sector || null);
  if (companyType !== 'escritorio') {
    const clientId = nanoid(10);
    await tx.prepare('INSERT INTO clients (id, tenant_id, name, type) VALUES (?, ?, ?, ?)').run(clientId, tenantId, company, companyType);
    await tx.prepare('UPDATE tenants SET self_client_id = ? WHERE id = ?').run(clientId, tenantId);
  }
}

// POST /auth/register
router.post('/register', registerLimit, async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    const email = trim(req.body?.email).toLowerCase();
    const password = req.body?.password || '';
    const company = trim(req.body?.company);
    const companyType = trim(req.body?.companyType);
    const sector = trim(req.body?.sector);
    const role = 'manager';

    const fields = {};
    if (!name) fields.name = 'Informe seu nome completo.';
    else if (name.length < 3) fields.name = 'Nome muito curto.';
    else if (!/\s/.test(name)) fields.name = 'Informe nome e sobrenome.';

    if (!email) fields.email = 'Informe seu e-mail.';
    else if (!isValidEmail(email)) fields.email = 'E-mail inválido.';

    Object.assign(fields, validateTenantFields(company, companyType, sector));

    if (!password) fields.password = 'Crie uma senha.';
    else if (password.length < 8) fields.password = 'Senha muito curta. Mínimo 8 caracteres.';

    if (Object.keys(fields).length) throw badRequest('Dados inválidos.', fields);

    const existing = await db.prepare(`
      SELECT u.id, u.tenant_id, u.email_verified, t.onboarded_at
      FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.email = ?
    `).get(email);
    if (existing) {
      // Só tratamos como "cadastro abandonado" (e liberamos o e-mail para
      // recomeçar) quando o usuário pertence a um tenant que nunca concluiu
      // a escolha de plano. Usamos `onboarded_at` (não `plan`) porque `plan`
      // volta a NULL quando uma assinatura é cancelada — usar `plan` aqui
      // apagaria a conta de um cliente pagante cuja assinatura expirou.
      // Contas sem tenant_id (administradores) nunca são consideradas
      // abandonadas, mesmo com email_verified falso.
      const abandoned = existing.tenant_id && (!existing.email_verified || !existing.onboarded_at);
      if (!abandoned) {
        throw badRequest('E-mail já cadastrado.', { email: 'Este e-mail já está cadastrado. Tente entrar ou use outro.' });
      }
      await db.prepare('DELETE FROM tenants WHERE id = ?').run(existing.tenant_id);
    }

    const tenantId = nanoid(10);
    const userId = nanoid(10);
    const hash = await bcrypt.hash(password, 12);
    const code = genCode();
    const expires = new Date(Date.now() + 15 * 60_000).toISOString();

    await db.transaction(async (tx) => {
      await createTenantWithType(tx, { tenantId, company, companyType, sector });
      await tx.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role)
                        VALUES (?, ?, ?, ?, ?, ?)`).run(userId, tenantId, name, email, hash, role);
      await tx.prepare('INSERT INTO email_verifications (id, user_id, code, expires_at) VALUES (?, ?, ?, ?)')
        .run(nanoid(10), userId, code, expires);
    })();

    const emailRes = await sendVerificationEmail({ to: email, code });
    const IS_PROD = process.env.NODE_ENV === 'production';
    res.json({ userId, email, ...((IS_PROD && !DEMO_MODE) ? {} : { devCode: emailRes.devCode }) });
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
    if (!timingSafeEqual(rec.code, code)) throw badRequest('Código incorreto.', { code: 'Código incorreto. Verifique e tente novamente.' });

    await db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(rec.id);
    await db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);

    const user = await db.prepare('SELECT id, tenant_id, name, email, role, avatar, avatar_color FROM users WHERE id = ?').get(userId);
    const tenant = user.tenant_id ? await db.prepare('SELECT name, plan, type, self_client_id FROM tenants WHERE id = ?').get(user.tenant_id) : null;
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token, user: toSafeUser(user, tenant) });
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
    const IS_PROD = process.env.NODE_ENV === 'production';
    res.json({ ok: true, ...((IS_PROD && !DEMO_MODE) ? {} : { devCode: emailRes.devCode }) });
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
                                            failed_login_count, locked_until, avatar, avatar_color
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
      const IS_PROD = process.env.NODE_ENV === 'production';
      return res.status(403).json({
        error: 'E-mail não verificado.', needsVerification: true,
        userId: user.id, email: user.email,
        ...((IS_PROD && !DEMO_MODE) ? {} : { devCode: emailRes.devCode })
      });
    }

    const tenant = user.tenant_id
      ? await db.prepare('SELECT name, plan, type, self_client_id FROM tenants WHERE id = ?').get(user.tenant_id)
      : null;
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token, user: toSafeUser(user, tenant) });
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
      return res.json({ ok: true, message: 'Se o e-mail existir, um link foi enviado.' });
    }

    const token = nanoid(32);
    const expires = new Date(Date.now() + 60 * 60_000).toISOString();
    await db.prepare('INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(nanoid(10), user.id, token, expires);

    const link = `${FRONTEND_URL}/reset-password?token=${token}`;
    const emailRes = await sendPasswordResetEmail({ to: user.email, link });
    const IS_PROD = process.env.NODE_ENV === 'production';
    res.json({ ok: true, message: 'Se o e-mail existir, um link foi enviado.', ...((IS_PROD && !DEMO_MODE) ? {} : { devLink: emailRes.devLink }) });
  } catch (e) { next(e); }
});

// POST /auth/reset-password
const resetLimit = rateLimit({ windowMs: 60_000, max: 3, message: { error: 'Muitas tentativas. Aguarde 1 minuto.' }, standardHeaders: true, legacyHeaders: false });
router.post('/reset-password', resetLimit, async (req, res, next) => {
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

    const hash = await bcrypt.hash(newPassword, 12);
    await db.prepare('UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?')
      .run(hash, rec.user_id);
    await db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(rec.id);

    res.json({ ok: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (e) { next(e); }
});

// POST /auth/google — login (ou vínculo automático a uma conta já existente com o mesmo e-mail)
router.post('/google', googleLimit, async (req, res, next) => {
  try {
    const payload = await verifyGoogleAccessToken(req.body?.accessToken);
    const email = payload.email.toLowerCase();
    const googleId = payload.sub;

    let user = await db.prepare(`SELECT id, tenant_id, name, email, role, avatar, avatar_color, google_id
                                  FROM users WHERE google_id = ?`).get(googleId);
    if (!user) {
      user = await db.prepare(`SELECT id, tenant_id, name, email, role, avatar, avatar_color, google_id
                                FROM users WHERE email = ?`).get(email);
      if (user && !user.google_id) {
        await db.prepare('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?').run(googleId, user.id);
      }
    }

    if (!user) {
      return res.json({ needsSignup: true, name: trim(payload.name), email });
    }

    const tenant = user.tenant_id ? await db.prepare('SELECT name, plan, type, self_client_id FROM tenants WHERE id = ?').get(user.tenant_id) : null;
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token, user: toSafeUser(user, tenant) });
  } catch (e) { next(e); }
});

// POST /auth/google/complete — cria escritório (tenant) + conta para um login Google sem cadastro prévio
router.post('/google/complete', googleLimit, async (req, res, next) => {
  try {
    const company = trim(req.body?.company);
    const companyType = trim(req.body?.companyType);
    const sector = trim(req.body?.sector);

    const fields = validateTenantFields(company, companyType, sector);
    if (Object.keys(fields).length) throw badRequest('Dados inválidos.', fields);

    const payload = await verifyGoogleAccessToken(req.body?.accessToken);
    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = trim(payload.name) || email.split('@')[0];

    let user = await db.prepare(`SELECT id, tenant_id, name, email, role, avatar, avatar_color
                                  FROM users WHERE google_id = ? OR email = ?`).get(googleId, email);

    if (!user) {
      const tenantId = nanoid(10);
      const userId = nanoid(10);
      const randomHash = await bcrypt.hash(nanoid(32), 12);
      await db.transaction(async (tx) => {
        await createTenantWithType(tx, { tenantId, company, companyType, sector });
        await tx.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified, google_id)
                          VALUES (?, ?, ?, ?, ?, 'manager', 1, ?)`).run(userId, tenantId, name, email, randomHash, googleId);
      })();
      // Evita um SELECT redundante — todos os campos já são conhecidos localmente.
      user = { id: userId, tenant_id: tenantId, name, email, role: 'manager', avatar: null, avatar_color: null };
    } else {
      await db.prepare('UPDATE users SET google_id = ?, email_verified = 1 WHERE id = ?').run(googleId, user.id);
    }

    const tenant = user.tenant_id ? await db.prepare('SELECT name, plan, type, self_client_id FROM tenants WHERE id = ?').get(user.tenant_id) : null;
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token, user: toSafeUser(user, tenant) });
  } catch (e) { next(e); }
});

// POST /auth/facebook — login (ou vínculo automático a uma conta já existente com o mesmo e-mail)
router.post('/facebook', facebookLimit, async (req, res, next) => {
  try {
    const profile = await verifyFacebookAccessToken(req.body?.accessToken);
    const email = profile.email.toLowerCase();
    const facebookId = profile.id;

    let user = await db.prepare(`SELECT id, tenant_id, name, email, role, avatar, avatar_color, facebook_id
                                  FROM users WHERE facebook_id = ?`).get(facebookId);
    if (!user) {
      user = await db.prepare(`SELECT id, tenant_id, name, email, role, avatar, avatar_color, facebook_id
                                FROM users WHERE email = ?`).get(email);
      if (user && !user.facebook_id) {
        await db.prepare('UPDATE users SET facebook_id = ?, email_verified = 1 WHERE id = ?').run(facebookId, user.id);
      }
    }

    if (!user) {
      return res.json({ needsSignup: true, name: trim(profile.name), email });
    }

    const tenant = user.tenant_id ? await db.prepare('SELECT name, plan, type, self_client_id FROM tenants WHERE id = ?').get(user.tenant_id) : null;
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token, user: toSafeUser(user, tenant) });
  } catch (e) { next(e); }
});

// POST /auth/facebook/complete — cria escritório (tenant) + conta para um login Facebook sem cadastro prévio
router.post('/facebook/complete', facebookLimit, async (req, res, next) => {
  try {
    const company = trim(req.body?.company);
    const companyType = trim(req.body?.companyType);
    const sector = trim(req.body?.sector);

    const fields = validateTenantFields(company, companyType, sector);
    if (Object.keys(fields).length) throw badRequest('Dados inválidos.', fields);

    const profile = await verifyFacebookAccessToken(req.body?.accessToken);
    const email = profile.email.toLowerCase();
    const facebookId = profile.id;
    const name = trim(profile.name) || email.split('@')[0];

    let user = await db.prepare(`SELECT id, tenant_id, name, email, role, avatar, avatar_color
                                  FROM users WHERE facebook_id = ? OR email = ?`).get(facebookId, email);

    if (!user) {
      const tenantId = nanoid(10);
      const userId = nanoid(10);
      const randomHash = await bcrypt.hash(nanoid(32), 12);
      await db.transaction(async (tx) => {
        await createTenantWithType(tx, { tenantId, company, companyType, sector });
        await tx.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified, facebook_id)
                          VALUES (?, ?, ?, ?, ?, 'manager', 1, ?)`).run(userId, tenantId, name, email, randomHash, facebookId);
      })();
      // Evita um SELECT redundante — todos os campos já são conhecidos localmente.
      user = { id: userId, tenant_id: tenantId, name, email, role: 'manager', avatar: null, avatar_color: null };
    } else {
      await db.prepare('UPDATE users SET facebook_id = ?, email_verified = 1 WHERE id = ?').run(facebookId, user.id);
    }

    const tenant = user.tenant_id ? await db.prepare('SELECT name, plan, type, self_client_id FROM tenants WHERE id = ?').get(user.tenant_id) : null;
    const token = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token, user: toSafeUser(user, tenant) });
  } catch (e) { next(e); }
});

router.get('/me', planExempt, authRequired, (req, res) => {
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
    if (!password || password.length < 8) throw badRequest('Senha deve ter pelo menos 8 caracteres.', { password: 'Mínimo 8 caracteres.' });

    const invite = await db.prepare(`
      SELECT i.id, i.user_id, i.expires_at, i.used_at, u.tenant_id, u.role
      FROM invites i JOIN users u ON u.id = i.user_id
      WHERE i.token = ?
    `).get(token);

    if (!invite) throw badRequest('Convite inválido ou não encontrado.');
    if (invite.used_at) throw badRequest('Este convite já foi utilizado.');
    if (new Date(invite.expires_at) < new Date()) throw badRequest('Este convite expirou.');

    const hash = await bcrypt.hash(password, 12);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, invite.user_id);
    await db.prepare('UPDATE invites SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(invite.id);

    const user = await db.prepare(`
      SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.avatar, u.avatar_color
      FROM users u WHERE u.id = ?
    `).get(invite.user_id);
    const tenant = user.tenant_id ? await db.prepare('SELECT name, plan, type, self_client_id FROM tenants WHERE id = ?').get(user.tenant_id) : null;

    const jwtToken = signToken({ uid: user.id, cid: user.tenant_id, role: user.role });
    res.json({ token: jwtToken, user: toSafeUser(user, tenant) });
  } catch (e) { next(e); }
});

export default router;
