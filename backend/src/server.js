import 'dotenv/config';
import { initDb } from './lib/db.js';
import { seedDb } from './lib/seed.js';
import { createApp } from './app.js';
import logger from './lib/logger.js';

const PORT = process.env.PORT || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD) {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    logger.fatal('JWT_SECRET inválido em produção: precisa ter pelo menos 32 caracteres.');
    process.exit(1);
  }
}

const app = createApp();

// Log de requisições
app.use((req, _res, next) => {
  logger.info({ method: req.method, path: req.path }, 'request');
  next();
});

try {
  await initDb();
  await seedDb();
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: IS_PROD ? 'production' : 'development' }, 'FinAnalyze API iniciada');
  });
} catch (e) {
  logger.fatal({ err: e }, 'falha ao iniciar');
  process.exit(1);
}
