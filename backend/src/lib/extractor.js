// Port do extractor.py — detecta formato do arquivo e extrai dados financeiros via IA ou mapeamento direto.

import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
import { generateText } from './llm.js';

const EXTRACTION_PROMPT = `Você é um especialista em contabilidade de cooperativas brasileiras.

Analise o documento financeiro fornecido e extraia os dados do Balanço Patrimonial (BP) e do Demonstrativo de Sobras e Perdas (DSP).

Retorne SOMENTE um JSON válido com esta estrutura exata (sem texto antes ou depois):

{
  "year": 2024,
  "bp": {
    "ativo_circulante": 0,
    "caixa": 0,
    "contas_receber_cp": 0,
    "adiantamentos": 0,
    "estoques": 0,
    "outros_creditos_cp": 0,
    "ativo_nao_circulante": 0,
    "contas_receber_lp": 0,
    "outros_creditos_lp": 0,
    "ativo_permanente": 0,
    "investimentos": 0,
    "imobilizado": 0,
    "total_ativo": 0,
    "passivo_circulante": 0,
    "contas_pagar_cp": 0,
    "emprestimos_cp": 0,
    "obrigacoes_trabalhistas": 0,
    "obrigacoes_tributarias_cp": 0,
    "outros_debitos_cp": 0,
    "passivo_nao_circulante": 0,
    "contas_pagar_lp": 0,
    "emprestimos_lp": 0,
    "obrigacoes_tributarias_lp": 0,
    "outros_debitos_lp": 0,
    "patrimonio_liquido": 0,
    "capital_social": 0,
    "capital_integralizar": 0,
    "sobras_exercicio": 0,
    "sobras_acumuladas": 0,
    "total_passivo_pl": 0
  },
  "dsp": {
    "receita_bruta": 0,
    "devolucoes": 0,
    "impostos_venda": 0,
    "receita_liquida": 0,
    "custos_vendas": 0,
    "resultado_bruto": 0,
    "despesas_comerciais": 0,
    "despesas_pessoal": 0,
    "despesas_administrativas": 0,
    "despesas_tributarias": 0,
    "outros_receitas_operacionais": 0,
    "outros_despesas_operacionais": 0,
    "despesas_operacionais": 0,
    "ebitda": 0,
    "depreciacao": 0,
    "receitas_financeiras": 0,
    "despesas_financeiras": 0,
    "resultado_antes_ir": 0,
    "ir_csll": 0,
    "sobras_perdas": 0
  },
  "confidence": 0.9,
  "notes": "observações sobre a extração"
}

Regras importantes:
- Todos os valores devem ser números (sem R$, sem pontos de milhar, sem vírgulas)
- Valores de custo/despesa devem ser NEGATIVOS (ex: custos_vendas: -500000)
- Se não encontrar um campo, deixe 0
- O campo "confidence" deve refletir sua confiança na extração (0 a 1)
- Cooperativas usam "Sobras/Perdas" em vez de "Lucro/Prejuízo"
- EBITDA = Resultado Bruto + Despesas Operacionais (sem depreciação/financeiro)`;

export async function extractFromFile(buffer, filename, companyName) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return await extractFromExcel(buffer, companyName);
  } else if (lower.endsWith('.pdf')) {
    return await extractFromPdf(buffer, companyName);
  } else {
    throw new Error(`Formato não suportado: ${filename}. Use PDF ou Excel (.xlsx/.xls).`);
  }
}

async function extractFromExcel(buffer, companyName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Tenta ler como planilha no formato padrão (Balanço Perguntado)
  if (wb.SheetNames.includes('BP') && wb.SheetNames.includes('DSP') && wb.SheetNames.includes('A.01')) {
    return extractFromStandardExcel(wb);
  }

  // Se não for o formato padrão, extrai texto e manda pro Claude
  const textContent = extractTextFromExcel(wb);
  return await extractWithAI(textContent, companyName, 'Excel');
}

function extractFromStandardExcel(wb) {
  function val(sheetName, cell) {
    try {
      const ws = wb.Sheets[sheetName];
      if (!ws) return 0;
      const c = ws[cell];
      if (!c) return 0;
      const v = c.v;
      return v !== null && v !== undefined ? parseFloat(v) || 0 : 0;
    } catch {
      return 0;
    }
  }

  const year = parseInt(wb.Sheets['BP']?.['E2']?.v) || 2024;

  const caixa = val('A.01', 'G29');
  const contas_rec_cp = val('A.02', 'G33');
  const contas_rec_lp = val('A.02', 'G34');
  const adiantamentos = val('A.03', 'G15');
  const estoques = val('A.04', 'G17');
  const outros_cp = val('A.05', 'G9');
  const outros_lp = val('A.05', 'G15');
  const investimentos = val('A.06', 'G15');
  const imobilizado_liq = val('A.07', 'J30');
  const depreciacao = val('A.07', 'I20');

  const contas_pagar_cp = val('P.01', 'G32');
  const contas_pagar_lp = val('P.01', 'G33');
  const emprest_cp = val('P.02', 'G9');
  const emprest_lp = val('P.02', 'G17');
  const obrig_trab = val('P.03', 'G18');
  const obrig_trib_cp = val('P.04', 'G21');
  const obrig_trib_lp = val('P.04', 'G22');
  const outros_deb_cp = val('P.05', 'G9');
  const outros_deb_lp = val('P.05', 'G17');
  const capital_social = val('P.06', 'G9');
  const capital_integralizar = val('P.06', 'G11');

  const receita_bruta = val('C.01', 'G9');
  const devolucoes = val('C.02', 'G9');
  const impostos_venda = val('C.02', 'G13');
  const receita_liquida = receita_bruta - devolucoes - impostos_venda;
  const custos_vendas = val('C.03', 'I14');
  const resultado_bruto = receita_liquida + custos_vendas;
  const desp_comerc = val('C.04', 'G19');
  const desp_pessoal = val('C.05', 'G20');
  const desp_admin = val('C.06', 'G20');
  const desp_trib = val('C.07', 'G14');
  const outros_rec_op = val('C.08', 'G13');
  const outros_desp_op = val('C.08', 'G19');
  const desp_op = -(desp_comerc + desp_pessoal + desp_admin + desp_trib) + outros_rec_op - outros_desp_op;
  const ebitda = resultado_bruto + desp_op;
  const rec_fin = val('C.09', 'G14');
  const desp_fin = val('C.09', 'G22');
  const ir_csll = val('C.10', 'G13');
  const resultado_antes_ir = ebitda - depreciacao + rec_fin - desp_fin;
  const sobras = resultado_antes_ir - ir_csll;

  const ativo_circ = caixa + contas_rec_cp + adiantamentos + estoques + outros_cp;
  const ativo_permanente = investimentos + imobilizado_liq;
  const ativo_nao_circ = contas_rec_lp + outros_lp + ativo_permanente;
  const total_ativo = ativo_circ + ativo_nao_circ;

  const passivo_circ = contas_pagar_cp + emprest_cp + obrig_trab + obrig_trib_cp + outros_deb_cp;
  const passivo_nao_circ = contas_pagar_lp + emprest_lp + obrig_trib_lp + outros_deb_lp;
  const pl_base = (capital_social - capital_integralizar) + sobras;
  const sobras_acum = total_ativo - passivo_circ - passivo_nao_circ - pl_base;
  const pl = pl_base + sobras_acum;

  return {
    year,
    bp: {
      ativo_circulante: ativo_circ, caixa, contas_receber_cp: contas_rec_cp,
      adiantamentos, estoques, outros_creditos_cp: outros_cp,
      ativo_nao_circulante: ativo_nao_circ, contas_receber_lp: contas_rec_lp,
      outros_creditos_lp: outros_lp, ativo_permanente, investimentos,
      imobilizado: imobilizado_liq, total_ativo, passivo_circulante: passivo_circ,
      contas_pagar_cp, emprestimos_cp: emprest_cp, obrigacoes_trabalhistas: obrig_trab,
      obrigacoes_tributarias_cp: obrig_trib_cp, outros_debitos_cp: outros_deb_cp,
      passivo_nao_circulante: passivo_nao_circ, contas_pagar_lp,
      emprestimos_lp: emprest_lp, obrigacoes_tributarias_lp: obrig_trib_lp,
      outros_debitos_lp: outros_deb_lp, patrimonio_liquido: pl,
      capital_social, capital_integralizar, sobras_exercicio: sobras,
      sobras_acumuladas: sobras_acum, total_passivo_pl: total_ativo,
    },
    dsp: {
      receita_bruta, devolucoes: -devolucoes, impostos_venda: -impostos_venda,
      receita_liquida, custos_vendas, resultado_bruto,
      despesas_comerciais: -desp_comerc, despesas_pessoal: -desp_pessoal,
      despesas_administrativas: -desp_admin, despesas_tributarias: -desp_trib,
      outros_receitas_operacionais: outros_rec_op, outros_despesas_operacionais: -outros_desp_op,
      despesas_operacionais: desp_op, ebitda, depreciacao: -depreciacao,
      receitas_financeiras: rec_fin, despesas_financeiras: -desp_fin,
      resultado_antes_ir, ir_csll: -ir_csll, sobras_perdas: sobras,
    },
    confidence: 1.0,
    notes: 'Extraído do formato padrão Balanço Perguntado',
  };
}

function extractTextFromExcel(wb) {
  const lines = [];
  for (const sheetName of wb.SheetNames) {
    lines.push(`\n=== ${sheetName} ===`);
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let r = range.s.r; r <= range.e.r; r++) {
      const rowVals = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v !== null && cell.v !== undefined) {
          rowVals.push(String(cell.v));
        }
      }
      if (rowVals.length) lines.push(rowVals.join(' | '));
    }
  }
  return lines.join('\n');
}

function extractFinancialSection(text) {
  const lower = text.toLowerCase();
  const markers = ['balanço patrimonial', 'balanços patrimoniais', 'demonstrações financeiras', 'demonstrações contábeis', 'demonstração do resultado'];
  let bestStart = -1;
  for (const m of markers) {
    const idx = lower.indexOf(m);
    if (idx >= 0 && (bestStart < 0 || idx < bestStart)) bestStart = idx;
  }
  if (bestStart > 0) {
    const section = text.substring(Math.max(0, bestStart - 200));
    if (section.length > 80000) return section.substring(0, 80000);
    return section;
  }
  return null;
}

async function extractFromPdf(buffer, companyName) {
  let fullText = '';
  try {
    const data = await pdfParse(buffer);
    fullText = data.text || '';
  } catch (e) {
    throw new Error(`Não foi possível ler o PDF: ${e.message}`);
  }

  // Tentar extrair só a seção financeira pra reduzir tokens
  const financialSection = extractFinancialSection(fullText);
  const textToSend = financialSection || (fullText.length > 80000 ? fullText.slice(-80000) : fullText);

  console.log(`[extract-pdf] Total: ${fullText.length} chars, Enviando: ${textToSend.length} chars, Seção financeira: ${financialSection ? 'sim' : 'não'}`);

  return await extractWithAI(textToSend, companyName, 'PDF');
}

async function extractWithAI(textContent, companyName, sourceType) {
  const prompt = `Empresa: ${companyName}
Tipo de arquivo: ${sourceType}

Documento financeiro:
${textContent}

${EXTRACTION_PROMPT}`;

  let raw = await generateText(prompt, { maxTokens: 16000 });

  // Limpar markdown e texto extra
  if (raw.includes('```')) {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) raw = match[1];
  }
  raw = raw.trim();

  // Encontrar o JSON no texto (pode ter texto antes/depois)
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    raw = raw.substring(jsonStart, jsonEnd + 1);
  }

  // Corrigir problemas comuns: trailing commas, NaN, comentários
  raw = raw.replace(/,\s*([}\]])/g, '$1');
  raw = raw.replace(/:\s*NaN/g, ': 0');
  raw = raw.replace(/\/\/.*/g, '');

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('[extractor] JSON inválido da IA. Primeiros 500 chars:', raw.substring(0, 500));
    throw new Error('A IA retornou dados em formato inválido. Tente novamente.');
  }
}
