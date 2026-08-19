import { db } from './db.js';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { DEMO_MODE } from './demo.js';

const IS_PROD = process.env.NODE_ENV === 'production';
// Separado de IS_PROD de propósito: "está em produção" e "deve ter contas
// demo com senha pública (demo123)" são decisões diferentes — um deploy de
// demonstração (ver Landing.jsx, botões "Entrar como X (demo)") roda com
// NODE_ENV=production mas ainda precisa dessas contas; um lançamento real
// não deve tê-las. Fora de produção, sempre semeia (conveniência de dev).
const SEED_DEMO = DEMO_MODE || !IS_PROD;

export async function seedDb() {
  await seedAdminUser();

  if (!SEED_DEMO) return;

  // Checa pelo tenant demo (id fixo), não por "existe algum usuário não-admin"
  // — nesse deploy de demo, gente de fora se cadastra pela tela normal de
  // registro, e isso não pode impedir as contas demo de serem semeadas. Tem
  // que ser o id fixo abaixo (não o e-mail do gerente): é ele quem colide
  // com UNIQUE constraint se essa função rodar de novo achando que ainda
  // não semeou.
  const tenantId = 'demo-tenant';
  const existingDemo = await db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId);
  if (existingDemo) return;

  // Tenant demo
  await db.prepare('INSERT INTO tenants (id, name, plan, type) VALUES (?, ?, ?, ?)').run(tenantId, 'Escritório Demo Contábil', 'pro', 'escritorio');

  // Usuário gerente demo
  const mgrId = nanoid(10);
  const mgrHash = await bcrypt.hash('demo123', 12);
  await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
                    VALUES (?, ?, ?, ?, ?, ?, 1)`)
    .run(mgrId, tenantId, 'Gerente Demo', 'escritorio@demo.com', mgrHash, 'manager');

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

  const { calculateIndicators } = await import('./calculator.js');
  const indicators2024 = calculateIndicators({ bp: bp2024, dsp: dsp2024 });
  const indicators2023 = calculateIndicators({ bp: bp2023, dsp: dsp2023 });

  const insAnalysis = db.prepare(`INSERT INTO analyses (id, client_id, year, period_label, bp, dsp, indicators, status, confidence, notes)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, 'done', 1.0, ?)
                                   ON CONFLICT (id) DO NOTHING`);

  // Cooperativa Citrus — anuais
  insAnalysis.run(
    'an-demo-citrus-2024', client1Id, 2024, null,
    JSON.stringify(bp2024), JSON.stringify(dsp2024), JSON.stringify(indicators2024),
    'Extraído do formato padrão Balanço Perguntado'
  );
  insAnalysis.run(
    'an-demo-citrus-2023', client1Id, 2023, null,
    JSON.stringify(bp2023), JSON.stringify(dsp2023), JSON.stringify(indicators2023),
    'Extraído do formato padrão Balanço Perguntado'
  );

  // Cooperativa Citrus — 2025, múltiplos períodos (demonstra filtro de período)
  const periodsCitrus = [
    { id: 'an-demo-jan25',    periodLabel: 'Janeiro de 2025',      bp: { ativo_circulante: 1050000, caixa: 345000, contas_receber_cp: 215000, adiantamentos: 52000, estoques: 435000, ativo_nao_circulante: 780000, ativo_permanente: 780000, total_ativo: 1830000, passivo_circulante: 700000, emprestimos_cp: 98000, passivo_nao_circulante: 430000, emprestimos_lp: 42000, patrimonio_liquido: 700000, capital_social: 500000, capital_integralizar: 0 }, dsp: { receita_bruta: 18000, impostos_venda: -500, receita_liquida: 17500, custos_vendas: 0, despesas_operacionais: 0, ebitda: 17500, sobras_perdas: 17500 } },
    { id: 'an-demo-bim125',   periodLabel: '1º Bimestre de 2025',  bp: { ativo_circulante: 1060000, caixa: 350000, contas_receber_cp: 218000, adiantamentos: 53000, estoques: 436000, ativo_nao_circulante: 782000, ativo_permanente: 782000, total_ativo: 1842000, passivo_circulante: 705000, emprestimos_cp: 98000, passivo_nao_circulante: 432000, emprestimos_lp: 42000, patrimonio_liquido: 705000, capital_social: 500000, capital_integralizar: 0 }, dsp: { receita_bruta: 35000, impostos_venda: -900, receita_liquida: 34100, custos_vendas: 0, despesas_operacionais: 0, ebitda: 34100, sobras_perdas: 34000 } },
    { id: 'an-demo-tri125',   periodLabel: '1º Trimestre de 2025', bp: { ativo_circulante: 1075000, caixa: 358000, contas_receber_cp: 222000, adiantamentos: 54000, estoques: 438000, ativo_nao_circulante: 785000, ativo_permanente: 785000, total_ativo: 1860000, passivo_circulante: 710000, emprestimos_cp: 96000, passivo_nao_circulante: 435000, emprestimos_lp: 41000, patrimonio_liquido: 715000, capital_social: 500000, capital_integralizar: 0 }, dsp: { receita_bruta: 54000, impostos_venda: -1400, receita_liquida: 52600, custos_vendas: 0, despesas_operacionais: 0, ebitda: 52600, sobras_perdas: 52000 } },
    { id: 'an-demo-sem125',   periodLabel: '1º Semestre de 2025',  bp: { ativo_circulante: 1095000, caixa: 370000, contas_receber_cp: 228000, adiantamentos: 55000, estoques: 439000, ativo_nao_circulante: 790000, ativo_permanente: 790000, total_ativo: 1885000, passivo_circulante: 718000, emprestimos_cp: 95000, passivo_nao_circulante: 438000, emprestimos_lp: 41000, patrimonio_liquido: 729000, capital_social: 500000, capital_integralizar: 0 }, dsp: { receita_bruta: 108000, impostos_venda: -2800, receita_liquida: 105200, custos_vendas: 0, despesas_operacionais: 0, ebitda: 105200, sobras_perdas: 105000 } },
  ];
  for (const p of periodsCitrus) {
    const ind = calculateIndicators({ bp: p.bp, dsp: p.dsp });
    insAnalysis.run(p.id, client1Id, 2025, p.periodLabel, JSON.stringify(p.bp), JSON.stringify(p.dsp), JSON.stringify(ind), `Dado demo — ${p.periodLabel}`);
  }

  // Empresa Exemplo — anual 2024 e trimestral 2025
  const bp_emp24 = { ativo_circulante: 580000, caixa: 180000, contas_receber_cp: 230000, adiantamentos: 20000, estoques: 145000, ativo_nao_circulante: 420000, ativo_permanente: 420000, total_ativo: 1000000, passivo_circulante: 320000, emprestimos_cp: 65000, passivo_nao_circulante: 180000, emprestimos_lp: 35000, patrimonio_liquido: 500000, capital_social: 400000, capital_integralizar: 0 };
  const dsp_emp24 = { receita_bruta: 920000, devolucoes: -18000, impostos_venda: -82000, receita_liquida: 820000, custos_vendas: -480000, resultado_bruto: 340000, despesas_operacionais: -242000, ebitda: 98000, depreciacao: -22000, sobras_perdas: 60000 };
  const bp_emp_tri25 = { ativo_circulante: 605000, caixa: 195000, contas_receber_cp: 240000, adiantamentos: 22000, estoques: 143000, ativo_nao_circulante: 415000, ativo_permanente: 415000, total_ativo: 1020000, passivo_circulante: 325000, emprestimos_cp: 63000, passivo_nao_circulante: 178000, emprestimos_lp: 35000, patrimonio_liquido: 517000, capital_social: 400000, capital_integralizar: 0 };
  const dsp_emp_tri25 = { receita_bruta: 232000, devolucoes: -4500, impostos_venda: -21000, receita_liquida: 206500, custos_vendas: -121000, resultado_bruto: 85500, despesas_operacionais: -61000, ebitda: 24500, depreciacao: -5500, sobras_perdas: 16000 };
  insAnalysis.run('an-demo-emp24', client2Id, 2024, null, JSON.stringify(bp_emp24), JSON.stringify(dsp_emp24), JSON.stringify(calculateIndicators({ bp: bp_emp24, dsp: dsp_emp24 })), 'Dado demo — exercício anual');
  insAnalysis.run('an-demo-emp-tri125', client2Id, 2025, '1º Trimestre de 2025', JSON.stringify(bp_emp_tri25), JSON.stringify(dsp_emp_tri25), JSON.stringify(calculateIndicators({ bp: bp_emp_tri25, dsp: dsp_emp_tri25 })), 'Dado demo — 1º Trimestre de 2025');

  // Conta admin de demonstração — fixa, independente de ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD,
  // pra sempre existir em dev sem exigir configuração de env (usada pelos botões de demo).
  await seedDemoAdmin();

  // Um tenant de demonstração por tipo de entidade única (cooperativa, empresa,
  // associação, outro) — o tipo escritório já está coberto pelo tenant acima.
  // Usado pelos botões "Entrar como demo" na Landing Page e no Login.
  await seedSingleEntityDemos();
}

async function seedDemoAdmin() {
  const email = 'admin@demo.com';
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return;
  const hash = await bcrypt.hash('demo123', 12);
  await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
                    VALUES (?, NULL, ?, ?, ?, 'admin', 1)`)
    .run(nanoid(10), 'Admin Demo', email, hash);
}

const SINGLE_ENTITY_DEMOS = [
  { type: 'cooperativa', sector: 'agropecuario', name: 'Cooperativa Demo', email: 'cooperativa@demo.com' },
  { type: 'empresa', sector: 'outro', name: 'Empresa Demo', email: 'empresa@demo.com' },
  { type: 'associacao', sector: 'outro', name: 'Associação Demo', email: 'associacao@demo.com' },
  { type: 'outro', sector: 'outro', name: 'Conta Demo', email: 'outro@demo.com' },
];

async function seedSingleEntityDemos() {
  for (const d of SINGLE_ENTITY_DEMOS) {
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(d.email);
    if (existing) continue;

    const tenantId = nanoid(10);
    const clientId = nanoid(10);
    const userId = nanoid(10);
    await db.prepare('INSERT INTO tenants (id, name, plan, type, sector, self_client_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tenantId, d.name, 'pro', d.type, d.sector, clientId);
    await db.prepare('INSERT INTO clients (id, tenant_id, name, type) VALUES (?, ?, ?, ?)')
      .run(clientId, tenantId, d.name, d.type);
    const hash = await bcrypt.hash('demo123', 12);
    await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
                      VALUES (?, ?, ?, ?, ?, 'manager', 1)`)
      .run(userId, tenantId, `${d.name} (demo)`, d.email, hash);
  }
}

async function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@synercoop.internal';
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  const real = await db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!real) {
    if (!adminPassword) {
      if (IS_PROD) {
        throw new Error('ADMIN_INITIAL_PASSWORD não definido. Defina a variável de ambiente antes de iniciar em produção.');
      }
      return;
    }
    const hash = await bcrypt.hash(adminPassword, 12);
    await db.prepare(`INSERT INTO users (id, tenant_id, name, email, password_hash, role, email_verified)
                      VALUES (?, NULL, ?, ?, ?, 'admin', 1)`)
      .run(nanoid(10), 'Administrador', adminEmail, hash);
  }
}
