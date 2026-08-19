import { Router } from 'express';
import { db } from '../lib/db.js';
import { authRequired } from '../middleware/auth.js';
import { badRequest, trim } from '../lib/validate.js';
import { audit, ACTIONS } from '../lib/audit.js';
import { generateReport } from '../lib/report.js';
import { generateAnalysisNarrative } from '../lib/narrative.js';
import { buildAnalysisExcel } from '../lib/excelExport.js';
import { calculateIndicators } from '../lib/calculator.js';
import { periodSlug } from '../lib/period.js';

const router = Router();
router.use(authRequired);

// GET /analyses — list all analyses for tenant (with pagination)
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, clientId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = `
      SELECT a.id, a.year, a.period_label, a.status, a.confidence, a.created_at, a.signed_at,
        c.id AS client_id, c.name AS client_name, c.active AS client_active,
        u.name AS user_name, u.avatar AS user_avatar, u.avatar_color AS user_avatar_color
      FROM analyses a
      JOIN clients c ON c.id = a.client_id
      LEFT JOIN users u ON u.id = a.created_by
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
      SELECT a.*, c.name AS client_name, c.type AS company_type, c.tenant_id, c.active AS client_active,
        su.name AS signed_by_name
      FROM analyses a JOIN clients c ON c.id = a.client_id
      LEFT JOIN users su ON su.id = a.signed_by
      WHERE a.id = ?
    `).get(req.params.id);

    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');
    res.json({ analysis: _parseAnalysis(analysis) });
  } catch (e) { next(e); }
});

// PATCH /analyses/:id/data — edita os dados financeiros de uma análise editável.
// Permite corrigir bp/dsp manualmente após a extração sem precisar resubmeter o arquivo.
// Recalcula os indicadores automaticamente e limpa a narrativa para que seja
// regenerada na próxima visualização com os dados atualizados.
router.patch('/:id/data', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.id, a.status, a.year, a.period_label, a.client_id,
             c.tenant_id, c.name AS client_name, c.type AS company_type
      FROM analyses a JOIN clients c ON c.id = a.client_id WHERE a.id = ?
    `).get(req.params.id);

    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');
    if (analysis.status === 'signed') {
      throw badRequest('Análise assinada não pode ser editada. Revogue a assinatura antes.');
    }

    // Campos financeiros (bp e dsp são obrigatórios para recalcular)
    let bpData, dspData;
    try {
      bpData  = req.body?.bp  ? (typeof req.body.bp  === 'string' ? JSON.parse(req.body.bp)  : req.body.bp)  : undefined;
      dspData = req.body?.dsp ? (typeof req.body.dsp === 'string' ? JSON.parse(req.body.dsp) : req.body.dsp) : undefined;
    } catch {
      throw badRequest('Dados bp/dsp inválidos (JSON malformado).');
    }

    if (!bpData && !dspData && req.body?.year === undefined && req.body?.period_label === undefined) {
      throw badRequest('Informe ao menos um campo para atualizar (bp, dsp, year ou period_label).');
    }

    // Lê os valores atuais para campos não enviados
    const current = await db.prepare('SELECT bp, dsp, year, period_label FROM analyses WHERE id = ?').get(analysis.id);
    const newBp   = bpData  ?? JSON.parse(current.bp  || 'null');
    const newDsp  = dspData ?? JSON.parse(current.dsp || 'null');
    const newYear = req.body?.year !== undefined ? parseInt(req.body.year) : current.year;
    const newPeriodLabel = req.body?.period_label !== undefined
      ? (trim(req.body.period_label) || null)
      : current.period_label;

    if (!newYear || isNaN(newYear)) throw badRequest('Ano inválido.', { year: 'Informe um ano válido.' });

    // Bloqueia duplicidade de período (exceto o próprio registro sendo editado)
    if (newYear !== current.year || newPeriodLabel !== current.period_label) {
      const dup = await db.prepare(
        'SELECT id FROM analyses WHERE client_id = ? AND year = ? AND (period_label = ? OR (period_label IS NULL AND ? IS NULL)) AND id != ?'
      ).get(analysis.client_id, newYear, newPeriodLabel, newPeriodLabel, analysis.id);
      if (dup) throw badRequest(`Já existe uma análise para ${newPeriodLabel || `o ano ${newYear}`} deste cliente.`);
    }

    // Recalcula indicadores com os dados novos
    const newIndicators = calculateIndicators({ bp: newBp, dsp: newDsp });

    // Limpa a narrativa para forçar regeneração com os dados corretos
    await db.prepare(`
      UPDATE analyses
      SET bp = ?, dsp = ?, indicators = ?, year = ?, period_label = ?,
          narrative = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify(newBp), JSON.stringify(newDsp), JSON.stringify(newIndicators),
      newYear, newPeriodLabel, analysis.id
    );

    await audit(req, ACTIONS.ANALYSIS_UPDATED, {
      targetType: 'analysis', targetId: analysis.id,
      targetLabel: `${analysis.client_name} ${newYear}`,
    });

    const updated = await db.prepare('SELECT * FROM analyses WHERE id = ?').get(analysis.id);
    res.json({ analysis: _parseAnalysis(updated) });
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
      SELECT a.*, c.name AS client_name, c.type AS company_type, c.tenant_id, su.name AS signed_by_name
      FROM analyses a JOIN clients c ON c.id = a.client_id
      LEFT JOIN users su ON su.id = a.signed_by
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
      parsed.narrative,
      req.user.tenant_logo,
      analysis.status === 'signed' ? { name: analysis.signed_by_name, at: analysis.signed_at } : null,
      analysis.period_label,
    );

    const safeName = (analysis.client_name || 'cliente').replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_');
    const filename = `relatorio_${safeName}_${periodSlug(analysis.year, analysis.period_label)}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docBuffer);
  } catch (e) { next(e); }
});

// GET /analyses/:id/excel — generate and download the filled Balanço Perguntado
router.get('/:id/excel', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.*, c.name AS client_name, c.tenant_id
      FROM analyses a JOIN clients c ON c.id = a.client_id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');

    const parsed = _parseAnalysis(analysis);
    const excelBuffer = await buildAnalysisExcel({
      bp: parsed.bp, dsp: parsed.dsp, year: analysis.year,
      detail: parseJsonField(analysis.detail),
    });

    const safeName = (analysis.client_name || 'cliente').replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_');
    const filename = `balanco_${safeName}_${periodSlug(analysis.year, analysis.period_label)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  } catch (e) { next(e); }
});

function parseJsonField(v) {
  if (!v) return null;
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function _parseAnalysis(a) {
  return {
    ...a,
    bp: parseJsonField(a.bp),
    dsp: parseJsonField(a.dsp),
    indicators: parseJsonField(a.indicators),
    narrative: parseJsonField(a.narrative),
  };
}

// POST /analyses/:id/narrative
router.post('/:id/narrative', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.*, c.name AS client_name, c.type AS company_type, c.tenant_id
      FROM analyses a JOIN clients c ON c.id = a.client_id WHERE a.id = ?
    `).get(req.params.id);
    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');

    if (analysis.narrative) {
      return res.json({ narrative: typeof analysis.narrative === 'string' ? JSON.parse(analysis.narrative) : analysis.narrative });
    }

    const parsed = _parseAnalysis(analysis);
    const narrative = await generateAnalysisNarrative({
      companyName: analysis.client_name,
      companyType: analysis.company_type,
      year: analysis.year,
      indicators: parsed.indicators,
      bp: parsed.bp,
      dsp: parsed.dsp,
    });
    await db.prepare('UPDATE analyses SET narrative = ? WHERE id = ?').run(JSON.stringify(narrative), req.params.id);
    res.json({ narrative });
  } catch (e) { next(e); }
});

// PATCH /analyses/:id/narrative
router.patch('/:id/narrative', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.id, a.status, c.tenant_id FROM analyses a JOIN clients c ON c.id = a.client_id WHERE a.id = ?
    `).get(req.params.id);
    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');
    if (analysis.status === 'signed') throw badRequest('Análise assinada não pode ser editada. Revogue a assinatura antes.');
    if (!req.body?.narrative) throw badRequest('Dados do relatório obrigatórios.');
    await db.prepare('UPDATE analyses SET narrative = ? WHERE id = ?').run(JSON.stringify(req.body.narrative), req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /analyses/:id/sign — trava a análise e estampa a assinatura no relatório.
router.post('/:id/sign', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.id, a.status, c.tenant_id, c.name AS client_name FROM analyses a JOIN clients c ON c.id = a.client_id WHERE a.id = ?
    `).get(req.params.id);
    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');
    if (analysis.status === 'signed') throw badRequest('Análise já está assinada.');

    await db.prepare(`UPDATE analyses SET status = 'signed', signed_at = CURRENT_TIMESTAMP, signed_by = ? WHERE id = ?`)
      .run(req.user.id, req.params.id);
    await audit(req, ACTIONS.ANALYSIS_SIGNED, { targetType: 'analysis', targetId: req.params.id, targetLabel: analysis.client_name });

    const updated = await db.prepare(`
      SELECT a.signed_at, su.name AS signed_by_name FROM analyses a LEFT JOIN users su ON su.id = a.signed_by WHERE a.id = ?
    `).get(req.params.id);
    res.json({ ok: true, status: 'signed', signed_at: updated.signed_at, signed_by_name: updated.signed_by_name });
  } catch (e) { next(e); }
});

// DELETE /analyses/:id/sign — revoga a assinatura, volta a permitir edição.
router.delete('/:id/sign', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.id, c.tenant_id, c.name AS client_name FROM analyses a JOIN clients c ON c.id = a.client_id WHERE a.id = ?
    `).get(req.params.id);
    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');

    await db.prepare(`UPDATE analyses SET status = 'editable', signed_at = NULL, signed_by = NULL WHERE id = ?`).run(req.params.id);
    await audit(req, ACTIONS.ANALYSIS_UNSIGNED, { targetType: 'analysis', targetId: req.params.id, targetLabel: analysis.client_name });
    res.json({ ok: true, status: 'editable' });
  } catch (e) { next(e); }
});

export default router;
