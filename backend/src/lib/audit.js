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

const ANON_LABEL = '[anonimizado]';
const ANON_ID    = '[anon]';

/**
 * Aplica a política de retenção LGPD (24 meses).
 *
 * Campos apagados após o prazo:
 *   - actor_name   → '[anonimizado]'
 *   - target_label → NULL
 *   - meta         → NULL
 *   - actor_id     → '[anon]' (apenas em Postgres, onde a coluna pode ser nullable;
 *                    no SQLite a migração que torna a coluna nullable pode não ter
 *                    sido aplicada, mas a tentativa é feita de qualquer forma)
 *
 * Idempotente: a condição `actor_name != ANON_LABEL` garante que linhas
 * já anonimizadas não são reprocessadas.
 */
export async function anonymizeOldAuditLogs() {
  const cutoff = monthsAgoISO(AUDIT_RETENTION_MONTHS);

  // Tenta apagar actor_id também (requer a coluna nullable — ver migração em db.js).
  // Falha silenciosamente em drivers/schemas que não suportam.
  try {
    await db.exec(`
      UPDATE audit_logs
      SET actor_name = '${ANON_LABEL}', actor_id = '${ANON_ID}', target_label = NULL, meta = NULL
      WHERE created_at < '${cutoff}' AND actor_name != '${ANON_LABEL}'
    `);
    // Conta linhas afetadas via query separada (compatível com ambos os drivers)
    const row = await db.prepare(
      `SELECT COUNT(*) AS cnt FROM audit_logs WHERE created_at < ? AND actor_name = ?`
    ).get(cutoff, ANON_LABEL);
    return row?.cnt || 0;
  } catch {
    // Fallback sem actor_id (SQLite sem a coluna nullable)
    await db.exec(`
      UPDATE audit_logs
      SET actor_name = '${ANON_LABEL}', target_label = NULL, meta = NULL
      WHERE created_at < '${cutoff}' AND actor_name != '${ANON_LABEL}'
    `);
    const row = await db.prepare(
      `SELECT COUNT(*) AS cnt FROM audit_logs WHERE created_at < ? AND actor_name = ?`
    ).get(cutoff, ANON_LABEL);
    return row?.cnt || 0;
  }
}
