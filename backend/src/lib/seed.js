import { db } from './db.js';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

export async function seedDb() {
  await seedAdminUser();

  const row = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role != 'admin'").get();
  if ((row?.c ?? 0) > 0) {
    console.log('[seed] banco já populado, pulando dados demo.');
    return;
  }

  console.log('[seed] populando banco com dados demo...');

  // Tenant demo
  const tenantId = 'demo-tenant';
  await db.prepare('INSERT INTO tenants (id, name, plan) VALUES (?, ?, ?)').run(tenantId, 'Escritório Demo Contábil', 'trial');

  // Usuário gerente demo
  const mgrId = nanoid(10);
  const mgrHash = bcrypt.hashSync('demo123', 10);
  await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
                    VALUES (?, ?, ?, ?, ?, ?, 1)`)
    .run(mgrId, tenantId, 'Gerente Demo', 'gerente@demo.com', mgrHash, 'manager');

  // Clientes demo
  const client1Id = 'client-citrus';
  const client2Id = 'client-empresa';
  await db.prepare('INSERT INTO clients (id, tenant_id, name, cnpj, type) VALUES (?, ?, ?, ?, ?)')
    .run(client1Id, tenantId, 'Cooperativa Citrus Ltda', '12.345.678/0001-90', 'cooperativa');
  await db.prepare('INSERT INTO clients (id, tenant_id, name, cnpj, type) VALUES (?, ?, ?, ?, ?)')
    .run(client2Id, tenantId, 'Empresa Exemplo S.A.', '98.765.432/0001-10', 'empresa');

  // Dados de análise 2024 (Cooperativa Citrus)
  const bp2024 = {
    ativo_circulante: 1012000, caixa: 330000, contas_receber_cp: 205000,
    adiantamentos: 50000, estoques: 425000, outros_creditos_cp: 2000,
    ativo_nao_circulante: 765000, contas_receber_lp: 0, outros_creditos_lp: 0,
    ativo_permanente: 765000, investimentos: 200000, imobilizado: 565000,
    total_ativo: 1777000, passivo_circulante: 686200, contas_pagar_cp: 400000,
    emprestimos_cp: 95000, obrigacoes_trabalhistas: 155000, obrigacoes_tributarias_cp: 35000,
    outros_debitos_cp: 1200, passivo_nao_circulante: 420000, contas_pagar_lp: 380000,
    emprestimos_lp: 40000, obrigacoes_tributarias_lp: 0, outros_debitos_lp: 0,
    patrimonio_liquido: 670800, capital_social: 500000, capital_integralizar: 0,
    sobras_exercicio: 52000, sobras_acumuladas: 118800, total_passivo_pl: 1777000
  };
  const dsp2024 = {
    receita_bruta: 53500, devolucoes: 0, impostos_venda: -1500,
    receita_liquida: 52000, custos_vendas: 0, resultado_bruto: 52000,
    despesas_comerciais: 0, despesas_pessoal: 0, despesas_administrativas: 0,
    despesas_tributarias: 0, outros_receitas_operacionais: 0, outros_despesas_operacionais: 0,
    despesas_operacionais: 0, ebitda: 52000, depreciacao: 0,
    receitas_financeiras: 0, despesas_financeiras: 0, resultado_antes_ir: 52000,
    ir_csll: 0, sobras_perdas: 52000
  };

  // Dados de análise 2023 (~20% menores)
  const bp2023 = {
    ativo_circulante: 840000, caixa: 275000, contas_receber_cp: 170000,
    adiantamentos: 42000, estoques: 350000, outros_creditos_cp: 3000,
    ativo_nao_circulante: 640000, contas_receber_lp: 0, outros_creditos_lp: 0,
    ativo_permanente: 640000, investimentos: 165000, imobilizado: 475000,
    total_ativo: 1480000, passivo_circulante: 572000, contas_pagar_cp: 330000,
    emprestimos_cp: 80000, obrigacoes_trabalhistas: 130000, obrigacoes_tributarias_cp: 30000,
    outros_debitos_cp: 2000, passivo_nao_circulante: 350000, contas_pagar_lp: 315000,
    emprestimos_lp: 35000, obrigacoes_tributarias_lp: 0, outros_debitos_lp: 0,
    patrimonio_liquido: 558000, capital_social: 500000, capital_integralizar: 0,
    sobras_exercicio: 43000, sobras_acumuladas: 15000, total_passivo_pl: 1480000
  };
  const dsp2023 = {
    receita_bruta: 45000, devolucoes: 0, impostos_venda: -1200,
    receita_liquida: 43800, custos_vendas: 0, resultado_bruto: 43800,
    despesas_comerciais: 0, despesas_pessoal: 0, despesas_administrativas: 0,
    despesas_tributarias: 0, outros_receitas_operacionais: 0, outros_despesas_operacionais: 0,
    despesas_operacionais: 0, ebitda: 43800, depreciacao: 0,
    receitas_financeiras: 0, despesas_financeiras: 0, resultado_antes_ir: 43800,
    ir_csll: 0, sobras_perdas: 43000
  };

  // Calcular indicadores para os dados demo
  const { calculateIndicators } = await import('./calculator.js');
  const indicators2024 = calculateIndicators({ bp: bp2024, dsp: dsp2024 });
  const indicators2023 = calculateIndicators({ bp: bp2023, dsp: dsp2023 });

  const insAnalysis = db.prepare(`INSERT INTO analyses (id, client_id, year, bp, dsp, indicators, status, confidence, notes)
                                   VALUES (?, ?, ?, ?, ?, ?, 'done', 1.0, ?)`);
  await insAnalysis.run(
    'an-' + nanoid(8), client1Id, 2024,
    JSON.stringify(bp2024), JSON.stringify(dsp2024), JSON.stringify(indicators2024),
    'Extraído do formato padrão Balanço Perguntado'
  );
  await insAnalysis.run(
    'an-' + nanoid(8), client1Id, 2023,
    JSON.stringify(bp2023), JSON.stringify(dsp2023), JSON.stringify(indicators2023),
    'Extraído do formato padrão Balanço Perguntado'
  );

  console.log('[seed] OK — gerente@demo.com (senha demo123)');
  console.log('[seed] Clientes demo: Cooperativa Citrus Ltda, Empresa Exemplo S.A.');
}

async function seedAdminUser() {
  const ins = db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified) VALUES (?, NULL, ?, ?, ?, 'admin', 1)`);

  const real = await db.prepare("SELECT id FROM users WHERE email = 'admin@finanalyze.internal'").get();
  if (!real) {
    const hash = bcrypt.hashSync('admin123', 10);
    await ins.run(nanoid(10), 'Administrador', 'admin@finanalyze.internal', hash);
    console.log('[seed] admin criado — admin@finanalyze.internal / admin123');
  }
}
