import 'dotenv/config';
import { initDb } from './lib/db.js';
import { seedDb } from './lib/seed.js';
import { createApp } from './app.js';
import { anonymizeOldAuditLogs } from './lib/audit.js';
import logger from './lib/logger.js';

const PORT   = process.env.PORT   || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DAY_MS  = 24 * 60 * 60 * 1000;

// Política de retenção de audit logs (LGPD) — roda no boot e depois a cada 24h.
function scheduleAuditLogRetention() {
  const run = () => anonymizeOldAuditLogs()
    .then(n => { if (n) logger.info({ anonymized: n }, 'audit logs anonimizados (retenção LGPD)'); })
    .catch(err => logger.error({ err }, 'falha ao anonimizar audit logs'));
  run();
  setInterval(run, DAY_MS);
}

if (IS_PROD) {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    logger.fatal('JWT_SECRET inválido em produção: precisa ter pelo menos 32 caracteres.');
    process.exit(1);
  }
}

const app = createApp();

try {
  await initDb();
  await seedDb();
  scheduleAuditLogRetention();

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: IS_PROD ? 'production' : 'development' }, 'SynerCoop API iniciada');
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  // Espera requisições em voo terminarem antes de encerrar o processo.
  // Render, k8s e PM2 enviam SIGTERM antes de matar o contêiner; SIGINT
  // vem do Ctrl+C em desenvolvimento.
  const SHUTDOWN_TIMEOUT_MS = 30_000;

  async function shutdown(signal) {
    logger.info({ signal }, 'Encerramento iniciado...');
    server.close(async () => {
      logger.info('Servidor HTTP fechado. Encerrando processo.');
      process.exit(0);
    });
    // Força encerramento após timeout para não travar deploys
    setTimeout(() => {
      logger.warn('Encerramento forçado (timeout de 30s atingido).');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

} catch (e) {
  logger.fatal({ err: e }, 'falha ao iniciar');
  process.exit(1);
}
