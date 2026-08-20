/**
 * Explicações em linguagem simples de cada indicador.
 *
 * O painel do cliente já trazia esse texto nos ⓘ dos cartões; a análise
 * individual repetia os mesmos indicadores sem explicação nenhuma, o que
 * obrigava a pessoa a voltar pra outra tela pra entender o número. Como o
 * texto é o mesmo nos dois lugares, ele mora aqui — uma definição só, sem
 * risco de as duas telas divergirem com o tempo.
 *
 * A chave é a mesma usada em `indicators` (backend/src/lib/calculator.js).
 */
export const INDICATOR_HELP = {
  // ── Liquidez e eficiência ────────────────────────────────────────────────
  liquidez_corrente:
    'Para cada R$ 1,00 que vence nos próximos 12 meses, quanto existe em ativos de curto prazo (caixa, estoques, contas a receber). Acima de 1,20 é confortável; abaixo de 1,00 significa que as dívidas do ano superam o que se espera receber nele.',
  liquidez_geral:
    'Mesma ideia da liquidez corrente, mas somando o longo prazo dos dois lados: todo o realizável contra todas as obrigações. Mostra se os ativos cobrem as dívidas quando não há pressa. Não inclui o ativo permanente (imóveis, máquinas), que não se converte em caixa sem parar a operação.',
  liquidez_seca:
    'Liquidez corrente sem contar os estoques. Responde: se nada for vendido, ainda dá pra pagar as contas do ano? Acima de 1,00 indica que a empresa não depende de vender estoque pra honrar compromissos.',
  imobilizacao_recursos_proprios:
    'Quanto do patrimônio próprio está preso em ativo permanente (terrenos, prédios, máquinas). Acima de 80% sobra pouco capital próprio para o giro, e a operação do dia a dia passa a ser financiada por terceiros.',
  ebitda:
    'Resultado da operação antes de juros, impostos, depreciação e amortização. É a geração de caixa da atividade em si, sem efeitos financeiros nem contábeis. EBITDA negativo significa que a operação consome caixa em vez de gerar.',
  inadimplencia_total_pct:
    'Parcela dos créditos a receber já estimada como perda. Vem das perdas estimadas sobre o total a receber informado no balanço. Quanto maior, mais do que foi vendido tende a não entrar no caixa.',

  // ── Rentabilidade ────────────────────────────────────────────────────────
  rentabilidade_pl_pct:
    'ROE — quanto o capital dos sócios/cooperados rendeu no período. Compare com a Selic: se render menos que um investimento sem risco, o capital está mal remunerado no negócio.',
  rentabilidade_ativos_pct:
    'ROA — quanto todo o ativo investido rendeu, independentemente de ser capital próprio ou de terceiros. Mede a eficiência do negócio em transformar patrimônio em resultado.',
  rentabilidade_ingressos_pct:
    'Margem líquida — de cada R$ 100 de receita, quanto sobra no fim. Margem apertada deixa o resultado vulnerável a qualquer variação de custo.',
  rentabilidade_capital_integralizado_pct:
    'Retorno sobre o capital efetivamente integralizado pelos sócios/cooperados, sem contar reservas e sobras acumuladas.',

  // ── Endividamento ────────────────────────────────────────────────────────
  endividamento_total_pct:
    'Quanto do ativo é financiado por terceiros (bancos, fornecedores, obrigações). Acima de 50% mais da metade do que a empresa tem pertence, na prática, a quem emprestou.',
  perfil_endividamento_pct:
    'Da dívida total, quanto vence no curto prazo. Quanto maior, mais pressão imediata sobre o caixa — a mesma dívida é bem menos arriscada diluída no longo prazo.',
  nivel_alavancagem_ebitda:
    'Quantos anos de geração de caixa (EBITDA) seriam necessários para quitar a dívida. Até 3x é considerado sustentável; acima disso a dívida cresceu além da capacidade da operação.',
  endividamento_lp_pct:
    'Parcela das obrigações que vence depois de 12 meses. Sozinho não é bom nem ruim — dívida longa dá fôlego, mas também tem custo.',

  // ── Capacidade operacional ───────────────────────────────────────────────
  pmr:
    'Prazo Médio de Recebimento — quantos dias, em média, entre vender e receber. Prazo alto significa capital parado nas mãos dos clientes.',
  pme:
    'Prazo Médio de Estocagem — quantos dias a mercadoria fica em estoque antes de sair. Estoque parado é dinheiro parado, com custo de armazenagem e risco de perda.',
  pmp:
    'Prazo Médio de Pagamento — quantos dias, em média, para pagar os fornecedores. Aqui prazo maior é melhor: é o fornecedor financiando o giro sem cobrar juros.',
  ciclo_financeiro:
    'Dias de estoque + dias para receber − dias para pagar. É o intervalo que precisa ser bancado com recursos próprios ou com banco. Abaixo de 60 dias é ótimo; acima de 120 merece atenção.',
  ciclo_operacional:
    'Dias de estoque + dias para receber, sem descontar o prazo dos fornecedores. Mede o tempo total entre comprar e receber pela venda.',
  giro_ativo:
    'Quantas vezes a receita do período cobre o ativo total. Mede se o tamanho do investimento está compatível com o volume de negócio que ele gera.',

  // ── Tesouraria ───────────────────────────────────────────────────────────
  capital_giro:
    'CDG — folga estrutural: o quanto os recursos de longo prazo (patrimônio + dívida longa) superam o ativo permanente. Positivo significa que a operação do dia a dia tem lastro de longo prazo.',
  ncg:
    'NCG — quanto a operação precisa de dinheiro parado para funcionar (estoques e contas a receber, menos o que os fornecedores financiam). Cresce junto com o faturamento.',
  tesouraria:
    'Capital de giro menos a necessidade de capital de giro. Positivo, sobra caixa depois de bancar a operação. Negativo, o giro está sendo financiado por crédito de curto prazo — o chamado efeito tesoura.',
  independencia_financeira:
    'Quanto do ativo é bancado com recursos próprios. Acima de 40% indica boa solidez; abaixo de 25% a empresa depende fortemente de terceiros.',
};

export const PILAR_HELP = {
  liquidez: 'Capacidade de honrar compromissos nos prazos em que eles vencem.',
  rentabilidade: 'Retorno gerado sobre o patrimônio e sobre os ativos investidos.',
  endividamento: 'Volume, origem e prazo das dívidas.',
  capacidade_operacional: 'Velocidade do ciclo comprar → estocar → vender → receber.',
  tesouraria: 'Folga de caixa e necessidade de capital para tocar a operação.',
};
