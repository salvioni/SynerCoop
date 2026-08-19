#!/usr/bin/env node
// Adiciona análises com period_label variados ao tenant demo contábil.
// Idempotente: usa IDs fixos — re-executar não duplica dados.
//
// Uso:
//   node scripts/seed-demo-periods.js           (SQLite dev padrão)
//   DATABASE_URL=postgres://... node scripts/seed-demo-periods.js

import { db } from '../src/lib/db.js';
import { calculateIndicators } from '../src/lib/calculator.js';

const CLIENT_CITRUS  = 'client-citrus';
const CLIENT_EMPRESA = 'client-empresa';

// Período  →  BP + DSP realistas (derivados do benchmark 2024/2023 já no seed)
const ANALYSES = [
  // ── Cooperativa Citrus — 2025 ────────────────────────────────────────────
  {
    id: 'an-demo-jan25',
    clientId: CLIENT_CITRUS,
    year: 2025,
    periodLabel: 'Janeiro de 2025',
    bp: {
      ativo_circulante: 1050000, caixa: 345000, contas_receber_cp: 215000,
      adiantamentos: 52000, estoques: 435000, outros_creditos_cp: 3000,
      ativo_nao_circulante: 780000, ativo_permanente: 780000,
      investimentos: 210000, imobilizado: 570000, total_ativo: 1830000,
      passivo_circulante: 700000, contas_pagar_cp: 410000,
      emprestimos_cp: 98000, obrigacoes_trabalhistas: 158000,
      obrigacoes_tributarias_cp: 32000, outros_debitos_cp: 2000,
      passivo_nao_circulante: 430000, contas_pagar_lp: 388000,
      emprestimos_lp: 42000, patrimonio_liquido: 700000,
      capital_social: 500000, capital_integralizar: 0,
      sobras_exercicio: 25000, sobras_acumuladas: 175000, total_passivo_pl: 1830000,
    },
    dsp: {
      receita_bruta: 18000, devolucoes: 0, impostos_venda: -500,
      receita_liquida: 17500, custos_vendas: 0, resultado_bruto: 17500,
      despesas_comerciais: 0, despesas_pessoal: 0, despesas_administrativas: 0,
      despesas_tributarias: 0, outros_receitas_operacionais: 0,
      outros_despesas_operacionais: 0, despesas_operacionais: 0,
      ebitda: 17500, depreciacao: 0, receitas_financeiras: 0,
      despesas_financeiras: 0, resultado_antes_ir: 17500, ir_csll: 0,
      sobras_perdas: 17500,
    },
  },
  {
    id: 'an-demo-bim125',
    clientId: CLIENT_CITRUS,
    year: 2025,
    periodLabel: '1º Bimestre de 2025',
    bp: {
      ativo_circulante: 1060000, caixa: 350000, contas_receber_cp: 218000,
      adiantamentos: 53000, estoques: 436000, outros_creditos_cp: 3000,
      ativo_nao_circulante: 782000, ativo_permanente: 782000,
      investimentos: 210000, imobilizado: 572000, total_ativo: 1842000,
      passivo_circulante: 705000, contas_pagar_cp: 412000,
      emprestimos_cp: 98000, obrigacoes_trabalhistas: 160000,
      obrigacoes_tributarias_cp: 33000, outros_debitos_cp: 2000,
      passivo_nao_circulante: 432000, contas_pagar_lp: 390000,
      emprestimos_lp: 42000, patrimonio_liquido: 705000,
      capital_social: 500000, capital_integralizar: 0,
      sobras_exercicio: 34000, sobras_acumuladas: 171000, total_passivo_pl: 1842000,
    },
    dsp: {
      receita_bruta: 35000, devolucoes: 0, impostos_venda: -900,
      receita_liquida: 34100, custos_vendas: 0, resultado_bruto: 34100,
      despesas_comerciais: 0, despesas_pessoal: 0, despesas_administrativas: 0,
      despesas_tributarias: 0, outros_receitas_operacionais: 0,
      outros_despesas_operacionais: 0, despesas_operacionais: 0,
      ebitda: 34100, depreciacao: 0, receitas_financeiras: 0,
      despesas_financeiras: 0, resultado_antes_ir: 34100, ir_csll: 0,
      sobras_perdas: 34000,
    },
  },
  {
    id: 'an-demo-tri125',
    clientId: CLIENT_CITRUS,
    year: 2025,
    periodLabel: '1º Trimestre de 2025',
    bp: {
      ativo_circulante: 1075000, caixa: 358000, contas_receber_cp: 222000,
      adiantamentos: 54000, estoques: 438000, outros_creditos_cp: 3000,
      ativo_nao_circulante: 785000, ativo_permanente: 785000,
      investimentos: 212000, imobilizado: 573000, total_ativo: 1860000,
      passivo_circulante: 710000, contas_pagar_cp: 415000,
      emprestimos_cp: 96000, obrigacoes_trabalhistas: 162000,
      obrigacoes_tributarias_cp: 35000, outros_debitos_cp: 2000,
      passivo_nao_circulante: 435000, contas_pagar_lp: 394000,
      emprestimos_lp: 41000, patrimonio_liquido: 715000,
      capital_social: 500000, capital_integralizar: 0,
      sobras_exercicio: 55000, sobras_acumuladas: 160000, total_passivo_pl: 1860000,
    },
    dsp: {
      receita_bruta: 54000, devolucoes: 0, impostos_venda: -1400,
      receita_liquida: 52600, custos_vendas: 0, resultado_bruto: 52600,
      despesas_comerciais: 0, despesas_pessoal: 0, despesas_administrativas: 0,
      despesas_tributarias: 0, outros_receitas_operacionais: 0,
      outros_despesas_operacionais: 0, despesas_operacionais: 0,
      ebitda: 52600, depreciacao: 0, receitas_financeiras: 0,
      despesas_financeiras: 0, resultado_antes_ir: 52600, ir_csll: 0,
      sobras_perdas: 52000,
    },
  },
  {
    id: 'an-demo-sem125',
    clientId: CLIENT_CITRUS,
    year: 2025,
    periodLabel: '1º Semestre de 2025',
    bp: {
      ativo_circulante: 1095000, caixa: 370000, contas_receber_cp: 228000,
      adiantamentos: 55000, estoques: 439000, outros_creditos_cp: 3000,
      ativo_nao_circulante: 790000, ativo_permanente: 790000,
      investimentos: 215000, imobilizado: 575000, total_ativo: 1885000,
      passivo_circulante: 718000, contas_pagar_cp: 420000,
      emprestimos_cp: 95000, obrigacoes_trabalhistas: 165000,
      obrigacoes_tributarias_cp: 36000, outros_debitos_cp: 2000,
      passivo_nao_circulante: 438000, contas_pagar_lp: 397000,
      emprestimos_lp: 41000, patrimonio_liquido: 729000,
      capital_social: 500000, capital_integralizar: 0,
      sobras_exercicio: 105000, sobras_acumuladas: 124000, total_passivo_pl: 1885000,
    },
    dsp: {
      receita_bruta: 108000, devolucoes: 0, impostos_venda: -2800,
      receita_liquida: 105200, custos_vendas: 0, resultado_bruto: 105200,
      despesas_comerciais: 0, despesas_pessoal: 0, despesas_administrativas: 0,
      despesas_tributarias: 0, outros_receitas_operacionais: 0,
      outros_despesas_operacionais: 0, despesas_operacionais: 0,
      ebitda: 105200, depreciacao: 0, receitas_financeiras: 0,
      despesas_financeiras: 0, resultado_antes_ir: 105200, ir_csll: 0,
      sobras_perdas: 105000,
    },
  },

  // ── Empresa Exemplo — anual 2024 e trimestral 2025 ────────────────────────
  {
    id: 'an-demo-emp24',
    clientId: CLIENT_EMPRESA,
    year: 2024,
    periodLabel: null, // anual — sem period_label
    bp: {
      ativo_circulante: 580000, caixa: 180000, contas_receber_cp: 230000,
      adiantamentos: 20000, estoques: 145000, outros_creditos_cp: 5000,
      ativo_nao_circulante: 420000, ativo_permanente: 420000,
      investimentos: 80000, imobilizado: 340000, total_ativo: 1000000,
      passivo_circulante: 320000, contas_pagar_cp: 200000,
      emprestimos_cp: 65000, obrigacoes_trabalhistas: 40000,
      obrigacoes_tributarias_cp: 13000, outros_debitos_cp: 2000,
      passivo_nao_circulante: 180000, contas_pagar_lp: 145000,
      emprestimos_lp: 35000, patrimonio_liquido: 500000,
      capital_social: 400000, capital_integralizar: 0,
      sobras_exercicio: 60000, sobras_acumuladas: 40000, total_passivo_pl: 1000000,
    },
    dsp: {
      receita_bruta: 920000, devolucoes: -18000, impostos_venda: -82000,
      receita_liquida: 820000, custos_vendas: -480000, resultado_bruto: 340000,
      despesas_comerciais: -42000, despesas_pessoal: -120000,
      despesas_administrativas: -68000, despesas_tributarias: -12000,
      outros_receitas_operacionais: 0, outros_despesas_operacionais: 0,
      despesas_operacionais: -242000, ebitda: 98000,
      depreciacao: -22000, receitas_financeiras: 8000,
      despesas_financeiras: -18000, resultado_antes_ir: 66000,
      ir_csll: -6000, sobras_perdas: 60000,
    },
  },
  {
    id: 'an-demo-emp-tri125',
    clientId: CLIENT_EMPRESA,
    year: 2025,
    periodLabel: '1º Trimestre de 2025',
    bp: {
      ativo_circulante: 605000, caixa: 195000, contas_receber_cp: 240000,
      adiantamentos: 22000, estoques: 143000, outros_creditos_cp: 5000,
      ativo_nao_circulante: 415000, ativo_permanente: 415000,
      investimentos: 80000, imobilizado: 335000, total_ativo: 1020000,
      passivo_circulante: 325000, contas_pagar_cp: 205000,
      emprestimos_cp: 63000, obrigacoes_trabalhistas: 42000,
      obrigacoes_tributarias_cp: 13000, outros_debitos_cp: 2000,
      passivo_nao_circulante: 178000, contas_pagar_lp: 143000,
      emprestimos_lp: 35000, patrimonio_liquido: 517000,
      capital_social: 400000, capital_integralizar: 0,
      sobras_exercicio: 17000, sobras_acumuladas: 100000, total_passivo_pl: 1020000,
    },
    dsp: {
      receita_bruta: 232000, devolucoes: -4500, impostos_venda: -21000,
      receita_liquida: 206500, custos_vendas: -121000, resultado_bruto: 85500,
      despesas_comerciais: -10500, despesas_pessoal: -30500,
      despesas_administrativas: -17000, despesas_tributarias: -3000,
      outros_receitas_operacionais: 0, outros_despesas_operacionais: 0,
      despesas_operacionais: -61000, ebitda: 24500,
      depreciacao: -5500, receitas_financeiras: 2000,
      despesas_financeiras: -4500, resultado_antes_ir: 16500,
      ir_csll: -500, sobras_perdas: 16000,
    },
  },
];

const ins = db.prepare(`
  INSERT INTO analyses (id, client_id, year, period_label, bp, dsp, indicators, status, confidence, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'done', 1.0, ?)
  ON CONFLICT (id) DO NOTHING
`);

let inserted = 0;
let skipped  = 0;

for (const a of ANALYSES) {
  const indicators = calculateIndicators({ bp: a.bp, dsp: a.dsp });
  const info = db.prepare('SELECT id FROM analyses WHERE id = ?').get(a.id);
  if (info) { skipped++; continue; }
  ins.run(
    a.id, a.clientId, a.year, a.periodLabel ?? null,
    JSON.stringify(a.bp), JSON.stringify(a.dsp), JSON.stringify(indicators),
    a.periodLabel
      ? `Dado demo — ${a.periodLabel}`
      : 'Dado demo — exercício anual',
  );
  inserted++;
}

console.log(`✓ seed-demo-periods: ${inserted} inseridas, ${skipped} já existiam.`);
