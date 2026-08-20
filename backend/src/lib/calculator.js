// Port direto do calculator.py — mesmas fórmulas, mesma estrutura.

function safeDiv(a, b, def = 0) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return def;
  return Math.round((a / b) * 10000) / 10000;
}

// Só retorna o valor calculado quando os campos de origem usados na fórmula
// foram de fato encontrados (ver extractor.js) — senão vira null. Sem isso,
// o "?? 0" usado pra viabilizar as contas abaixo faria um dado ausente virar
// um indicador "0" com aparência de fato real (ex: "0% de endividamento"
// quando na verdade não sabemos o endividamento), enviesando a análise.
function out(known, value) { return known ? value : null; }

export function calculateIndicators(data) {
  const bp = data.bp || {};
  const dsp = data.dsp || {};

  // ── Anualização dos fluxos ────────────────────────────────────────────────
  // O balanço é uma FOTO (saldo numa data); a DSP é um FILME (acumulado no
  // período). Toda razão que mistura os dois — PMR, giro, ROE, Dívida/EBITDA —
  // pressupõe que o filme cobre um ano, que é o que as fórmulas do modelo
  // assumem ao multiplicar por 360. Com um mês no denominador, o PMR sai 12×
  // maior e o giro 12× menor, sem que nada tenha mudado na cooperativa.
  //
  // `af` recoloca o fluxo na escala anual (×12 para mês, ×4 para trimestre…).
  // Aplicado SOMENTE nessas razões mistas. Ficam intactos:
  //   • valores absolutos (EBITDA, Sobras) — são "do período", não projeções;
  //   • razões fluxo÷fluxo (margem líquida) — as duas pontas já se cancelam.
  const periodMonths = data.periodMonths || 12;
  const af = 12 / periodMonths;
  const anualizado = af !== 1;

  // BP - ATIVO
  const ativo_circ = bp.ativo_circulante ?? 0;
  const k_ativo_circ = bp.ativo_circulante != null;
  const caixa = bp.caixa ?? 0;
  const k_caixa = bp.caixa != null;
  const contas_rec_cp = bp.contas_receber_cp ?? 0;
  const k_contas_rec_cp = bp.contas_receber_cp != null;
  const adiantamentos = bp.adiantamentos ?? 0;
  const k_adiantamentos = bp.adiantamentos != null;
  const outros_cred_cp = bp.outros_creditos_cp ?? 0;
  const k_outros_cred_cp = bp.outros_creditos_cp != null;
  const estoques = bp.estoques ?? 0;
  const k_estoques = bp.estoques != null;

  const ativo_nao_circ = bp.ativo_nao_circulante ?? 0;
  const k_ativo_nao_circ = bp.ativo_nao_circulante != null;
  const ativo_permanente = bp.ativo_permanente ?? 0;
  const k_ativo_permanente = bp.ativo_permanente != null;
  // Realizável a Longo Prazo — o que entra na Liquidez Geral (imobilizado e
  // investimentos não são realizáveis). No modelo Balanço Perguntado é
  // BP!E16 = SUM(E17:E18), ou seja, as contas itemizadas. Quando a extração
  // por IA não separa esses itens, cai no equivalente estrutural
  // (Não Circulante − Permanente), que é a mesma coisa por definição
  // (BP!E15 = E16 + E19).
  const k_rlp_itemizado = bp.contas_receber_lp != null || bp.outros_creditos_lp != null;
  const realizavel_lp = k_rlp_itemizado
    ? (bp.contas_receber_lp ?? 0) + (bp.outros_creditos_lp ?? 0)
    : ativo_nao_circ - ativo_permanente;
  const k_realizavel_lp = k_rlp_itemizado || (k_ativo_nao_circ && k_ativo_permanente);

  const total_ativo = bp.total_ativo ?? (ativo_circ + ativo_nao_circ);
  const k_total_ativo = bp.total_ativo != null || (k_ativo_circ && k_ativo_nao_circ);

  // BP - PASSIVO
  const passivo_circ = bp.passivo_circulante ?? 0;
  const k_passivo_circ = bp.passivo_circulante != null;
  const emprest_cp = bp.emprestimos_cp ?? 0;
  const k_emprest_cp = bp.emprestimos_cp != null;

  const passivo_nao_circ = bp.passivo_nao_circulante ?? 0;
  const k_passivo_nao_circ = bp.passivo_nao_circulante != null;
  const emprest_lp = bp.emprestimos_lp ?? 0;
  const k_emprest_lp = bp.emprestimos_lp != null;

  // PL
  const pl = bp.patrimonio_liquido ?? 0;
  const k_pl = bp.patrimonio_liquido != null;
  const capital_social = bp.capital_social ?? 0;
  const k_capital_social = bp.capital_social != null;
  const capital_integralizar = bp.capital_integralizar ?? 0;
  const k_capital_integralizar = bp.capital_integralizar != null;

  // DSP
  const receita_bruta = dsp.receita_bruta ?? 0;
  const k_receita_bruta = dsp.receita_bruta != null;
  const devolucoes = dsp.devolucoes ?? 0;
  const k_devolucoes = dsp.devolucoes != null;
  const impostos_venda = dsp.impostos_venda ?? 0;
  const k_impostos_venda = dsp.impostos_venda != null;

  const receita_liquida = dsp.receita_liquida ?? (receita_bruta - devolucoes - impostos_venda);
  const k_receita_liquida = dsp.receita_liquida != null || (k_receita_bruta && k_devolucoes && k_impostos_venda);

  const custos_vendas = dsp.custos_vendas ?? 0;
  const k_custos_vendas = dsp.custos_vendas != null;
  const resultado_bruto = dsp.resultado_bruto ?? (receita_liquida + custos_vendas);
  const k_resultado_bruto = dsp.resultado_bruto != null || (k_receita_liquida && k_custos_vendas);

  const desp_operacionais = dsp.despesas_operacionais ?? 0;
  const k_desp_operacionais = dsp.despesas_operacionais != null;

  const ebitda = dsp.ebitda ?? (resultado_bruto + desp_operacionais);
  const k_ebitda = dsp.ebitda != null || (k_resultado_bruto && k_desp_operacionais);

  const depreciacao = dsp.depreciacao ?? 0;
  const k_depreciacao = dsp.depreciacao != null;
  const sobras_perdas = dsp.sobras_perdas ?? 0;
  const k_sobras_perdas = dsp.sobras_perdas != null;

  // Versões anualizadas — usadas apenas nas razões mistas descritas acima.
  const receita_liquida_a   = receita_liquida * af;
  const custos_vendas_a     = custos_vendas * af;
  const desp_operacionais_a = desp_operacionais * af;
  const depreciacao_a       = depreciacao * af;
  const ebitda_a            = ebitda * af;
  const sobras_perdas_a     = sobras_perdas * af;

  // ── INDICADORES (fórmulas exatas do calculator.py) ──────────────────────────

  // LIQUIDEZ
  // (Ativo Circulante + Realizável a LP) / (Passivo Circulante + Passivo Não
  // Circulante) — mesma fórmula do modelo (INDICADORES!D9). Incluir o Ativo
  // Permanente aqui inflaria o índice e o tornaria idêntico à Garantia ao
  // Capital de Terceiros, que é justamente o indicador que usa o ativo total.
  const liquidez_geral = safeDiv(ativo_circ + realizavel_lp, passivo_circ + passivo_nao_circ);
  const k_liquidez_geral = k_ativo_circ && k_realizavel_lp && k_passivo_circ && k_passivo_nao_circ;
  // Perdas estimadas do contas a receber ÷ total a receber (modelo
  // INDICADORES!D16 = -(A.02!G31/A.02!G29)). Derivado no extractor a partir
  // do questionário — nunca digitado à mão.
  const inadimplencia = dsp.inadimplencia_pct ?? 0;
  const k_inadimplencia = dsp.inadimplencia_pct != null;
  const liquidez_corrente = safeDiv(ativo_circ, passivo_circ);
  const k_liquidez_corrente = k_ativo_circ && k_passivo_circ;
  const liquidez_seca = safeDiv(ativo_circ - estoques, passivo_circ);
  const k_liquidez_seca = k_ativo_circ && k_estoques && k_passivo_circ;
  const garantia_cap_terceiros = safeDiv(total_ativo, passivo_circ + passivo_nao_circ);
  const k_garantia_cap_terceiros = k_total_ativo && k_passivo_circ && k_passivo_nao_circ;
  const imob_rec_proprios = safeDiv(ativo_permanente, pl);
  const k_imob_rec_proprios = k_ativo_permanente && k_pl;

  // ENDIVIDAMENTO
  const nivel_alavancagem = safeDiv(emprest_cp + emprest_lp - caixa, ebitda_a);
  const k_nivel_alavancagem = k_emprest_cp && k_emprest_lp && k_caixa && k_ebitda;
  const endiv_operacional_pct = safeDiv((passivo_circ - emprest_cp) + (passivo_nao_circ - emprest_lp), total_ativo);
  const k_endiv_operacional_pct = k_passivo_circ && k_emprest_cp && k_passivo_nao_circ && k_emprest_lp && k_total_ativo;
  const endiv_financ_total_pct = safeDiv(emprest_cp + emprest_lp, total_ativo);
  const k_endiv_financ_total_pct = k_emprest_cp && k_emprest_lp && k_total_ativo;
  const endiv_financ_lp_pct = safeDiv(emprest_lp, total_ativo);
  const k_endiv_financ_lp_pct = k_emprest_lp && k_total_ativo;
  const endiv_lp_pct = safeDiv(passivo_nao_circ, total_ativo);
  const k_endiv_lp_pct = k_passivo_nao_circ && k_total_ativo;
  const endiv_total_pct = safeDiv(passivo_circ + passivo_nao_circ, total_ativo);
  const k_endiv_total_pct = k_passivo_circ && k_passivo_nao_circ && k_total_ativo;
  const perfil_endividamento = safeDiv(passivo_circ, passivo_circ + passivo_nao_circ);
  const k_perfil_endividamento = k_passivo_circ && k_passivo_nao_circ;

  // RENTABILIDADE
  const rentab_capital = safeDiv(sobras_perdas_a, capital_social - capital_integralizar);
  const k_rentab_capital = k_sobras_perdas && k_capital_social && k_capital_integralizar;
  const rentab_ingressos = safeDiv(sobras_perdas, receita_liquida);
  const k_rentab_ingressos = k_sobras_perdas && k_receita_liquida;
  const rentab_pl = safeDiv(sobras_perdas_a, pl);
  const k_rentab_pl = k_sobras_perdas && k_pl;
  const rentab_ativos = safeDiv(sobras_perdas_a, total_ativo);
  const k_rentab_ativos = k_sobras_perdas && k_total_ativo;

  // CAPACIDADE OPERACIONAL
  const pme = custos_vendas_a !== 0 ? safeDiv(estoques * 360, Math.abs(custos_vendas_a)) : 0;
  const k_pme = k_estoques && k_custos_vendas;
  // (Contas a Receber CP + Outros Créditos CP) / Receita Líquida × 360 —
  // modelo INDICADORES!G23 usa BP!E10+BP!E13. Adiantamentos (BP!E11) são
  // pagamentos feitos a fornecedores, não crédito a receber de clientes.
  const pmr = receita_liquida_a !== 0 ? safeDiv((contas_rec_cp + outros_cred_cp) * 360, receita_liquida_a) : 0;
  const k_pmr = k_contas_rec_cp && k_outros_cred_cp && k_receita_liquida;
  const pmp_base = Math.abs(custos_vendas_a) + Math.abs(desp_operacionais_a) + Math.abs(depreciacao_a);
  const pmp = pmp_base !== 0 ? safeDiv((passivo_circ - emprest_cp) * 360, pmp_base) : 0;
  const k_pmp = k_passivo_circ && k_emprest_cp && k_custos_vendas && k_desp_operacionais && k_depreciacao;
  const ciclo_operacional = pme + pmr;
  const k_ciclo_operacional = k_pme && k_pmr;
  const ciclo_financeiro = ciclo_operacional - pmp;
  const k_ciclo_financeiro = k_ciclo_operacional && k_pmp;
  const giro_ativo = safeDiv(receita_liquida_a, total_ativo);
  const k_giro_ativo = k_receita_liquida && k_total_ativo;
  const giro_permanente = safeDiv(receita_liquida_a, ativo_permanente);
  const k_giro_permanente = k_receita_liquida && k_ativo_permanente;

  // TESOURARIA
  const capital_giro = ativo_circ - passivo_circ;
  const k_capital_giro = k_ativo_circ && k_passivo_circ;
  const capital_giro_fat_pct = safeDiv(capital_giro, receita_liquida_a);
  const k_capital_giro_fat_pct = k_capital_giro && k_receita_liquida;
  const capital_giro_pct = safeDiv(capital_giro, total_ativo);
  const k_capital_giro_pct = k_capital_giro && k_total_ativo;
  const capital_giro_proprio_pct = safeDiv(pl - ativo_nao_circ, total_ativo);
  const k_capital_giro_proprio_pct = k_pl && k_ativo_nao_circ && k_total_ativo;
  const ncg = (ativo_circ - caixa) - (passivo_circ - emprest_cp);
  const k_ncg = k_ativo_circ && k_caixa && k_passivo_circ && k_emprest_cp;
  const ncg_fat_pct = safeDiv(ncg, receita_liquida_a);
  const k_ncg_fat_pct = k_ncg && k_receita_liquida;
  const ncg_pct = safeDiv(ncg, total_ativo);
  const k_ncg_pct = k_ncg && k_total_ativo;
  const tesouraria = caixa - emprest_cp;
  const k_tesouraria = k_caixa && k_emprest_cp;
  const tesouraria_fat_pct = safeDiv(tesouraria, receita_liquida_a);
  const k_tesouraria_fat_pct = k_tesouraria && k_receita_liquida;
  const tesouraria_pct = safeDiv(tesouraria, total_ativo);
  const k_tesouraria_pct = k_tesouraria && k_total_ativo;
  const independencia_financeira = safeDiv(pl, total_ativo);
  const k_independencia_financeira = k_pl && k_total_ativo;
  const indice_autofinanciamento = safeDiv(capital_giro, ncg);
  const k_indice_autofinanciamento = k_capital_giro && k_ncg;

  return {
    // Sinaliza para a interface que as razões mistas foram levadas à base anual
    // — o número exibido é uma projeção do ritmo do período, não o realizado.
    _anualizado: anualizado ? { periodMonths, fator: af } : null,
    liquidez: {
      liquidez_geral: out(k_liquidez_geral, liquidez_geral),
      liquidez_corrente: out(k_liquidez_corrente, liquidez_corrente),
      liquidez_seca: out(k_liquidez_seca, liquidez_seca),
      garantia_capital_terceiros: out(k_garantia_cap_terceiros, garantia_cap_terceiros),
      imobilizacao_recursos_proprios: out(k_imob_rec_proprios, imob_rec_proprios),
      ebitda: out(k_ebitda, ebitda),
      inadimplencia_total_pct: out(k_inadimplencia, inadimplencia),
    },
    endividamento: {
      nivel_alavancagem_ebitda: out(k_nivel_alavancagem, nivel_alavancagem),
      endividamento_operacional_pct: out(k_endiv_operacional_pct, endiv_operacional_pct),
      endividamento_financeiro_total_pct: out(k_endiv_financ_total_pct, endiv_financ_total_pct),
      endividamento_financeiro_lp_pct: out(k_endiv_financ_lp_pct, endiv_financ_lp_pct),
      endividamento_lp_pct: out(k_endiv_lp_pct, endiv_lp_pct),
      endividamento_total_pct: out(k_endiv_total_pct, endiv_total_pct),
      perfil_endividamento_pct: out(k_perfil_endividamento, perfil_endividamento),
    },
    rentabilidade: {
      rentabilidade_capital_integralizado_pct: out(k_rentab_capital, rentab_capital),
      rentabilidade_ingressos_pct: out(k_rentab_ingressos, rentab_ingressos),
      rentabilidade_pl_pct: out(k_rentab_pl, rentab_pl),
      rentabilidade_ativos_pct: out(k_rentab_ativos, rentab_ativos),
    },
    capacidade_operacional: {
      pme: out(k_pme, Math.round(pme * 10) / 10),
      pmr: out(k_pmr, Math.round(pmr * 10) / 10),
      pmp: out(k_pmp, Math.round(pmp * 10) / 10),
      ciclo_operacional: out(k_ciclo_operacional, Math.round(ciclo_operacional * 10) / 10),
      ciclo_financeiro: out(k_ciclo_financeiro, Math.round(ciclo_financeiro * 10) / 10),
      giro_ativo: out(k_giro_ativo, giro_ativo),
      giro_permanente: out(k_giro_permanente, giro_permanente),
    },
    tesouraria: {
      capital_giro: out(k_capital_giro, capital_giro),
      capital_giro_faturamento_pct: out(k_capital_giro_fat_pct, capital_giro_fat_pct),
      capital_giro_pct: out(k_capital_giro_pct, capital_giro_pct),
      capital_giro_proprio_pct: out(k_capital_giro_proprio_pct, capital_giro_proprio_pct),
      ncg: out(k_ncg, ncg),
      ncg_faturamento_pct: out(k_ncg_fat_pct, ncg_fat_pct),
      ncg_pct: out(k_ncg_pct, ncg_pct),
      tesouraria: out(k_tesouraria, tesouraria),
      tesouraria_faturamento_pct: out(k_tesouraria_fat_pct, tesouraria_fat_pct),
      tesouraria_pct: out(k_tesouraria_pct, tesouraria_pct),
      independencia_financeira: out(k_independencia_financeira, independencia_financeira),
      indice_autofinanciamento: out(k_indice_autofinanciamento, indice_autofinanciamento),
    }
  };
}
