import { nanoid } from 'nanoid';
import { db } from './db.js';
import { startOfMonthISO } from './date.js';

export const ACTIONS = {
  CLIENT_CREATED:   'client.created',
  CLIENT_UPDATED:   'client.updated',
  CLIENT_DELETED:   'client.deleted',
  ANALYSIS_CREATED: 'analysis.created',
  ANALYSIS_DELETED: 'analysis.deleted',
  ANALYSIS_SIGNED:   'analysis.signed',
  ANALYSIS_UNSIGNED: 'analysis.unsigned',
  REPORT_GENERATED: 'report.generated',
  USER_INVITED:     'user.invited',
  USER_REMOVED:     'user.removed',
  USER_ROLE:        'user.role_changed',
  PW_CHANGED:       'account.password_changed',
  PLAN_SELECTED:    'account.plan_selected',
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
      targetId || null,
      targetLabel || null,
      meta ? JSON.stringify(meta) : null
    );
  } catch (e) {
    console.error('[audit] falha ao registrar:', e.message);
  }
}

// Conta análises criadas neste mês a partir do log de auditoria, não da
// tabela `analyses` — uma análise criada e depois excluída no mesmo mês
// ainda deve contar pro limite do plano e pro "análises deste mês" exibido
// (sidebar/visão geral), então não pode ser um COUNT(*) sobre linhas que
// podem ter sido apagadas. É a mesma consulta usada em account.js, stats.js
// e no gate de limite do plano em routes/clients.js — centralizada aqui pra
// nunca divergirem.
export async function countMonthlyAnalyses(tenantId) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS cnt FROM audit_logs
    WHERE tenant_id = ? AND action = ? AND created_at >= ?
  `).get(tenantId, ACTIONS.ANALYSIS_CREATED, startOfMonthISO());
  return row?.cnt || 0;
}
