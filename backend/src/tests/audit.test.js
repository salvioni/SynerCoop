import { describe, it, expect, beforeAll } from 'vitest';
import { nanoid } from 'nanoid';
import { setupTestDb } from './setup.js';
import { db } from '../lib/db.js';
import { anonymizeOldAuditLogs, ACTIONS } from '../lib/audit.js';

beforeAll(async () => {
  await setupTestDb();
});

function insertLog({ createdAt, actorName = 'Fulano de Tal', targetLabel = 'Cliente X', meta = { foo: 'bar' } }) {
  const id = 'al' + nanoid(10);
  db.prepare(`
    INSERT INTO audit_logs (id, tenant_id, actor_id, actor_name, action, target_type, target_id, target_label, meta, created_at)
    VALUES (?, 'audit-test-tenant', ?, ?, ?, 'client', ?, ?, ?, ?)
  `).run(id, nanoid(10), actorName, ACTIONS.CLIENT_CREATED, nanoid(10), targetLabel, JSON.stringify(meta), createdAt);
  return id;
}

describe('anonymizeOldAuditLogs', () => {
  it('anonimiza só registros mais antigos que a janela de retenção, preservando ação/tenant/data', async () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 25);
    const oldId = insertLog({ createdAt: old.toISOString() });

    const recentId = insertLog({ createdAt: new Date().toISOString() });

    await anonymizeOldAuditLogs();

    const oldRow = await db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(oldId);
    expect(oldRow.actor_name).toBe('[registro anonimizado]');
    expect(oldRow.target_label).toBeNull();
    expect(oldRow.meta).toBeNull();
    expect(oldRow.action).toBe(ACTIONS.CLIENT_CREATED);
    expect(oldRow.tenant_id).toBe('audit-test-tenant');

    const recentRow = await db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(recentId);
    expect(recentRow.actor_name).toBe('Fulano de Tal');
    expect(recentRow.target_label).toBe('Cliente X');
  });

  it('é idempotente — rodar de novo não falha nem reprocessa linhas já anonimizadas', async () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 30);
    const id = insertLog({ createdAt: old.toISOString() });

    await anonymizeOldAuditLogs();
    const changed = await anonymizeOldAuditLogs();

    const row = await db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id);
    expect(row.actor_name).toBe('[registro anonimizado]');
    expect(changed).toBe(0);
  });
});
