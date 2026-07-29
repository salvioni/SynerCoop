import { Router } from 'express';
import { nanoid } from 'nanoid';
import multer from 'multer';
import { db } from '../lib/db.js';
import { authRequired } from '../middleware/auth.js';
import { badRequest, trim } from '../lib/validate.js';
import { audit, ACTIONS, countMonthlyAnalyses } from '../lib/audit.js';
import logger from '../lib/logger.js';
import { extractFromFile } from '../lib/extractor.js';
import { calculateIndicators } from '../lib/calculator.js';
import { generateAnalysisNarrative } from '../lib/narrative.js';
import { PLAN_LIMITS } from '../lib/plans.js';

// Barra tanto a extração (que já custa uma chamada de IA) quanto o salvamento
// final da análise quando o tenant já bateu o limite mensal do plano — sem
// isso, alguém no limite ainda queimaria uma extração inteira só pra
// descobrir no passo seguinte que não podia salvar. `code` segue a mesma
// convenção de `fields.code` já usada em PLAN_REQUIRED (ver lib/api.js no
// frontend) pra a UI reagir sem depender do texto da mensagem.
async function assertUnderMonthlyLimit(tenantId) {
  const tenant = await db.prepare('SELECT plan FROM tenants WHERE id = ?').get(tenantId);
  const limit = PLAN_LIMITS[tenant?.plan] ?? PLAN_LIMITS.trial;
  if (limit === Infinity) return;
  const monthly = await countMonthlyAnalyses(tenantId);
  if (monthly >= limit) {
    throw badRequest(
      `Limite de ${limit} análises/mês atingido no plano ${(tenant?.plan || 'trial').toUpperCase()}. Faça upgrade para continuar.`,
      { code: 'ANALYSIS_LIMIT_REACHED' }
    );
  }
}

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);
const ALLOWED_EXTS = new Set(['.pdf', '.xlsx', '.xls']);

// Logo do cliente chega como data URL (data:<mime>;base64,<...>) no corpo
// JSON, não como upload multipart — por isso a checagem de tipo é feita aqui
// no data URL em vez de fileFilter do multer. Sem GIF (evita imagem animada
// no card do cliente), mesma allow-list do logo do escritório (account.js).
const LOGO_ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/bmp']);
function validateLogoDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,/.exec(dataUrl);
  if (!match || !LOGO_ALLOWED_MIMES.has(match[1])) throw badRequest('Formato de imagem não suportado. Use PNG, JPG ou BMP.');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) return cb(new Error(`Formato não suportado: ${ext}. Use PDF, XLSX ou XLS.`));
    if (!ALLOWED_MIMES.has(file.mimetype) && !file.mimetype.includes('spreadsheet') && !file.mimetype.includes('excel')) {
      return cb(new Error('Tipo de arquivo não permitido.'));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(authRequired);

// GET /clients
router.get('/', async (req, res, next) => {
  try {
    const { search, active } = req.query;
    let sql = `
      SELECT c.*,
        COUNT(a.id) AS analysis_count,
        MAX(a.year) AS last_analysis_year
      FROM clients c
      LEFT JOIN analyses a ON a.client_id = c.id
      WHERE c.tenant_id = ?
    `;
    const params = [req.user.tenant_id];
    if (active !== undefined) {
      sql += ` AND c.active = ?`;
      params.push(active === '1' || active === 'true' ? 1 : 0);
    }
    if (search) {
      sql += ` AND (c.name LIKE ? OR c.cnpj LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ` GROUP BY c.id ORDER BY c.name`;
    const rows = await db.prepare(sql).all(...params);
    res.json({ clients: rows });
  } catch (e) { next(e); }
});

// POST /clients
router.post('/', async (req, res, next) => {
  try {
    const name = trim(req.body?.name);
    const cnpj = trim(req.body?.cnpj) || null;
    const type = trim(req.body?.type) || 'cooperativa';
    const contact_email = trim(req.body?.contact_email) || null;
    const contact_phone = trim(req.body?.contact_phone) || null;
    const notes = trim(req.body?.notes) || null;
    const logo = req.body?.logo || null;
    const logo_color = req.body?.logo_color || null;

    if (!name) throw badRequest('Nome é obrigatório.', { name: 'Informe o nome da empresa.' });
    if (logo) {
      if (logo.length > 2 * 1024 * 1024 * 1.4) throw badRequest('Imagem muito grande. Máximo 2 MB.');
      validateLogoDataUrl(logo);
    }
    if (logo_color && !/^#[0-9A-Fa-f]{6}$/.test(logo_color)) throw badRequest('Cor inválida.');

    const existing = cnpj
      ? await db.prepare('SELECT id FROM clients WHERE cnpj = ? AND tenant_id = ?').get(cnpj, req.user.tenant_id)
      : null;
    if (existing) throw badRequest('Já existe um cliente com este CNPJ.', { cnpj: 'CNPJ já cadastrado.' });

    const id = nanoid(10);
    await db.prepare(`
      INSERT INTO clients (id, tenant_id, name, cnpj, type, contact_email, contact_phone, notes, logo, logo_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.tenant_id, name, cnpj, type, contact_email, contact_phone, notes, logo, logo_color);

    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    await audit(req, ACTIONS.CLIENT_CREATED, { targetType: 'client', targetId: id, targetLabel: name });
    res.status(201).json({ client });
  } catch (e) { next(e); }
});

// GET /clients/:id
router.get('/:id', async (req, res, next) => {
  try {
    const client = await db.prepare('SELECT * FROM clients WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.user.tenant_id);
    if (!client) throw badRequest('Cliente não encontrado.');

    const analyses = await db.prepare(`
      SELECT id, year, period_label, status, confidence, bp, dsp, indicators, created_at, updated_at, signed_at, signed_by
      FROM analyses WHERE client_id = ? ORDER BY year DESC, created_at DESC
    `).all(req.params.id);

    res.json({ client, analyses });
  } catch (e) { next(e); }
});

// PUT /clients/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.prepare('SELECT id FROM clients WHERE id = ? AND tenant_id = ?')
      .get(id, req.user.tenant_id);
    if (!existing) throw badRequest('Cliente não encontrado.');

    const name = trim(req.body?.name);
    const cnpj = trim(req.body?.cnpj) || null;
    const type = trim(req.body?.type) || 'cooperativa';
    const contact_email = trim(req.body?.contact_email) || null;
    const contact_phone = trim(req.body?.contact_phone) || null;
    const notes = trim(req.body?.notes) || null;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : 1;
    const logo = req.body?.logo !== undefined ? (req.body.logo || null) : undefined;
    const logo_color = req.body?.logo_color !== undefined ? (req.body.logo_color || null) : undefined;

    if (!name) throw badRequest('Nome é obrigatório.', { name: 'Informe o nome da empresa.' });
    if (logo) {
      if (logo.length > 2 * 1024 * 1024 * 1.4) throw badRequest('Imagem muito grande. Máximo 2 MB.');
      validateLogoDataUrl(logo);
    }
    if (logo_color && !/^#[0-9A-Fa-f]{6}$/.test(logo_color)) throw badRequest('Cor inválida.');

    const extraCols = [...(logo !== undefined ? [', logo = ?'] : []), ...(logo_color !== undefined ? [', logo_color = ?'] : [])].join('');
    const extraVals = [...(logo !== undefined ? [logo] : []), ...(logo_color !== undefined ? [logo_color] : [])];
    await db.prepare(`
      UPDATE clients SET name = ?, cnpj = ?, type = ?, contact_email = ?, contact_phone = ?, notes = ?, active = ?${extraCols}
      WHERE id = ?
    `).run(name, cnpj, type, contact_email, contact_phone, notes, active, ...extraVals, id);

    const client = await db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    await audit(req, ACTIONS.CLIENT_UPDATED, { targetType: 'client', targetId: id, targetLabel: name });
    res.json({ client });
  } catch (e) { next(e); }
});

// DELETE /clients/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = await db.prepare('SELECT id, name FROM clients WHERE id = ? AND tenant_id = ?')
      .get(id, req.user.tenant_id);
    if (!client) throw badRequest('Cliente não encontrado.');
    if (req.user.self_client_id === id) throw badRequest('Não é possível excluir a própria empresa.');

    // Soft delete
    await db.prepare('UPDATE clients SET active = 0 WHERE id = ?').run(id);
    await audit(req, ACTIONS.CLIENT_DELETED, { targetType: 'client', targetId: id, targetLabel: client.name });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /clients/:id/extract — upload file, returns extracted JSON (preview, not saved)
router.post('/:id/extract', upload.single('file'), async (req, res, next) => {
  try {
    const client = await db.prepare('SELECT * FROM clients WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.user.tenant_id);
    if (!client) throw badRequest('Cliente não encontrado.');
    if (!req.file) throw badRequest('Nenhum arquivo enviado.');
    await assertUnderMonthlyLimit(req.user.tenant_id);

    const extracted = await extractFromFile(req.file.buffer, req.file.originalname, client.name);
    logger.info({ file: req.file.originalname, confidence: extracted.confidence, total_ativo: extracted.bp?.total_ativo, receita_liquida: extracted.dsp?.receita_liquida }, 'extract');
    res.json({ extracted });
  } catch (e) { next(e); }
});

// POST /clients/:id/analyses — save analysis from uploaded file
router.post('/:id/analyses', upload.single('file'), async (req, res, next) => {
  try {
    const client = await db.prepare('SELECT * FROM clients WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.user.tenant_id);
    if (!client) throw badRequest('Cliente não encontrado.');
    await assertUnderMonthlyLimit(req.user.tenant_id);

    let bpData, dspData, year, periodLabel, confidence, notes, detailData;

    if (req.file) {
      const extracted = await extractFromFile(req.file.buffer, req.file.originalname, client.name);
      bpData = extracted.bp;
      dspData = extracted.dsp;
      year = extracted.year;
      periodLabel = extracted.period_label || null;
      confidence = extracted.confidence;
      notes = extracted.notes;
      detailData = extracted.detail;
    } else if (req.body?.bp && req.body?.dsp) {
      try {
        bpData = typeof req.body.bp === 'string' ? JSON.parse(req.body.bp) : req.body.bp;
        dspData = typeof req.body.dsp === 'string' ? JSON.parse(req.body.dsp) : req.body.dsp;
        detailData = req.body.detail ? (typeof req.body.detail === 'string' ? JSON.parse(req.body.detail) : req.body.detail) : null;
      } catch {
        throw badRequest('Dados bp/dsp inválidos (JSON malformado).');
      }
      year = parseInt(req.body?.year) || new Date().getFullYear();
      periodLabel = trim(req.body?.period_label) || null;
      confidence = parseFloat(req.body?.confidence) || null;
      notes = trim(req.body?.notes) || null;
    } else {
      throw badRequest('Envie um arquivo ou forneça os dados bp/dsp manualmente.');
    }

    const indicators = calculateIndicators({ bp: bpData, dsp: dspData });

    // Um "ano" pode ter várias análises quando o período é mais granular (ex:
    // Julho de 2025 e Agosto de 2025 no mesmo ano) — o que não pode repetir é
    // o mesmo período exato pro mesmo cliente. period_label NULL (só ano) é
    // tratado como seu próprio período, então só bloqueia duplicar o ano
    // "cheio", não bloqueia um mês/trimestre específico dentro dele.
    const dup = await db.prepare(
      'SELECT id FROM analyses WHERE client_id = ? AND year = ? AND (period_label = ? OR (period_label IS NULL AND ? IS NULL))'
    ).get(client.id, year, periodLabel, periodLabel);
    if (dup) throw badRequest(`Já existe uma análise para ${periodLabel || `o ano ${year}`} deste cliente.`, { year: 'Período já analisado.' });

    const id = nanoid(10);

    // Gerar narrative via IA — falha aqui não impede salvar a análise, só
    // fica sem narrativa (pode ser gerada depois via POST /analyses/:id/narrative).
    let narrative = null;
    try {
      narrative = await generateAnalysisNarrative({
        companyName: client.name, companyType: client.type, year, indicators, bp: bpData, dsp: dspData,
      });
      logger.info({ client: client.name, year }, 'narrative gerado');
    } catch (err) {
      logger.warn({ err: err.message }, 'narrative falhou');
    }

    await db.prepare(`
      INSERT INTO analyses (id, client_id, year, bp, dsp, indicators, confidence, notes, narrative, status, created_by, detail, period_label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'editable', ?, ?, ?)
    `).run(id, client.id, year, JSON.stringify(bpData), JSON.stringify(dspData), JSON.stringify(indicators), confidence, notes, narrative ? JSON.stringify(narrative) : null, req.user.id, detailData ? JSON.stringify(detailData) : null, periodLabel);

    const analysis = await db.prepare('SELECT * FROM analyses WHERE id = ?').get(id);
    await audit(req, ACTIONS.ANALYSIS_CREATED, { targetType: 'analysis', targetId: id, targetLabel: `${client.name} ${year}` });

    const parsed = {
      ...analysis,
      bp: JSON.parse(analysis.bp || 'null'),
      dsp: JSON.parse(analysis.dsp || 'null'),
      indicators: JSON.parse(analysis.indicators || 'null'),
      narrative: analysis.narrative ? JSON.parse(analysis.narrative) : null,
    };
    res.status(201).json({ analysis: parsed });
  } catch (e) { next(e); }
});

export default router;
