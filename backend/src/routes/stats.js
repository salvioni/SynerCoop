import { Router } from 'express';
import { db } from '../lib/db.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

// GET /stats — tenant dashboard stats
router.get('/', async (req, res, next) => {
  try {
    const tenantId = req.user.tenant_id;

    const totalClients = await db.prepare(
      'SELECT COUNT(*) AS cnt FROM clients WHERE tenant_id = ?'
    ).get(tenantId);

    const activeClients = await db.prepare(
      'SELECT COUNT(*) AS cnt FROM clients WHERE tenant_id = ? AND active = 1'
    ).get(tenantId);

    const totalAnalyses = await db.prepare(`
      SELECT COUNT(*) AS cnt FROM analyses a
      JOIN clients c ON c.id = a.client_id WHERE c.tenant_id = ?
    `).get(tenantId);

    const monthlyAnalyses = await db.prepare(`
      SELECT COUNT(*) AS cnt FROM analyses a
      JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ? AND a.created_at >= date('now', 'start of month')
    `).get(tenantId);

    const tenant = await db.prepare('SELECT plan FROM tenants WHERE id = ?').get(tenantId);

    // Last 12 months of analyses
    const byMonth = await db.prepare(`
      SELECT strftime('%Y-%m', a.created_at) AS month, COUNT(*) AS cnt
      FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ?
        AND a.created_at >= date('now', '-12 months')
      GROUP BY month ORDER BY month
    `).all(tenantId);

    // Recent analyses
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
      monthlyAnalyses: monthlyAnalyses?.cnt || 0,
      plan: tenant?.plan || 'trial',
      byMonth,
      recentAnalyses,
    });
  } catch (e) { next(e); }
});

export default router;
