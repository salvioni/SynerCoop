import { Router } from 'express';
import { db } from '../lib/db.js';
import { authRequired } from '../middleware/auth.js';
import { monthsAgoISO } from '../lib/date.js';
import { countMonthlyAnalyses } from '../lib/audit.js';

const router = Router();
router.use(authRequired);

// GET /stats — tenant dashboard stats
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const [totalClients, activeClients, totalAnalyses, monthlyAnalyses, tenant] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS cnt FROM clients WHERE tenant_id = ?').get(tenantId),
      db.prepare('SELECT COUNT(*) AS cnt FROM clients WHERE tenant_id = ? AND active = 1').get(tenantId),
      db.prepare(`SELECT COUNT(*) AS cnt FROM analyses a JOIN clients c ON c.id = a.client_id WHERE c.tenant_id = ?`).get(tenantId),
      countMonthlyAnalyses(tenantId),
      db.prepare('SELECT plan FROM tenants WHERE id = ?').get(tenantId),
    ]);

    const rawByMonth = await db.prepare(`
      SELECT a.created_at FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ? AND a.created_at >= ?
      ORDER BY a.created_at
    `).all(tenantId, monthsAgoISO(12));

    const byMonthMap = {};
    for (const { created_at } of rawByMonth) {
      // new Date(...) normaliza tanto string ISO (SQLite) quanto objeto Date
      // (node-pg retorna Date para colunas TIMESTAMP) antes de formatar.
      const month = new Date(created_at).toISOString().slice(0, 7);
      byMonthMap[month] = (byMonthMap[month] || 0) + 1;
    }
    const byMonth = Object.entries(byMonthMap)
      .map(([month, cnt]) => ({ month, cnt }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const recentAnalyses = await db.prepare(`
      SELECT a.id, a.year, a.status, a.created_at,
        c.id AS client_id, c.name AS client_name
      FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ?
      ORDER BY a.created_at DESC LIMIT 5
    `).all(tenantId);

    res.json({
      totalClients: totalClients?.cnt || 0,
      activeClients: activeClients?.cnt || 0,
      totalAnalyses: totalAnalyses?.cnt || 0,
      monthlyAnalyses,
      plan: tenant?.plan || 'trial',
      byMonth,
      recentAnalyses,
    });
  } catch (e) { next(e); }
});

export default router;
