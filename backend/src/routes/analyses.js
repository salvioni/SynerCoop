import { Router } from 'express';
import { db } from '../lib/db.js';
import { authRequired } from '../middleware/auth.js';
import { badRequest } from '../lib/validate.js';
import { audit, ACTIONS } from '../lib/audit.js';
import { generateReport } from '../lib/report.js';

const router = Router();
router.use(authRequired);

// GET /analyses — list all analyses for tenant (with pagination)
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, clientId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = `
      SELECT a.id, a.year, a.status, a.confidence, a.created_at,
        c.id AS client_id, c.name AS client_name
      FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE c.tenant_id = ?
    `;
    const params = [req.user.tenant_id];
    if (clientId) { sql += ' AND a.client_id = ?'; params.push(clientId); }
    sql += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    const rows = await db.prepare(sql).all(...params);
    res.json({ analyses: rows });
  } catch (e) { next(e); }
});

// GET /analyses/:id
router.get('/:id', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.*, c.name AS client_name, c.type AS company_type, c.tenant_id
      FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');
    res.json({ analysis: _parseAnalysis(analysis) });
  } catch (e) { next(e); }
});

// DELETE /analyses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.id, c.tenant_id FROM analyses a JOIN clients c ON c.id = a.client_id WHERE a.id = ?
    `).get(req.params.id);
    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');
    await db.prepare('DELETE FROM analyses WHERE id = ?').run(req.params.id);
    await audit(req, ACTIONS.ANALYSIS_DELETED, { targetType: 'analysis', targetId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /analyses/:id/report — generate and download Word report
router.get('/:id/report', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.*, c.name AS client_name, c.type AS company_type, c.tenant_id
      FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');

    const parsed = _parseAnalysis(analysis);
    const docBuffer = await generateReport(
      analysis.client_name,
      analysis.company_type,
      analysis.year,
      parsed.indicators,
      parsed.bp,
      parsed.dsp,
    );

    const filename = `relatorio_${analysis.client_name.replace(/\s+/g, '_')}_${analysis.year}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docBuffer);
  } catch (e) { next(e); }
});

function _parseAnalysis(a) {
  return {
    ...a,
    bp: a.bp ? (typeof a.bp === 'string' ? JSON.parse(a.bp) : a.bp) : null,
    dsp: a.dsp ? (typeof a.dsp === 'string' ? JSON.parse(a.dsp) : a.dsp) : null,
    indicators: a.indicators ? (typeof a.indicators === 'string' ? JSON.parse(a.indicators) : a.indicators) : null,
  };
}

export default router;
