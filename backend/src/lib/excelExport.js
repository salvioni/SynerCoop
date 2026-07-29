// Gera o Excel de análise a partir do modelo padrão "Balanço Perguntado":
// mesma planilha e fórmulas do modelo, com os dados extraídos preenchidos e
// os campos não encontrados deixados em branco (nunca zerados).
//
// Usa ExcelJS em vez do pacote xlsx (SheetJS) — a edição community do xlsx
// lê estilos normalmente, mas ao regravar o arquivo descarta a maior parte
// deles (fontes, bordas, preenchimentos viravam praticamente todos default
// no download). No ExcelJS, valor e estilo são propriedades independentes
// da célula, então preencher `.value` nunca mexe na formatação original.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, '../assets/templates/balanco-perguntado.xlsx');

// O modelo usa hyperlinks internos só com `location` (sem relacionamento
// r:id) na coluna "Link" — ex.: clicar em "A.01" pula pra aba de detalhe
// correspondente. O ExcelJS (usado abaixo por preservar formatação) não
// mantém esse tipo de hyperlink ao reler o arquivo, então extraímos essa
// informação uma vez, no carregamento do módulo, com o pacote xlsx (que lê
// esses links corretamente) pra reaplicar depois de preencher os dados.
const TEMPLATE_HYPERLINKS = extractTemplateHyperlinks();

function extractTemplateHyperlinks() {
  const buf = fs.readFileSync(TEMPLATE_PATH);
  const wb = XLSX.read(buf, { cellFormula: false, cellStyles: false });
  const bySheet = {};
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const links = {};
    for (const addr of Object.keys(ws)) {
      if (addr.startsWith('!')) continue;
      const loc = ws[addr]?.l?.location;
      if (loc) links[addr] = { location: loc, display: ws[addr].l.display || ws[addr].v };
    }
    if (Object.keys(links).length) bySheet[sheetName] = links;
  }
  return bySheet;
}

function reapplyTemplateHyperlinks(wb) {
  for (const [sheetName, links] of Object.entries(TEMPLATE_HYPERLINKS)) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    for (const [addr, { location, display }] of Object.entries(links)) {
      ws.getCell(addr).value = { text: String(display), hyperlink: location };
    }
  }
}

// { campo do nosso bp/dsp -> célula no modelo }. Só cobre os itens que
// correspondem 1:1 a um campo nosso — subtotais puramente estruturais (sem
// campo próprio, ex. "Realizável a Longo Prazo") ficam de fora e continuam
// como fórmula de soma dos filhos, recalculando sozinhos no Excel.
const BP_CELLS = {
  ativo_circulante: 'E8', caixa: 'E9', contas_receber_cp: 'E10', adiantamentos: 'E11',
  estoques: 'E12', outros_creditos_cp: 'E13', ativo_nao_circulante: 'E15',
  contas_receber_lp: 'E17', outros_creditos_lp: 'E18', ativo_permanente: 'E19',
  investimentos: 'E20', imobilizado: 'E21', total_ativo: 'E28',
  passivo_circulante: 'J8', contas_pagar_cp: 'J9', emprestimos_cp: 'J10',
  obrigacoes_trabalhistas: 'J11', obrigacoes_tributarias_cp: 'J12', outros_debitos_cp: 'J13',
  passivo_nao_circulante: 'J15', contas_pagar_lp: 'J17', emprestimos_lp: 'J18',
  obrigacoes_tributarias_lp: 'J19', outros_debitos_lp: 'J20', patrimonio_liquido: 'J22',
  capital_social: 'J23', sobras_acumuladas: 'J26', total_passivo_pl: 'J28',
};
// capital_integralizar e sobras_exercicio precisam de tratamento à parte:
// o primeiro tem o sinal invertido no modelo, o segundo já vem via fórmula
// (=DSP!$E$33) que resolve sozinha assim que preenchemos o DSP.

const DSP_CELLS = {
  receita_bruta: 'E5', devolucoes: 'E7', impostos_venda: 'E8', receita_liquida: 'E10',
  custos_vendas: 'E12', resultado_bruto: 'E14', despesas_operacionais: 'E16',
  despesas_comerciais: 'E17', despesas_pessoal: 'E18', despesas_administrativas: 'E19',
  despesas_tributarias: 'E20', outros_receitas_operacionais: 'E21', outros_despesas_operacionais: 'E22',
  ebitda: 'E24', receitas_financeiras: 'E27', despesas_financeiras: 'E28',
  resultado_antes_ir: 'E30', ir_csll: 'E31', sobras_perdas: 'E33',
};
// depreciacao também tem sinal invertido no modelo (ver abaixo).

// Sobrescreve o valor de uma célula (removendo a fórmula original, se
// houver) sem tocar no estilo — no ExcelJS eles são propriedades
// independentes da célula. Campo ausente (null/undefined) vira célula em
// branco — não "0" — pra não parecer um dado real que veio como zero; um 0
// de verdade (extraído do documento) é escrito normalmente.
function setValue(ws, addr, value) {
  ws.getCell(addr).value = value == null ? null : value;
}

function fillBpDsp(wb, bp, dsp, year) {
  const bpSheet = wb.getWorksheet('BP');
  const dspSheet = wb.getWorksheet('DSP');

  setValue(bpSheet, 'E2', year);

  for (const [field, cell] of Object.entries(BP_CELLS)) setValue(bpSheet, cell, bp?.[field]);
  setValue(bpSheet, 'J24', bp?.capital_integralizar == null ? null : -bp.capital_integralizar);

  for (const [field, cell] of Object.entries(DSP_CELLS)) setValue(dspSheet, cell, dsp?.[field]);
  setValue(dspSheet, 'E26', dsp?.depreciacao == null ? null : -dsp.depreciacao);
}

function fillDetailSheets(wb, detail) {
  for (const [sheetName, cells] of Object.entries(detail)) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) continue;
    for (const [addr, value] of Object.entries(cells)) setValue(ws, addr, value);
  }
}

export async function buildAnalysisExcel({ bp, dsp, year, detail }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  reapplyTemplateHyperlinks(wb);
  fillBpDsp(wb, bp, dsp, year);

  // As abas de detalhe (questionário granular A.xx/P.xx/C.xx) ficam sempre no
  // arquivo, mesmo sem dado nenhum pra preencher — removê-las exigiria
  // remapear os índices de sheet que as fórmulas/definedNames do modelo
  // referenciam, o que é frágil e fácil de deixar o Excel com uma referência
  // pra uma aba que não existe mais (já aconteceu, ver histórico). Mais
  // simples e mais seguro manter o modelo intacto e só preencher o que tem.
  if (detail && Object.keys(detail).length) {
    fillDetailSheets(wb, detail);
  }

  // Sem isso o Excel pode exibir os valores de fórmula antigos (cache do
  // modelo) até o usuário forçar um recálculo manual.
  wb.calcProperties.fullCalcOnLoad = true;

  return wb.xlsx.writeBuffer();
}
