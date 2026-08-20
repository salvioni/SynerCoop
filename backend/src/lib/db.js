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
  const { Pool, types } = pgMod.default || pgMod;

  // COUNT()/SUM() em Postgres voltam como bigint (OID 20) e o driver os
  // entrega como STRING para não perder precisão acima de 2^53. Sem isso,
  // /stats e /account devolveriam {"activeClients":"1"} em produção e
  // {"activeClients":1} em dev (SQLite) — divergência que quebra qualquer
  // soma no frontend ("1" + 1 === "11"). Nenhum contador deste sistema chega
  // perto de 2^53, então converter para Number é seguro e alinha os drivers.
  types.setTypeParser(20, v => (v === null ? null : Number(v)));

  // SSL é obrigatório nos Postgres gerenciados (Supabase, Render, Neon, RDS),
  // mas quebra num Postgres local/Docker que não expõe TLS. Decidido pela URL
  // em vez de hardcoded, para o mesmo código servir os dois ambientes:
  //   • ?sslmode=disable na URL  ou  PGSSLMODE=disable  → desliga
  //   • host local (localhost/127.0.0.1/::1)            → desliga
  //   • qualquer outro host                             → liga
  // rejectUnauthorized:false porque esses provedores usam certificado próprio.
  function resolveSsl(url) {
    if (process.env.PGSSLMODE === 'disable') return false;
    let host = '';
    let sslmode = '';
    try {
      const u = new URL(url);
      host = u.hostname;
      sslmode = u.searchParams.get('sslmode') || '';
    } catch { /* URL fora do padrão — cai no default seguro (com SSL) */ }
    if (sslmode === 'disable') return false;
    if (['localhost', '127.0.0.1', '::1', ''].includes(host)) return false;
    return { rejectUnauthorized: false };
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: resolveSsl(DATABASE_URL),
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
  // Testes usam um banco em memória, isolado do data.db de desenvolvimento.
  const DB_PATH = process.env.NODE_ENV === 'test'
    ? ':memory:'
    : path.resolve(__dirname, '../../data.db');
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
      status TEXT DEFAULT 'editable',
      confidence REAL,
      notes TEXT,
      narrative TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_email_verifs_user ON email_verifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
    CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  `);

  // Migrações idempotentes
  for (const sql of [
    `ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL`,
    `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`,
    `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('admin','manager'))`,
    `ALTER TABLE clients ADD COLUMN contact_email TEXT`,
    `ALTER TABLE clients ADD COLUMN contact_phone TEXT`,
    `ALTER TABLE clients ADD COLUMN notes TEXT`,
    `ALTER TABLE analyses ADD COLUMN narrative TEXT`,
    `ALTER TABLE analyses ADD COLUMN created_by TEXT`,
    `ALTER TABLE users ADD COLUMN avatar TEXT`,
    `ALTER TABLE users ADD COLUMN avatar_color TEXT`,
    `ALTER TABLE clients ADD COLUMN logo TEXT`,
    `ALTER TABLE clients ADD COLUMN logo_color TEXT`,
    `ALTER TABLE users ADD COLUMN google_id TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`,
    `ALTER TABLE users ADD COLUMN facebook_id TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id)`,
    `ALTER TABLE tenants ADD COLUMN type TEXT DEFAULT 'empresa'`,
    `ALTER TABLE tenants ADD COLUMN sector TEXT`,
    `ALTER TABLE tenants ADD COLUMN self_client_id TEXT`,
    `ALTER TABLE tenants ADD COLUMN onboarded_at TIMESTAMP`,
    `ALTER TABLE tenants ADD COLUMN logo TEXT`,
    `ALTER TABLE tenants ADD COLUMN cnpj TEXT`,
    `ALTER TABLE tenants ADD COLUMN phone TEXT`,
    `ALTER TABLE tenants ADD COLUMN billing_email TEXT`,
    `ALTER TABLE analyses ADD COLUMN signed_at TIMESTAMP`,
    `ALTER TABLE analyses ADD COLUMN signed_by TEXT`,
    `UPDATE analyses SET status = 'editable' WHERE status = 'done'`,
    `ALTER TABLE analyses ADD COLUMN detail TEXT`,
    `ALTER TABLE analyses ADD COLUMN period_label TEXT`,
    // Novas migrações: revogação de JWT, consentimento LGPD e senha local para OAuth
    `ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN consented_at TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN has_password INTEGER DEFAULT 0`,
    // Número de cooperados/associados/colaboradores da organização — dado de
    // identidade que o balanço não traz e que a própria conta informa.
    `ALTER TABLE tenants ADD COLUMN member_count INTEGER`,
    // Backfill: em contas de entidade única, o cliente-espelho tem que ter o
    // mesmo nome do tenant. Ele era criado no cadastro e nunca acompanhava uma
    // renomeação feita em Ajustes (corrigido em routes/account.js), então as
    // contas renomeadas antes disso ficaram com o nome antigo espalhado por
    // análises, relatórios e planilhas. Idempotente: só toca nas divergentes.
    `UPDATE clients SET name = (SELECT t.name FROM tenants t WHERE t.self_client_id = clients.id)
       WHERE EXISTS (SELECT 1 FROM tenants t WHERE t.self_client_id = clients.id AND t.name <> clients.name)`,
    // Fim do teste gratuito. Contas criadas antes desta coluna recebem a data
    // no backfill logo abaixo — a partir da própria data de cadastro, não de
    // hoje: quem se cadastrou há três meses e nunca assinou já usou o teste.
    `ALTER TABLE tenants ADD COLUMN trial_ends_at TIMESTAMP`,
    // Torna actor_id nullable para anonimização completa (LGPD)
    // — em Postgres funciona; em SQLite falha silenciosamente (driver não suporta)
    `ALTER TABLE audit_logs ALTER COLUMN actor_id DROP NOT NULL`,
  ]) {
    try { await db.exec(sql); } catch { /* já aplicado ou não suportado pelo driver */ }
  }

  // Backfill do fim do teste. Feito em JS, e não em SQL, porque a aritmética de
  // datas diverge entre os drivers (`datetime(x,'+7 days')` no SQLite,
  // `x + interval '7 days'` no Postgres) e uma migração que falha em silêncio
  // num deles é pior que nenhuma. Idempotente: só preenche quem está nulo.
  try {
    const { trialEndFrom } = await import('./plans.js');
    const pendentes = await db.prepare(
      `SELECT id, created_at FROM tenants WHERE plan = 'trial' AND trial_ends_at IS NULL`
    ).all();
    for (const t of pendentes) {
      await db.prepare('UPDATE tenants SET trial_ends_at = ? WHERE id = ?')
        .run(trialEndFrom(t.created_at), t.id);
    }
    if (pendentes.length) {
      (await import('./logger.js')).default.info(
        { tenants: pendentes.length }, 'trial_ends_at preenchido'
      );
    }
  } catch { /* coluna ainda não existe em bancos muito antigos */ }

  // Limpar tokens expirados a cada inicialização
  await db.exec(`DELETE FROM email_verifications WHERE expires_at < CURRENT_TIMESTAMP`);
  await db.exec(`DELETE FROM password_resets WHERE expires_at < CURRENT_TIMESTAMP`);
  await db.exec(`DELETE FROM invites WHERE expires_at < CURRENT_TIMESTAMP AND used_at IS NULL`);
  await db.exec(`DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP`);

  (await import('./logger.js')).default.info({ driver: driverName }, 'DB schema OK');
}
