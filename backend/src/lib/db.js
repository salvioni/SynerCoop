// Camada de banco com dois drivers:
//   • Em dev local (sem DATABASE_URL):     usa SQLite via better-sqlite3.
//   • Em produção (DATABASE_URL=postgres://...):  usa Postgres via pg.
//
// A API exposta é a mesma em ambos os casos (sempre Promise), então os
// arquivos de rotas usam `await db.prepare(...).get(...)` independentemente.

import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL || '';
const USE_PG = DATABASE_URL.startsWith('postgres://') || DATABASE_URL.startsWith('postgresql://');

let db;
let driverName;

if (USE_PG) {
  // ───── Postgres ─────
  const pgMod = await import('pg');
  const { Pool } = pgMod.default || pgMod;
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000
  });

  function toPg(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  function makeStatement(sql, client) {
    const pgSql = toPg(sql);
    const exec = client || pool;
    return {
      async get(...args) {
        const r = await exec.query(pgSql, args);
        return r.rows[0];
      },
      async all(...args) {
        const r = await exec.query(pgSql, args);
        return r.rows;
      },
      async run(...args) {
        const r = await exec.query(pgSql, args);
        return { changes: r.rowCount, lastInsertRowid: null };
      }
    };
  }

  db = {
    prepare(sql) { return makeStatement(sql); },
    async exec(sql) { await pool.query(sql); },
    transaction(fn) {
      return async (...args) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const txDb = {
            prepare: (sql) => makeStatement(sql, client),
            async exec(sql) { await client.query(sql); }
          };
          const result = await fn(txDb, ...args);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      };
    },
    pragma() {} // no-op em Postgres
  };
  driverName = 'postgres';
} else {
  // ───── SQLite ─────
  const BetterSqlite3 = (await import('better-sqlite3')).default;
  const path = (await import('node:path')).default;
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const DB_PATH = path.resolve(__dirname, '../../data.db');
  const sqlite = new BetterSqlite3(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  function wrap(stmt) {
    return {
      async get(...a) { return stmt.get(...a); },
      async all(...a) { return stmt.all(...a); },
      async run(...a) {
        const r = stmt.run(...a);
        return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
      }
    };
  }

  db = {
    prepare(sql) { return wrap(sqlite.prepare(sql)); },
    async exec(sql) { sqlite.exec(sql); },
    transaction(fn) {
      return async (...args) => {
        sqlite.exec('BEGIN');
        try {
          const txDb = {
            prepare(sql) { return wrap(sqlite.prepare(sql)); },
            async exec(sql) { sqlite.exec(sql); }
          };
          const result = await fn(txDb, ...args);
          sqlite.exec('COMMIT');
          return result;
        } catch (e) {
          try { sqlite.exec('ROLLBACK'); } catch {}
          throw e;
        }
      };
    },
    pragma(p) { sqlite.pragma(p); }
  };
  driverName = 'sqlite';
}

export { db };

export async function initDb() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plan TEXT DEFAULT 'trial',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','manager')),
      email_verified INTEGER DEFAULT 0,
      failed_login_count INTEGER DEFAULT 0,
      locked_until TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      cnpj TEXT DEFAULT '',
      type TEXT DEFAULT 'cooperativa',
      contact_email TEXT,
      contact_phone TEXT,
      notes TEXT,
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
      status TEXT DEFAULT 'done',
      confidence REAL,
      notes TEXT,
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
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT,
      meta TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_analyses_client ON analyses(client_id);
    CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_email_verifs_user ON email_verifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
    CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at);
  `);

  // Migrações idempotentes
  for (const sql of [
    `ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL`,
    `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`,
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('admin','manager'))`,
    `ALTER TABLE clients ADD COLUMN contact_email TEXT`,
    `ALTER TABLE clients ADD COLUMN contact_phone TEXT`,
    `ALTER TABLE clients ADD COLUMN notes TEXT`,
  ]) {
    try { await db.exec(sql); } catch { /* já aplicado ou não suportado pelo driver */ }
  }

  console.log(`[db] schema OK (driver: ${driverName})`);
}
