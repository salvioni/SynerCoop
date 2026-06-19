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
    const res = await request(app).post('/auth/register').send({
      name: 'Joao Silva', email, password: 'Senha123!', company: 'Escritório Teste'
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('userId');
  });

  it('rejeita email duplicado', async () => {
    const bcrypt = await import('bcryptjs');
    const { nanoid } = await import('nanoid');
    const tid = nanoid(10);
    db.prepare(`INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)`).run(tid, 'Dupe Tenant');
    db.prepare(`INSERT OR IGNORE INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
      VALUES (?, ?, 'Dupe User', 'dupe@example.com', ?, 'manager', 1)`)
      .run(nanoid(10), tid, await bcrypt.hash('x', 10));

    const res = await request(app).post('/auth/register').send({
      name: 'Dupe User', email: 'dupe@example.com', password: 'Senha123!', company: 'X'
    });
    expect(res.status).toBe(400);
  });

  it('rejeita senha fraca', async () => {
    const res = await request(app).post('/auth/register').send({
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

describe('POST /auth/forgot-password', () => {
  it('retorna ok independente do email existir', async () => {
    const res = await request(app).post('/auth/forgot-password').send({
      email: 'qualquer@example.com'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
