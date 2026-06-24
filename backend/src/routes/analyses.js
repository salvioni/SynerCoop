import { Router } from 'express';
import { db } from '../lib/db.js';
import { authRequired } from '../middleware/auth.js';
import { badRequest } from '../lib/validate.js';
import { audit, ACTIONS } from '../lib/audit.js';
import { generateReport } from '../lib/report.js';
import { generateText } from '../lib/llm.js';

const router = Router();
router.use(authRequired);

// GET /analyses — list all analyses for tenant (with pagination)
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, clientId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let sql = `
      SELECT a.id, a.year, a.status, a.confidence, a.created_at,
        c.id AS client_id, c.name AS client_name,
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
      parsed.narrative,
    );

    const safeName = (analysis.client_name || 'cliente').replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_');
    const filename = `relatorio_${safeName}_${analysis.year}.docx`;
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
    narrative: a.narrative ? (typeof a.narrative === 'string' ? JSON.parse(a.narrative) : a.narrative) : null,
  };
}

const NARRATIVE_PROMPT = `Você é um analista financeiro especializado em cooperativas brasileiras.
Com base nos indicadores financeiros abaixo, gere um relatório de análise detalhado e profissional.

Empresa: {company_name}
Tipo: {company_type}
Exercício: {year}

INDICADORES: {indicators_json}
BALANÇO PATRIMONIAL: {bp_json}
DSP: {dsp_json}

Retorne SOMENTE um JSON válido (sem texto antes ou depois) com esta estrutura:
{
  "sumario": "Parágrafo de 3-5 frases resumindo a situação financeira geral.",
  "liquidez": "Parágrafo analisando liquidez corrente, geral, seca e imobilização. Cite os valores exatos.",
  "rentabilidade": "Parágrafo analisando ROE, ROA, margem e EBITDA. Cite valores.",
  "endividamento": "Parágrafo analisando endividamento total, perfil, alavancagem. Cite valores.",
  "capacidade_operacional": "Parágrafo analisando PMR, PME, PMP, ciclo financeiro, giro. Cite valores.",
  "tesouraria": "Parágrafo analisando capital de giro, NCG, tesouraria, independência. Cite valores.",
  "forcas": "1-2 frases sobre pontos fortes.",
  "fraquezas": "1-2 frases sobre pontos de atenção.",
  "riscos": "1-2 frases sobre riscos identificados.",
  "recomendacoes": ["Recomendação 1: descrição.", "Recomendação 2: descrição.", "Recomendação 3: descrição.", "Recomendação 4: descrição."]
}

Regras:
- Linguagem profissional mas acessível para contadores e diretores
- Cooperativas usam "sobras/perdas" em vez de "lucro/prejuízo"
- Cite valores exatos dos indicadores
- Recomendações práticas e acionáveis`;

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
    const prompt = NARRATIVE_PROMPT
      .replace('{company_name}', analysis.client_name)
      .replace('{company_type}', analysis.company_type || 'cooperativa')
      .replace('{year}', analysis.year)
      .replace('{indicators_json}', JSON.stringify(parsed.indicators, null, 2))
      .replace('{bp_json}', JSON.stringify(parsed.bp, null, 2))
      .replace('{dsp_json}', JSON.stringify(parsed.dsp, null, 2));

    let raw = await generateText(prompt, { maxTokens: 8000 });

    if (raw.includes('```')) {
      const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) raw = match[1];
    }
    raw = raw.trim();
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s >= 0 && e > s) raw = raw.substring(s, e + 1);
    raw = raw.replace(/,\s*([}\]])/g, '$1');

    const narrative = JSON.parse(raw);
    await db.prepare('UPDATE analyses SET narrative = ? WHERE id = ?').run(JSON.stringify(narrative), req.params.id);
    res.json({ narrative });
  } catch (e) { next(e); }
});

// PATCH /analyses/:id/narrative
router.patch('/:id/narrative', async (req, res, next) => {
  try {
    const analysis = await db.prepare(`
      SELECT a.id, c.tenant_id FROM analyses a JOIN clients c ON c.id = a.client_id WHERE a.id = ?
    `).get(req.params.id);
    if (!analysis || analysis.tenant_id !== req.user.tenant_id) throw badRequest('Análise não encontrada.');
    if (!req.body?.narrative) throw badRequest('Dados do relatório obrigatórios.');
    await db.prepare('UPDATE analyses SET narrative = ? WHERE id = ?').run(JSON.stringify(req.body.narrative), req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
