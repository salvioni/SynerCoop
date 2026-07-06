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
    expect(result.liquidez.liquidez_geral).toBe(2);
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

  it('não lança exceção e usa 0 como padrão quando bp/dsp estão totalmente ausentes', () => {
    const result = calculateIndicators({});
    expect(result.liquidez.liquidez_corrente).toBe(0);
    expect(result.endividamento.endividamento_total_pct).toBe(0);
    expect(result.tesouraria.capital_giro).toBe(0);
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
});
