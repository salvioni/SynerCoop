import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import usersRoutes from './routes/users.js';
import clientsRoutes from './routes/clients.js';
import analysesRoutes from './routes/analyses.js';
import statsRoutes from './routes/stats.js';
import adminRoutes from './routes/admin.js';
import stripeRoutes from './routes/stripe.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:5173', 'http://localhost:5174'];
  app.use(cors({ origin: allowedOrigins, credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
  app.use('/stripe/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '50mb' }));
  app.use(rateLimit({ windowMs: 60_000, max: 1000, standardHeaders: true, legacyHeaders: false }));

  app.get('/', (_req, res) => res.json({ ok: true, app: 'SynerCoop API' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/auth', authRoutes);
  app.use('/account', accountRoutes);
  app.use('/users', usersRoutes);
  app.use('/clients', clientsRoutes);
  app.use('/analyses', analysesRoutes);
  app.use('/stats', statsRoutes);
  app.use('/admin', adminRoutes);
  app.use('/stripe', stripeRoutes);

  app.use((err, _req, res, _next) => {
    if (err.status) return res.status(err.status).json({ error: err.message, fields: err.fields || undefined });
    if (err.message?.includes('Formato não suportado') || err.message?.includes('File too large') || err.message?.includes('Limite de requisições') || err.message?.includes('Tipo de arquivo')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[ERRO 500]', err.message, err.stack?.split('\n').slice(0,3).join(' '));
    res.status(500).json({ error: err.message || 'Erro interno do servidor.' });
  });

  return app;
}
