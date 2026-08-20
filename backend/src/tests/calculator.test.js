import { describe, it, expect } from 'vitest';
import { calculateIndicators } from '../lib/calculator.js';

describe('calculateIndicators', () => {
  it('calcula os indicadores de liquidez, endividamento, rentabilidade e tesouraria com valores conhecidos', () => {
    const result = calculateIndicators({
      bp: {
        ativo_circulante: 200,
        ativo_nao_circulante: 300,
        total_ativo: 500,
        passivo_circulante: 100,
        passivo_nao_circulante: 150,
        patrimonio_liquido: 250,
        total_passivo_pl: 500,
        caixa: 50,
        estoques: 30,
        contas_receber_cp: 40,
        emprestimos_cp: 20,
        emprestimos_lp: 30,
        capital_social: 200,
        capital_integralizar: 0,
        ativo_permanente: 100,
      },
      dsp: {
        receita_liquida: 1000,
        custos_vendas: -600,
        despesas_operacionais: -200,
        sobras_perdas: 100,
      },
    });

    expect(result.liquidez.liquidez_corrente).toBe(2);
    // Liquidez Geral = (AC + Realizável a LP) / (PC + PNC) = (200 + 200) / 250.
    // O Realizável a LP (200) é o Não Circulante (300) menos o Permanente
    // (100) — imobilizado não entra. Antes esperávamos 2, que é o mesmo valor
    // de garantia_capital_terceiros logo abaixo: os dois indicadores estavam
    // computando a mesma coisa, o que denunciava o erro.
    expect(result.liquidez.liquidez_geral).toBeCloseTo(1.6);
    expect(result.liquidez.liquidez_seca).toBeCloseTo(1.7);
    expect(result.liquidez.garantia_capital_terceiros).toBe(2);
    expect(result.liquidez.imobilizacao_recursos_proprios).toBeCloseTo(0.4);

    expect(result.endividamento.endividamento_total_pct).toBeCloseTo(0.5);
    expect(result.endividamento.endividamento_financeiro_total_pct).toBeCloseTo(0.1);

    expect(result.rentabilidade.rentabilidade_pl_pct).toBeCloseTo(0.4);
    expect(result.rentabilidade.rentabilidade_ativos_pct).toBeCloseTo(0.2);
    expect(result.rentabilidade.rentabilidade_ingressos_pct).toBeCloseTo(0.1);

    expect(result.tesouraria.capital_giro).toBe(100);
    expect(result.tesouraria.capital_giro_pct).toBeCloseTo(0.2);
  });

  it('não lança exceção e retorna null (não 0) quando bp/dsp estão totalmente ausentes', () => {
    // null é o sinal de "sem dado suficiente pra calcular" (ver extractor.js)
    // — um indicador "0" pareceria um fato real (ex: 0% de endividamento).
    const result = calculateIndicators({});
    expect(result.liquidez.liquidez_corrente).toBeNull();
    expect(result.endividamento.endividamento_total_pct).toBeNull();
    expect(result.tesouraria.capital_giro).toBeNull();
  });

  it('divisão por zero cai no valor padrão em vez de Infinity/NaN', () => {
    const result = calculateIndicators({
      bp: { ativo_circulante: 100, passivo_circulante: 0 },
      dsp: {},
    });
    expect(result.liquidez.liquidez_corrente).toBe(0);
    expect(Number.isFinite(result.liquidez.liquidez_corrente)).toBe(true);
  });

  it('denominador não numérico (NaN) cai no valor padrão em vez de propagar NaN', () => {
    const result = calculateIndicators({
      bp: { ativo_circulante: 100, passivo_circulante: NaN },
      dsp: {},
    });
    expect(result.liquidez.liquidez_corrente).toBe(0);
    expect(Number.isNaN(result.liquidez.liquidez_corrente)).toBe(false);
  });

  it('usa total_ativo/total_passivo_pl derivados quando não informados explicitamente', () => {
    const result = calculateIndicators({
      bp: { ativo_circulante: 100, ativo_nao_circulante: 50, passivo_circulante: 60, passivo_nao_circulante: 40, patrimonio_liquido: 50 },
      dsp: { receita_liquida: 300 },
    });
    // total_ativo derivado = 100 + 50 = 150
    expect(result.capacidade_operacional.giro_ativo).toBeCloseTo(300 / 150);
  });

  it('anualiza só as razões que misturam saldo do balanço com fluxo da DSP', () => {
    // Mesmo balanço nos dois casos — muda apenas o tamanho do período.
    const bp = {
      ativo_circulante: 2000000, contas_receber_cp: 1000000, outros_creditos_cp: 0,
      estoques: 500000, caixa: 500000, ativo_nao_circulante: 1000000,
      ativo_permanente: 1000000, contas_receber_lp: 0, outros_creditos_lp: 0,
      total_ativo: 3000000, passivo_circulante: 800000, passivo_nao_circulante: 400000,
      patrimonio_liquido: 1800000, emprestimos_cp: 200000, emprestimos_lp: 300000,
      capital_social: 1500000, capital_integralizar: 0,
    };
    const ano = { receita_liquida: 6000000, custos_vendas: -3600000, despesas_operacionais: -1800000, sobras_perdas: 600000, depreciacao: -100000 };
    // Janeiro rodando exatamente a 1/12 do ritmo anual.
    const mes = { receita_liquida: 500000, custos_vendas: -300000, despesas_operacionais: -150000, sobras_perdas: 50000, depreciacao: -100000 / 12 };

    const a = calculateIndicators({ bp, dsp: ano });
    const m = calculateIndicators({ bp, dsp: mes, periodMonths: 1 });

    // No mesmo ritmo, as razões mistas têm que dar o mesmo número.
    expect(m.capacidade_operacional.pmr).toBeCloseTo(a.capacidade_operacional.pmr, 4);
    expect(m.capacidade_operacional.pme).toBeCloseTo(a.capacidade_operacional.pme, 4);
    expect(m.capacidade_operacional.giro_ativo).toBeCloseTo(a.capacidade_operacional.giro_ativo, 4);
    expect(m.rentabilidade.rentabilidade_pl_pct).toBeCloseTo(a.rentabilidade.rentabilidade_pl_pct, 4);
    expect(m.endividamento.nivel_alavancagem_ebitda).toBeCloseTo(a.endividamento.nivel_alavancagem_ebitda, 4);

    // Razão fluxo÷fluxo não é anualizada: as duas pontas já se cancelam.
    expect(m.rentabilidade.rentabilidade_ingressos_pct).toBeCloseTo(a.rentabilidade.rentabilidade_ingressos_pct, 4);

    // Valor absoluto continua sendo o do período, não uma projeção.
    expect(m.liquidez.ebitda).toBeCloseTo(a.liquidez.ebitda / 12, 4);

    // A marcação só aparece quando houve anualização.
    expect(m._anualizado).toEqual({ periodMonths: 1, fator: 12 });
    expect(a._anualizado).toBeNull();
  });
});
