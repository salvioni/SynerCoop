#!/usr/bin/env node
/**
 * scripts/migrate.js — SQLite → PostgreSQL
 *
 * Uso (a partir da pasta backend/):
 *   DATABASE_URL=postgresql://... node scripts/migrate.js
 *
 * O script lê o data.db local e insere tudo no Postgres apontado por DATABASE_URL.
 * É idempotente: usa INSERT ... ON CONFLICT DO NOTHING, então pode rodar mais de
 * uma vez sem duplicar dados.
 *
 * Pré-requisitos (na pasta backend/):
 *   npm install  (better-sqlite3 e pg já estão no package.json)
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Conexões ────────────────────────────────────────────────────────────────
// O script fica em backend/scripts/ — o data.db está um nível acima
const DB_PATH = path.resolve(__dirname, '..', 'data.db');
const sqlite = new BetterSqlite3(DB_PATH, { readonly: true });
sqlite.pragma('journal_mode = WAL');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  Defina DATABASE_URL antes de rodar:\n    DATABASE_URL=postgresql://... node scripts/migrate.js');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ── Helpers ─────────────────────────────────────────────────────────────────
function cols(row) { return Object.keys(row); }
function placeholders(row) { return Object.keys(row).map((_, i) => `$${i + 1}`).join(', '); }
function vals(row) { return Object.values(row); }

async function migrateTable(tableName, { transform } = {}) {
  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all();
  if (!rows.length) { console.log(`  ${tableName}: 0 linhas — pulando`); return; }

  let ok = 0, skip = 0;
  for (const rawRow of rows) {
    const row = transform ? transform(rawRow) : rawRow;
    const keys = cols(row);
    const sql = `
      INSERT INTO ${tableName} (${keys.join(', ')})
      VALUES (${placeholders(row)})
      ON CONFLICT DO NOTHING
    `;
    try {
      const res = await pool.query(sql, vals(row));
      res.rowCount > 0 ? ok++ : skip++;
    } catch (e) {
      console.warn(`  ⚠  ${tableName} id=${row.id}: ${e.message}`);
    }
  }
  console.log(`  ${tableName}: ✅ ${ok} inseridos, ${skip} já existiam`);
}

// ── Inicializa schema no Postgres ───────────────────────────────────────────
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plan TEXT DEFAULT 'trial',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      type TEXT DEFAULT 'empresa',
      sector TEXT,
      self_client_id TEXT,
      onboarded_at TIMESTAMP,
      logo TEXT,
      cnpj TEXT,
      phone TEXT,
      billing_email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      failed_login_count INTEGER DEFAULT 0,
      locked_until TIMESTAMP,
      avatar TEXT,
      avatar_color TEXT,
      google_id TEXT,
      facebook_id TEXT,
      token_version INTEGER DEFAULT 0,
      consented_at TIMESTAMP,
      has_password INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id);
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cnpj TEXT DEFAULT '',
      type TEXT DEFAULT 'cooperativa',
      contact_email TEXT,
      contact_phone TEXT,
      notes TEXT,
      logo TEXT,
      logo_color TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      bp TEXT NOT NULL DEFAULT '{}',
      dsp TEXT NOT NULL DEFAULT '{}',
      indicators TEXT NOT NULL DEFAULT '{}',
      status TEXT DEFAULT 'editable',
      confidence REAL,
      notes TEXT,
      narrative TEXT,
      detail TEXT,
      period_label TEXT,
      created_by TEXT,
      signed_at TIMESTAMP,
      signed_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT,
      meta TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_client ON analyses(client_id);
    CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at);
    CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_clients_tenant_active ON clients(tenant_id, active);
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  `);
  console.log('✅  Schema criado/verificado no Postgres\n');
}

// ── Migração ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀  Iniciando migração`);
  console.log(`   Origem: ${DB_PATH}`);
  console.log(`   Destino: ${DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}\n`);

  await initSchema();

  console.log('📦  Migrando tabelas:');
  // Ordem importa por causa das foreign keys
  await migrateTable('tenants');
  await migrateTable('users');
  await migrateTable('clients');
  await migrateTable('analyses');
  await migrateTable('email_verifications');
  await migrateTable('password_resets');
  await migrateTable('invites');
  await migrateTable('audit_logs');
  await migrateTable('refresh_tokens');

  console.log('\n✅  Migração concluída!');
  await pool.end();
  sqlite.close();
}

main().catch(e => {
  console.error('\n❌  Erro na migração:', e.message);
  process.exit(1);
});
