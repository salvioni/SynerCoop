// Port direto do calculator.py — mesmas fórmulas, mesma estrutura.

function safeDiv(a, b, def = 0) {
  try {
    if (b === 0) return def;
    return Math.round((a / b) * 10000) / 10000;
  } catch {
    return def;
  }
}

export function calculateIndicators(data) {
  const bp = data.bp || {};
  const dsp = data.dsp || {};

  // BP - ATIVO
  const ativo_circ = bp.ativo_circulante ?? 0;
  const caixa = bp.caixa ?? 0;
  const contas_rec_cp = bp.contas_receber_cp ?? 0;
  const adiantamentos = bp.adiantamentos ?? 0;
  const estoques = bp.estoques ?? 0;
  const outros_cred_cp = bp.outros_creditos_cp ?? 0;

  const ativo_nao_circ = bp.ativo_nao_circulante ?? 0;
  const contas_rec_lp = bp.contas_receber_lp ?? 0;
  const outros_cred_lp = bp.outros_creditos_lp ?? 0;
  const ativo_permanente = bp.ativo_permanente ?? 0;
  const investimentos = bp.investimentos ?? 0;
  const imobilizado = bp.imobilizado ?? 0;

  const total_ativo = bp.total_ativo ?? (ativo_circ + ativo_nao_circ);

  // BP - PASSIVO
  const passivo_circ = bp.passivo_circulante ?? 0;
  const contas_pagar_cp = bp.contas_pagar_cp ?? 0;
  const emprest_cp = bp.emprestimos_cp ?? 0;
  const obrig_trab = bp.obrigacoes_trabalhistas ?? 0;
  const obrig_trib_cp = bp.obrigacoes_tributarias_cp ?? 0;
  const outros_deb_cp = bp.outros_debitos_cp ?? 0;

  const passivo_nao_circ = bp.passivo_nao_circulante ?? 0;
  const contas_pagar_lp = bp.contas_pagar_lp ?? 0;
  const emprest_lp = bp.emprestimos_lp ?? 0;
  const obrig_trib_lp = bp.obrigacoes_tributarias_lp ?? 0;
  const outros_deb_lp = bp.outros_debitos_lp ?? 0;

  // PL
  const pl = bp.patrimonio_liquido ?? 0;
  const capital_social = bp.capital_social ?? 0;
  const capital_integralizar = bp.capital_integralizar ?? 0;
  const sobras_exercicio = bp.sobras_exercicio ?? (dsp.sobras_perdas ?? 0);

  const total_passivo_pl = bp.total_passivo_pl ?? (passivo_circ + passivo_nao_circ + pl);

  // DSP
  const receita_bruta = dsp.receita_bruta ?? 0;
  const devolucoes = dsp.devolucoes ?? 0;
  const impostos_venda = dsp.impostos_venda ?? 0;
  const receita_liquida = dsp.receita_liquida ?? (receita_bruta - devolucoes - impostos_venda);
  const custos_vendas = dsp.custos_vendas ?? 0;
  const resultado_bruto = dsp.resultado_bruto ?? (receita_liquida + custos_vendas);
  const desp_comerciais = dsp.despesas_comerciais ?? 0;
  const desp_pessoal = dsp.despesas_pessoal ?? 0;
  const desp_admin = dsp.despesas_administrativas ?? 0;
  const desp_tributarias = dsp.despesas_tributarias ?? 0;
  const outros_rec_op = dsp.outros_receitas_operacionais ?? 0;
  const outros_desp_op = dsp.outros_despesas_operacionais ?? 0;
  const desp_operacionais = dsp.despesas_operacionais ?? 0;
  const ebitda = dsp.ebitda ?? (resultado_bruto + desp_operacionais);
  const depreciacao = dsp.depreciacao ?? 0;
  const rec_financeiras = dsp.receitas_financeiras ?? 0;
  const desp_financeiras = dsp.despesas_financeiras ?? 0;
  const resultado_antes_ir = dsp.resultado_antes_ir ?? 0;
  const ir_csll = dsp.ir_csll ?? 0;
  const sobras_perdas = dsp.sobras_perdas ?? 0;

  // ── INDICADORES (fórmulas exatas do calculator.py) ──────────────────────────

  // LIQUIDEZ
  const liquidez_geral = safeDiv(ativo_circ + ativo_nao_circ, passivo_circ + passivo_nao_circ);
  const liquidez_corrente = safeDiv(ativo_circ, passivo_circ);
  const liquidez_seca = safeDiv(ativo_circ - estoques, passivo_circ);
  const garantia_cap_terceiros = safeDiv(total_ativo, passivo_circ + passivo_nao_circ);
  const imob_rec_proprios = safeDiv(ativo_permanente, pl);
  const inadimplencia = dsp.inadimplencia_pct ?? 0;

  // ENDIVIDAMENTO
  const nivel_alavancagem = safeDiv(emprest_cp + emprest_lp - caixa, ebitda);
  const endiv_operacional_pct = safeDiv((passivo_circ - emprest_cp) + (passivo_nao_circ - emprest_lp), total_ativo);
  const endiv_financ_total_pct = safeDiv(emprest_cp + emprest_lp, total_ativo);
  const endiv_financ_lp_pct = safeDiv(emprest_lp, total_ativo);
  const endiv_lp_pct = safeDiv(passivo_nao_circ, total_ativo);
  const endiv_total_pct = safeDiv(passivo_circ + passivo_nao_circ, total_ativo);
  const perfil_endividamento = safeDiv(passivo_circ, passivo_circ + passivo_nao_circ);

  // RENTABILIDADE
  const rentab_capital = safeDiv(sobras_perdas, capital_social - capital_integralizar);
  const rentab_ingressos = safeDiv(sobras_perdas, receita_liquida);
  const rentab_pl = safeDiv(sobras_perdas, pl);
  const rentab_ativos = safeDiv(sobras_perdas, total_ativo);

  // CAPACIDADE OPERACIONAL
  const pme = custos_vendas !== 0 ? safeDiv(estoques * 360, Math.abs(custos_vendas)) : 0;
  const pmr = receita_liquida !== 0 ? safeDiv((contas_rec_cp + adiantamentos) * 360, receita_liquida) : 0;
  const pmp_base = Math.abs(custos_vendas) + Math.abs(desp_operacionais) + Math.abs(depreciacao);
  const pmp = pmp_base !== 0 ? safeDiv((passivo_circ - emprest_cp) * 360, pmp_base) : 0;
  const ciclo_operacional = pme + pmr;
  const ciclo_financeiro = ciclo_operacional - pmp;
  const giro_ativo = safeDiv(receita_liquida, total_ativo);
  const giro_permanente = safeDiv(receita_liquida, ativo_permanente);

  // TESOURARIA
  const capital_giro = ativo_circ - passivo_circ;
  const capital_giro_fat_pct = safeDiv(capital_giro, receita_liquida);
  const capital_giro_pct = safeDiv(capital_giro, total_ativo);
  const capital_giro_proprio_pct = safeDiv(pl - ativo_nao_circ, total_ativo);
  const ncg = (ativo_circ - caixa) - (passivo_circ - emprest_cp);
  const ncg_fat_pct = safeDiv(ncg, receita_liquida);
  const ncg_pct = safeDiv(ncg, total_ativo);
  const tesouraria = caixa - emprest_cp;
  const tesouraria_fat_pct = safeDiv(tesouraria, receita_liquida);
  const tesouraria_pct = safeDiv(tesouraria, total_ativo);
  const independencia_financeira = safeDiv(pl, total_ativo);
  const indice_autofinanciamento = safeDiv(capital_giro, ncg);

  return {
    liquidez: {
      liquidez_geral,
      liquidez_corrente,
      liquidez_seca,
      garantia_capital_terceiros: garantia_cap_terceiros,
      imobilizacao_recursos_proprios: imob_rec_proprios,
      imobilizacao_recursos_proprios_pct: imob_rec_proprios,
      ebitda,
      inadimplencia_total_pct: inadimplencia,
    },
    endividamento: {
      nivel_alavancagem_ebitda: nivel_alavancagem,
      endividamento_operacional_pct: endiv_operacional_pct,
      endividamento_financeiro_total_pct: endiv_financ_total_pct,
      endividamento_financeiro_lp_pct: endiv_financ_lp_pct,
      endividamento_lp_pct: endiv_lp_pct,
      endividamento_total_pct: endiv_total_pct,
      perfil_endividamento_pct: perfil_endividamento,
    },
    rentabilidade: {
      rentabilidade_capital_integralizado_pct: rentab_capital,
      rentabilidade_ingressos_pct: rentab_ingressos,
      rentabilidade_pl_pct: rentab_pl,
      rentabilidade_ativos_pct: rentab_ativos,
    },
    capacidade_operacional: {
      pme: Math.round(pme * 10) / 10,
      pmr: Math.round(pmr * 10) / 10,
      pmp: Math.round(pmp * 10) / 10,
      ciclo_operacional: Math.round(ciclo_operacional * 10) / 10,
      ciclo_financeiro: Math.round(ciclo_financeiro * 10) / 10,
      giro_ativo,
      giro_permanente,
    },
    tesouraria: {
      capital_giro,
      capital_giro_faturamento_pct: capital_giro_fat_pct,
      capital_giro_pct,
      capital_giro_proprio_pct,
      ncg,
      ncg_faturamento_pct: ncg_fat_pct,
      ncg_pct,
      tesouraria,
      tesouraria_faturamento_pct: tesouraria_fat_pct,
      tesouraria_pct,
      independencia_financeira,
      indice_autofinanciamento,
    }
  };
}
