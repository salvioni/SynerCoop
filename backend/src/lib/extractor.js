// Port do extractor.py — detecta formato do arquivo e extrai dados financeiros via IA ou mapeamento direto.

import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
import { generateText, parseJsonFromLLM } from './llm.js';
import { detectPeriodFromFilename, mergePeriod } from './period.js';

// REGRA CRÍTICA DO PROMPT: o JSON de exemplo usa null em todos os campos
// financeiros — não 0. Se o exemplo mostrasse 0, o LLM ancoraria nele e
// retornaria zeros mesmo para campos não encontrados, quebrando a distinção
// null ("não encontrei") vs 0 ("o documento informa que é zero") que toda a
// pipeline de cálculo e narrativa depende para não inventar indicadores falsos.
const EXTRACTION_PROMPT = `Você é um especialista em contabilidade de cooperativas brasileiras.

Analise o documento financeiro fornecido e extraia os dados do Balanço Patrimonial (BP) e do Demonstrativo de Sobras e Perdas (DSP).

REGRAS IMPORTANTES (leia antes de ver a estrutura):
- Todos os valores devem ser números puros (sem R$, sem pontos de milhar, sem vírgulas)
- Valores de custo/despesa devem ser NEGATIVOS (ex: custos_vendas: -500000, devolucoes: -1000)
  Isso inclui: custos_vendas, devolucoes, impostos_venda, todas as despesas_*, depreciacao, ir_csll, despesas_financeiras
- Receitas e ativos são POSITIVOS
- Se não encontrar um campo no documento, retorne null — NUNCA invente ou estime um valor
  null = "não encontrei essa informação no documento"
  0   = "o documento informa que o valor real é zero" (use só quando o documento explicitamente mostra zero)
  Tratar os dois como a mesma coisa cria viés grave na análise (ex: parecer que não há
  dívida quando na verdade o dado simplesmente não estava no documento)
- Cooperativas usam "Sobras/Perdas" em vez de "Lucro/Prejuízo"
- EBITDA = Resultado Bruto + Despesas Operacionais (sem depreciação e sem resultado financeiro)
- "inadimplencia_pct": razão entre a PERDA ESTIMADA do contas a receber e o TOTAL a receber,
  como fração decimal (ex: 0.0804 para 8,04%), sempre POSITIVA. A perda estimada costuma
  aparecer como "Perdas estimadas em créditos de liquidação duvidosa", "PECLD", "Provisão
  para devedores duvidosos" ou "PDD" — no balanço é uma conta redutora do contas a receber
  (valor negativo). Divida o módulo dela pelo contas a receber BRUTO (antes da dedução).
  Se qualquer um dos dois não estiver no documento, retorne null — não estime.
- "confidence": sua confiança geral na extração (0.0 a 1.0)
- "year": o exercício fiscal que o documento representa — o ANO em que o período contábil ENCERROU.
  NÃO o ano em que o documento foi preparado, assinado, aprovado ou impresso.
  "Balanço em 31/12/2024" → year: 2024, mesmo que o rodapé ou carimbo mostrem uma data de 2025.
  "Exercício social encerrado em 31 de dezembro de 2024" → year: 2024.
  Se o documento tiver colunas comparativas de anos diferentes, use o exercício MAIS RECENTE.
- "period_label": se o cabeçalho indicar período mais específico que o ano (ex: "Julho/2025",
  "1º Trimestre de 2025"), preencha por extenso. Se houver colunas de comparação com anos
  anteriores, use o exercício PRINCIPAL, não o de comparação. Se só o ano constar, deixe null.

Retorne SOMENTE um JSON válido com esta estrutura (sem texto antes ou depois).
Todos os campos financeiros aparecem como null no exemplo — substitua pelo valor real
encontrado no documento, ou mantenha null se não encontrar:

{
  "year": 2024,
  "period_label": null,
  "bp": {
    "ativo_circulante": null,
    "caixa": null,
    "contas_receber_cp": null,
    "adiantamentos": null,
    "estoques": null,
    "outros_creditos_cp": null,
    "ativo_nao_circulante": null,
    "contas_receber_lp": null,
    "outros_creditos_lp": null,
    "ativo_permanente": null,
    "investimentos": null,
    "imobilizado": null,
    "total_ativo": null,
    "passivo_circulante": null,
    "contas_pagar_cp": null,
    "emprestimos_cp": null,
    "obrigacoes_trabalhistas": null,
    "obrigacoes_tributarias_cp": null,
    "outros_debitos_cp": null,
    "passivo_nao_circulante": null,
    "contas_pagar_lp": null,
    "emprestimos_lp": null,
    "obrigacoes_tributarias_lp": null,
    "outros_debitos_lp": null,
    "patrimonio_liquido": null,
    "capital_social": null,
    "capital_integralizar": null,
    "sobras_exercicio": null,
    "sobras_acumuladas": null,
    "total_passivo_pl": null
  },
  "dsp": {
    "receita_bruta": null,
    "devolucoes": null,
    "impostos_venda": null,
    "receita_liquida": null,
    "custos_vendas": null,
    "resultado_bruto": null,
    "despesas_comerciais": null,
    "despesas_pessoal": null,
    "despesas_administrativas": null,
    "despesas_tributarias": null,
    "outros_receitas_operacionais": null,
    "outros_despesas_operacionais": null,
    "despesas_operacionais": null,
    "ebitda": null,
    "depreciacao": null,
    "receitas_financeiras": null,
    "despesas_financeiras": null,
    "resultado_antes_ir": null,
    "ir_csll": null,
    "sobras_perdas": null,
    "inadimplencia_pct": null
  },
  "confidence": 0.9,
  "notes": "observações sobre a extração"
}`;

export async function extractFromFile(buffer, filename, companyName) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return await extractFromExcel(buffer, filename, companyName);
  } else if (lower.endsWith('.pdf')) {
    return await extractFromPdf(buffer, filename, companyName);
  } else {
    throw new Error(`Formato não suportado: ${filename}. Use PDF ou Excel (.xlsx/.xls).`);
  }
}

async function extractFromExcel(buffer, filename, companyName) {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  // Tenta ler como planilha no formato padrão (Balanço Perguntado)
  if (wb.SheetNames.includes('BP') && wb.SheetNames.includes('DSP') && wb.SheetNames.includes('A.01')) {
    return extractFromStandardExcel(wb, filename);
  }

  // Se não for o formato padrão, extrai texto e manda pro Claude
  const textContent = extractTextFromExcel(wb);
  return await extractWithAI(textContent, companyName, 'Excel', filename);
}

// Inverte o sinal preservando null — "-null" viraria -0 (um valor numérico
// real) e apagaria a informação de "não encontrado" nos campos que só
// invertem o sinal de uma célula lida (ex: despesas, sempre negativas no
// nosso formato) sem agregar mais nada.
function neg(v) { return v == null ? null : -v; }

function extractFromStandardExcel(wb, filename) {
  // null = célula ausente/em branco no modelo ("não encontrado"); só retorna
  // 0 quando a célula de fato contém o valor zero. Os dois casos não podem
  // colapsar no mesmo retorno, senão a análise trata "sem dado" como "dívida
  // zero" (ou qualquer outro campo) e cria viés no relatório.
  function val(sheetName, cell) {
    try {
      const ws = wb.Sheets[sheetName];
      if (!ws) return null;
      const c = ws[cell];
      if (!c || c.v === null || c.v === undefined) return null;
      const n = parseFloat(c.v);
      return Number.isNaN(n) ? null : n;
    } catch {
      return null;
    }
  }

  const sheetYear = parseInt(wb.Sheets['BP']?.['E2']?.v) || new Date().getFullYear();
  const { year, period_label } = mergePeriod(sheetYear, null, detectPeriodFromFilename(filename));

  const caixa = val('A.01', 'G29');
  const contas_rec_cp = val('A.02', 'G33');
  const contas_rec_lp = val('A.02', 'G34');
  // Inadimplência = perdas estimadas ÷ total do contas a receber (A.02!G31 e
  // G29). É dado do próprio questionário — o modelo calcula em
  // INDICADORES!D16 e aqui replicamos pra que cards, gráficos e relatório
  // mostrem o mesmo número que a planilha.
  const perdas_estimadas = val('A.02', 'G31');
  const total_a_receber = val('A.02', 'G29');
  const inadimplencia_pct = (perdas_estimadas != null && total_a_receber)
    ? -(perdas_estimadas / total_a_receber)
    : null;
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
    period_label,
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
      receita_bruta, devolucoes: neg(devolucoes), impostos_venda: neg(impostos_venda),
      receita_liquida, custos_vendas, resultado_bruto,
      despesas_comerciais: neg(desp_comerc), despesas_pessoal: neg(desp_pessoal),
      despesas_administrativas: neg(desp_admin), despesas_tributarias: neg(desp_trib),
      outros_receitas_operacionais: outros_rec_op, outros_despesas_operacionais: neg(outros_desp_op),
      despesas_operacionais: desp_op, ebitda, depreciacao: neg(depreciacao),
      receitas_financeiras: rec_fin, despesas_financeiras: neg(desp_fin),
      resultado_antes_ir, ir_csll: neg(ir_csll), sobras_perdas: sobras,
      ...(inadimplencia_pct != null ? { inadimplencia_pct } : {}),
    },
    confidence: 1.0,
    notes: 'Extraído do formato padrão Balanço Perguntado',
    detail: extractDetailSheets(wb),
  };
}

// Captura as células de entrada (sem fórmula) das abas de detalhe A.xx/P.xx/C.xx
// — é o questionário granular por trás dos totais do BP/DSP (conta bancária
// por conta, aging de títulos, cooperado x não-cooperado etc.). Guardado
// como {aba: {célula: valor}} pra poder ser replantado célula-a-célula num
// exemplar novo do mesmo modelo na hora de exportar (ver lib/excelExport.js)
// — só faz sentido porque o arquivo de origem já é esse modelo padrão.
function extractDetailSheets(wb) {
  const detail = {};
  for (const sheetName of wb.SheetNames) {
    if (['BP', 'DSP', 'INDICADORES'].includes(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const cells = {};
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && !cell.f && typeof cell.v === 'number') cells[addr] = cell.v;
      }
    }
    if (Object.keys(cells).length) detail[sheetName] = cells;
  }
  return detail;
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

async function extractFromPdf(buffer, filename, companyName) {
  let fullText = '';
  try {
    const data = await pdfParse(buffer);
    fullText = data.text || '';
  } catch (e) {
    throw new Error(`Não foi possível ler o PDF: ${e.message}`);
  }

  // PDF escaneado (imagem): pdf-parse extrai texto vazio de páginas que são
  // imagens. Falhar aqui com mensagem clara é melhor do que mandar um documento
  // em branco pra IA e o usuário receber uma análise sem nenhum dado, sem saber
  // o motivo. Limite conservador de 300 chars — qualquer BP real tem muito mais.
  if (fullText.trim().length < 300) {
    throw new Error(
      'O PDF não contém texto legível — pode ser um documento escaneado (imagem). ' +
      'Use um PDF gerado diretamente pelo sistema contábil ou exporte os dados para Excel.'
    );
  }

  // Tentar extrair só a seção financeira pra reduzir tokens
  const financialSection = extractFinancialSection(fullText);
  const textToSend = financialSection || (fullText.length > 80000 ? fullText.slice(0, 80000) : fullText);

  console.log(`[extract-pdf] Total: ${fullText.length} chars, Enviando: ${textToSend.length} chars, Seção financeira: ${financialSection ? 'sim' : 'não'}`);

  return await extractWithAI(textToSend, companyName, 'PDF', filename);
}

async function extractWithAI(textContent, companyName, sourceType, filename) {
  // Instruções vêm antes do documento — para documentos grandes (até 80k chars)
  // as regras ficam no início do contexto e têm mais peso na geração do que
  // se estivessem no final, enterradas após o conteúdo financeiro.
  const prompt = `${EXTRACTION_PROMPT}

Empresa: ${companyName}
Tipo de arquivo: ${sourceType}
Nome do arquivo: ${filename || '(desconhecido)'}

Documento financeiro:
${textContent}`;

  let raw = await generateText(prompt, { maxTokens: 16000 });

  // Modelos às vezes colam um comentário `//` dentro do JSON (fora da spec).
  // Removido aqui, antes do parser comum (parseJsonFromLLM cobre markdown,
  // texto antes/depois, vírgulas sobrando e NaN).
  raw = raw.replace(/\/\/.*/g, '');

  try {
    const result = parseJsonFromLLM(raw);
    const merged = mergePeriod(result.year, result.period_label, detectPeriodFromFilename(filename));
    return { ...result, ...merged };
  } catch (e) {
    console.error('[extractor] JSON inválido da IA. Primeiros 500 chars:', raw.substring(0, 500));
    throw new Error('A IA retornou dados em formato inválido. Tente novamente.');
  }
}
