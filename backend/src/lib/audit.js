import { nanoid } from 'nanoid';
import { db } from './db.js';
import { startOfMonthISO, monthsAgoISO } from './date.js';

// Retenção de audit logs (LGPD, princípio da minimização — Art. 6º, III):
// depois desse prazo o rastro de "o quê aconteceu, quando, em qual tenant"
// continua (ação, tenant_id, timestamp), mas toda identificação pessoal é
// apagada: actor_name, target_label, meta e — quando o banco suportar a
// migração — actor_id e target_id também são zerados.
// 24 meses cobre o prazo típico de prescrição de disputas contratuais no Brasil.
const AUDIT_RETENTION_MONTHS = 24;

export const ACTIONS = {
  CLIENT_CREATED:   'client.created',
  CLIENT_UPDATED:   'client.updated',
  CLIENT_DELETED:   'client.deleted',
  ANALYSIS_CREATED: 'analysis.created',
  ANALYSIS_UPDATED: 'analysis.updated',
  ANALYSIS_DELETED: 'analysis.deleted',
  ANALYSIS_SIGNED:   'analysis.signed',
  ANALYSIS_UNSIGNED: 'analysis.unsigned',
  REPORT_GENERATED: 'report.generated',
  USER_INVITED:     'user.invited',
  USER_REMOVED:     'user.removed',
  USER_ROLE:        'user.role_changed',
  PW_CHANGED:       'account.password_changed',
  PW_SET:           'account.password_set',
  PLAN_SELECTED:    'account.plan_selected',
  LOGOUT:           'account.logout',
  DATA_EXPORTED:    'account.data_exported',
};

export async function audit(req, action, { targetType, targetId, targetLabel, meta } = {}) {
  try {
    const actor = req.user;
    if (!actor) return;
    await db.prepare(`
      INSERT INTO audit_logs (id, tenant_id, actor_id, actor_name, action, target_type, target_id, target_label, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'al' + nanoid(10),
      actor.tenant_id,
      actor.id,
      actor.name,
      action,
      targetType || '',
      targetId   || null,
      targetLabel || null,
      meta ? JSON.stringify(meta) : null
    );
  } catch (e) {
    console.error('[audit] falha ao registrar:', e.message);
  }
}

// Conta análises criadas neste mês a partir do log de auditoria, não da
// tabela `analyses` — uma análise criada e depois excluída no mesmo mês
// ainda deve contar pro limite do plano.
export async function countMonthlyAnalyses(tenantId) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS cnt FROM audit_logs
    WHERE tenant_id = ? AND action = ? AND created_at >= ?
  `).get(tenantId, ACTIONS.ANALYSIS_CREATED, startOfMonthISO());
  return row?.cnt || 0;
}

const ANON_LABEL = '[registro anonimizado]';
const ANON_ID    = '[anon]';

/**
 * Aplica a política de retenção LGPD (24 meses).
 *
 * Campos apagados após o prazo:
 *   - actor_name   → ANON_LABEL
 *   - target_label → NULL
 *   - meta         → NULL
 *   - actor_id     → ANON_ID (apenas onde a coluna aceita a escrita; em schemas
 *                    que rejeitam, o fallback abaixo preserva o resto)
 *
 * Idempotente: a condição `actor_name != ANON_LABEL` garante que linhas já
 * anonimizadas não são reprocessadas.
 *
 * @returns {Promise<number>} linhas anonimizadas NESTA execução (0 quando não
 *   havia nada novo) — é o que o agendador em server.js usa para decidir se
 *   vale logar. Nunca o total acumulado.
 */
export async function anonymizeOldAuditLogs() {
  const cutoff = monthsAgoISO(AUDIT_RETENTION_MONTHS);
  const WHERE  = 'WHERE created_at < ? AND actor_name != ?';

  // Tenta apagar actor_id também (requer a coluna nullable — ver migração em db.js).
  // Falha silenciosamente em drivers/schemas que não suportam.
  try {
    const r = await db.prepare(
      `UPDATE audit_logs SET actor_name = ?, actor_id = ?, target_label = NULL, meta = NULL ${WHERE}`
    ).run(ANON_LABEL, ANON_ID, cutoff, ANON_LABEL);
    return r.changes || 0;
  } catch {
    // Fallback sem actor_id (schema em que a coluna continua NOT NULL)
    const r = await db.prepare(
      `UPDATE audit_logs SET actor_name = ?, target_label = NULL, meta = NULL ${WHERE}`
    ).run(ANON_LABEL, cutoff, ANON_LABEL);
    return r.changes || 0;
  }
}
