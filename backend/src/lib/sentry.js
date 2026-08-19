// lib/sentry.js — Integração opcional com Sentry para monitoramento de erros.
//
// Ativa automaticamente quando SENTRY_DSN está definido no .env E o pacote
// @sentry/node está instalado. Se apenas o DSN estiver definido sem o pacote,
// emite um aviso em console e segue sem monitoramento.
//
// Para ativar:
//   npm install @sentry/node
//   SENTRY_DSN=https://....ingest.sentry.io/... (no .env de produção)

let Sentry = null;

const DSN = process.env.SENTRY_DSN;

if (DSN) {
  try {
    const mod = await import('@sentry/node');
    Sentry = mod.default ?? mod;
    Sentry.init({
      dsn: DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.05, // 5% das transações amostradas para performance
      attachStacktrace: true,
    });
    console.log('[sentry] monitoramento de erros ativo');
  } catch {
    console.warn(
      '[sentry] SENTRY_DSN definido mas @sentry/node não encontrado. ' +
      'Execute: npm install @sentry/node'
    );
  }
}

/**
 * Captura uma exceção e envia ao Sentry (no-op quando não configurado).
 * @param {Error}  err     Erro a capturar
 * @param {object} extras  Contexto adicional (ex: userId, tenantId)
 */
export function captureException(err, extras) {
  if (!Sentry) return;
  Sentry.withScope(scope => {
    if (extras) scope.setExtras(extras);
    Sentry.captureException(err);
  });
}

/**
 * Middleware Express que registra dados da requisição no Sentry.
 * Deve ser o PRIMEIRO middleware após createApp().
 */
export function sentryRequestHandler() {
  if (Sentry?.Handlers?.requestHandler) return Sentry.Handlers.requestHandler();
  return (_req, _res, next) => next();
}

/**
 * Middleware Express que captura erros não tratados para o Sentry.
 * Deve ficar ANTES do error handler customizado da aplicação.
 */
export function sentryErrorHandler() {
  if (Sentry?.Handlers?.errorHandler) return Sentry.Handlers.errorHandler();
  return (_err, _req, _res, next) => next(_err);
}
