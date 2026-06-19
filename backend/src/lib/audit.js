import { nanoid } from 'nanoid';
import { db } from './db.js';

export const ACTIONS = {
  CLIENT_CREATED:   'client.created',
  CLIENT_UPDATED:   'client.updated',
  CLIENT_DELETED:   'client.deleted',
  ANALYSIS_CREATED: 'analysis.created',
  ANALYSIS_DELETED: 'analysis.deleted',
  REPORT_GENERATED: 'report.generated',
  USER_INVITED:     'user.invited',
  USER_REMOVED:     'user.removed',
  USER_ROLE:        'user.role_changed',
  PW_CHANGED:       'account.password_changed',
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
