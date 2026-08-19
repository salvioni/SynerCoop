import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { setupTestDb } from './setup.js';
import { db } from '../lib/db.js';

let app;

beforeAll(async () => {
  await setupTestDb();
  app = createApp();
});

describe('POST /auth/register', () => {
  it('cria conta e retorna userId', async () => {
    const email = `reg_${Date.now()}@example.com`;
    const res = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Joao Silva', email, password: 'Senha123!', company: 'Escritório Teste', companyType: 'escritorio', sector: 'credito'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('userId');

    const tenant = await db.prepare('SELECT self_client_id FROM tenants JOIN users ON users.tenant_id = tenants.id WHERE users.id = ?').get(res.body.userId);
    expect(tenant.self_client_id).toBeFalsy();
  });

  it('cria cliente-espelho e self_client_id quando companyType não é escritorio', async () => {
    const email = `reg_coop_${Date.now()}@example.com`;
    const res = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Ana Cooperada', email, password: 'Senha123!', company: 'Cooperativa Teste', companyType: 'cooperativa', sector: 'agropecuario'
    });
    expect(res.status).toBe(200);

    const tenant = await db.prepare('SELECT self_client_id FROM tenants JOIN users ON users.tenant_id = tenants.id WHERE users.id = ?').get(res.body.userId);
    expect(tenant.self_client_id).toBeTruthy();

    const client = await db.prepare('SELECT name, type FROM clients WHERE id = ?').get(tenant.self_client_id);
    expect(client).toMatchObject({ name: 'Cooperativa Teste', type: 'cooperativa' });
  });

  it('rejeita email duplicado', async () => {
    const bcrypt = await import('bcryptjs');
    const { nanoid } = await import('nanoid');
    const tid = nanoid(10);
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)`).run(tid, 'Dupe Tenant');
    db.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
      VALUES (?, ?, 'Dupe User', 'dupe@example.com', ?, 'manager', 1)`)
      .run(nanoid(10), tid, await bcrypt.hash('x', 10));

    const res = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Dupe User', email: 'dupe@example.com', password: 'Senha123!', company: 'X'
    });
    expect(res.status).toBe(400);
  });

  it('permite recadastrar um e-mail cujo cadastro anterior nunca foi verificado', async () => {
    const email = `abandonado_${Date.now()}@example.com`;
    const first = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Primeira Tentativa', email, password: 'Senha123!', company: 'Empresa A', companyType: 'empresa', sector: 'outro'
    });
    expect(first.status).toBe(200);

    const second = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Segunda Tentativa', email, password: 'OutraSenha123!', company: 'Empresa B', companyType: 'cooperativa', sector: 'agropecuario'
    });
    expect(second.status).toBe(200);
    expect(second.body.userId).not.toBe(first.body.userId);

    const remaining = await db.prepare('SELECT id FROM users WHERE email = ?').all(email);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.body.userId);
  });

  it('permite recadastrar um e-mail verificado que nunca escolheu um plano', async () => {
    const email = `sem_plano_${Date.now()}@example.com`;
    const first = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Primeira Tentativa', email, password: 'Senha123!', company: 'Empresa A', companyType: 'empresa', sector: 'outro'
    });
    expect(first.status).toBe(200);
    const verify = await request(app).post('/auth/verify-email').send({ userId: first.body.userId, code: first.body.devCode });
    expect(verify.status).toBe(200);

    const second = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Segunda Tentativa', email, password: 'OutraSenha123!', company: 'Empresa B', companyType: 'cooperativa', sector: 'agropecuario'
    });
    expect(second.status).toBe(200);
    expect(second.body.userId).not.toBe(first.body.userId);

    const remaining = await db.prepare('SELECT id FROM users WHERE email = ?').all(email);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(second.body.userId);
  });

  it('rejeita recadastro de e-mail verificado que já escolheu um plano', async () => {
    const email = `com_plano_${Date.now()}@example.com`;
    const first = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Pessoa Plano', email, password: 'Senha123!', company: 'Empresa Plano', companyType: 'empresa', sector: 'outro'
    });
    const verify = await request(app).post('/auth/verify-email').send({ userId: first.body.userId, code: first.body.devCode });
    await request(app).post('/account/select-plan')
      .set('Authorization', `Bearer ${verify.body.token}`).send({ plan: 'trial' });

    const second = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Outra Pessoa', email, password: 'OutraSenha123!', company: 'Empresa X', companyType: 'empresa', sector: 'outro'
    });
    expect(second.status).toBe(400);
    expect(second.body.fields).toHaveProperty('email');
  });

  it('nunca apaga uma conta sem tenant (ex.: administrador) ao tentar recadastrar o e-mail', async () => {
    const res = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Impostor Falso', email: 'admin@demo.com', password: 'Senha123!',
      company: 'Empresa Falsa', companyType: 'empresa', sector: 'outro',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('email');

    const admin = await db.prepare('SELECT id FROM users WHERE email = ?').get('admin@demo.com');
    expect(admin).toBeTruthy();
  });

  it('não apaga um tenant que já foi onboarded mesmo que o plano tenha sido cancelado depois', async () => {
    const email = `cancelado_${Date.now()}@example.com`;
    const first = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Cliente Real', email, password: 'Senha123!', company: 'Empresa Real', companyType: 'empresa', sector: 'outro'
    });
    const verify = await request(app).post('/auth/verify-email').send({ userId: first.body.userId, code: first.body.devCode });
    await request(app).post('/account/select-plan')
      .set('Authorization', `Bearer ${verify.body.token}`).send({ plan: 'trial' });

    // Simula o webhook do Stripe zerando o plano após um cancelamento —
    // onboarded_at permanece, então a conta continua contando como real.
    await db.prepare('UPDATE tenants SET plan = NULL WHERE id = (SELECT tenant_id FROM users WHERE email = ?)').run(email);

    const second = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Golpista Falso', email, password: 'OutraSenha123!', company: 'Empresa Falsa', companyType: 'empresa', sector: 'outro'
    });
    expect(second.status).toBe(400);
    expect(second.body.fields).toHaveProperty('email');

    const stillThere = await db.prepare('SELECT id FROM users WHERE id = ?').get(first.body.userId);
    expect(stillThere).toBeTruthy();
  });

  it('rejeita senha fraca', async () => {
    const res = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Maria Fraca', email: 'fraca_unique@example.com', password: '123', company: 'X'
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('password');
  });
});

describe('POST /auth/login', () => {
  beforeAll(async () => {
    const bcrypt = await import('bcryptjs');
    const { nanoid } = await import('nanoid');
    const uid = nanoid(10);
    const tid = nanoid(10);
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)`).run(tid, 'Login Tenant');
    db.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
      VALUES (?, ?, ?, ?, ?, 'manager', 1)`)
      .run(uid, tid, 'Login User', 'login@example.com', await bcrypt.hash('Senha123!', 10));
  });

  it('retorna token com credenciais válidas', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'login@example.com', password: 'Senha123!'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('email', 'login@example.com');
    expect(res.body.user.self_client_id).toBeFalsy();
  });

  it('rejeita senha errada', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'login@example.com', password: 'errada'
    });
    expect(res.status).toBe(401);
  });

  it('rejeita email inexistente', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'naoexiste@example.com', password: 'qualquer'
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/google', () => {
  it('rejeita token do Google inválido/ausente (configurado ou não neste ambiente)', async () => {
    const res = await request(app).post('/auth/google').send({ accessToken: 'fake' });
    expect([400, 401]).toContain(res.status);
  });
});

describe('POST /auth/google/complete', () => {
  it('exige nome do escritório antes de validar o token do Google', async () => {
    const res = await request(app).post('/auth/google/complete').send({ accessToken: 'fake' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('company');
  });
});

describe('POST /auth/facebook', () => {
  it('rejeita token do Facebook inválido/ausente (configurado ou não neste ambiente)', async () => {
    const res = await request(app).post('/auth/facebook').send({ accessToken: 'fake' });
    expect([400, 401]).toContain(res.status);
  });
});

describe('POST /auth/facebook/complete', () => {
  it('exige nome do escritório antes de validar o token do Facebook', async () => {
    const res = await request(app).post('/auth/facebook/complete').send({ accessToken: 'fake' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('company');
  });
});

describe('Fluxo de plano após verificação de e-mail', () => {
  async function registerAndVerify(overrides = {}) {
    const email = `plano_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const reg = await request(app).post('/auth/register').send({ terms_accepted: true,
      name: 'Pessoa Plano', email, password: 'Senha123!',
      company: 'Escritório Plano', companyType: 'escritorio', sector: 'credito',
      ...overrides,
    });
    expect(reg.status).toBe(200);
    const verify = await request(app).post('/auth/verify-email').send({
      userId: reg.body.userId, code: reg.body.devCode,
    });
    expect(verify.status).toBe(200);
    return verify.body.token;
  }

  it('bloqueia acesso ao sistema até um plano ser escolhido', async () => {
    const token = await registerAndVerify();
    const res = await request(app).get('/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(402);
    expect(res.body.fields).toMatchObject({ code: 'PLAN_REQUIRED' });
  });

  it('permite consultar /auth/me e /account mesmo sem plano escolhido', async () => {
    const token = await registerAndVerify();
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    const account = await request(app).get('/account').set('Authorization', `Bearer ${token}`);
    expect(account.status).toBe(200);
  });

  it('libera acesso ao escolher o plano trial', async () => {
    const token = await registerAndVerify();
    const select = await request(app).post('/account/select-plan')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'trial' });
    expect(select.status).toBe(200);
    expect(select.body.plan).toBe('trial');

    const res = await request(app).get('/clients').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('rejeita escolher plano trial duas vezes', async () => {
    const token = await registerAndVerify();
    await request(app).post('/account/select-plan')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'trial' });
    const again = await request(app).post('/account/select-plan')
      .set('Authorization', `Bearer ${token}`).send({ plan: 'trial' });
    expect(again.status).toBe(400);
  });
});

describe('POST /auth/forgot-password', () => {
  it('retorna ok independente do email existir', async () => {
    const res = await request(app).post('/auth/forgot-password').send({
      email: 'qualquer@example.com'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
