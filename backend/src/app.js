import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { verifyToken } from './lib/jwt.js';
import logger from './lib/logger.js';
import { sentryRequestHandler, sentryErrorHandler } from './lib/sentry.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import usersRoutes from './routes/users.js';
import clientsRoutes from './routes/clients.js';
import analysesRoutes from './routes/analyses.js';
import statsRoutes from './routes/stats.js';
import adminRoutes from './routes/admin.js';
import stripeRoutes from './routes/stripe.js';
import contactRoutes from './routes/contact.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  // Sentry request handler deve ser o primeiro middleware
  app.use(sentryRequestHandler());

  // ── Segurança: cabeçalhos HTTP ──────────────────────────────────────────
  // Esta API serve exclusivamente JSON — a CSP é mínima e não afeta o SPA
  // frontend (que deve ter sua própria CSP configurada no servidor web/CDN).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'none'"],
        scriptSrc:   ["'none'"],
        objectSrc:   ["'none'"],
        baseUri:     ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // Necessário para que os uploads servidos como <img> não bloqueiem
    // quando o SPA está em domínio diferente da API.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174')
    .split(',').map(u => u.trim());
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE'],
    allowedHeaders: ['Content-Type','Authorization'],
  }));

  // O webhook do Stripe precisa do body raw (não parseado) para validar assinatura
  app.use('/stripe/webhook', express.raw({ type: 'application/json' }));

  // Limite de 10 MB: suficiente para logos de cliente em base64 (máx ~2.8 MB).
  // Quando UPLOAD_DIR está configurado, imagens vão via multipart e esse
  // limite não as afeta.
  app.use(express.json({ limit: '10mb' }));

  // ── Rate limit global ───────────────────────────────────────────────────
  // 120 req/min por IP (2/s médio). Rotas sensíveis têm limites próprios
  // muito mais baixos definidos em cada router (login: 5/min, etc.).
  app.use(rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Aguarde um momento.' },
    skip: () => process.env.NODE_ENV === 'test',
  }));

  app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'request');
    next();
  });

  // ── Uploads estáticos (avatars, logos) ─────────────────────────────────
  // Só ativo quando UPLOAD_DIR está configurado. Requer Bearer token válido
  // e garante isolamento de tenant: o caminho começa com /{tenantId}/.
  const UPLOAD_DIR = process.env.UPLOAD_DIR || '';
  if (UPLOAD_DIR) {
    app.use('/uploads', (req, res, next) => {
      // Aceita token no header ou como query param (para uso em src de <img>)
      const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : req.query?.token;
      if (!token) return res.status(401).json({ error: 'Não autorizado.' });
      const payload = verifyToken(token);
      if (!payload) return res.status(401).json({ error: 'Token inválido.' });
      // Isolamento de tenant: primeiro segmento do path = tenantId
      const pathTenantId = req.path.split('/').find(Boolean);
      if (pathTenantId && pathTenantId !== payload.cid) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
      next();
    }, express.static(UPLOAD_DIR, { maxAge: '7d', etag: true }));
  }

  // ── Rotas ───────────────────────────────────────────────────────────────
  app.get('/', (_req, res) => res.json({ ok: true, app: 'SynerCoop API' }));

  // /health verifica conectividade real com o banco — não apenas "processo vivo".
  // Importante para load balancers e orquestradores (Render, k8s) detectarem
  // falhas de banco antes de rotear tráfego.
  app.get('/health', async (_req, res) => {
    try {
      const { db } = await import('./lib/db.js');
      await db.prepare('SELECT 1').get();
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', db: 'unavailable' });
    }
  });

  app.use('/auth',     authRoutes);
  app.use('/account',  accountRoutes);
  app.use('/users',    usersRoutes);
  app.use('/clients',  clientsRoutes);
  app.use('/analyses', analysesRoutes);
  app.use('/stats',    statsRoutes);
  app.use('/admin',    adminRoutes);
  app.use('/stripe',   stripeRoutes);
  app.use('/contact',  contactRoutes);

  // Sentry captura erros antes do handler customizado
  app.use(sentryErrorHandler());

  // ── Error handler global ────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, fields: err.fields || undefined });
    }
    if (
      err.message?.includes('Formato não suportado') ||
      err.message?.includes('File too large') ||
      err.message?.includes('Limite de requisições') ||
      err.message?.includes('Tipo de arquivo')
    ) {
      return res.status(400).json({ error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack?.split('\n').slice(0, 3) }, 'Erro 500');
    const IS_PROD = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: IS_PROD ? 'Erro interno do servidor.' : (err.message || 'Erro interno do servidor.'),
    });
  });

  return app;
}
