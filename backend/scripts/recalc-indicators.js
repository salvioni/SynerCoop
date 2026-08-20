// Recalcula os indicadores de todas as análises já gravadas.
//
// Os indicadores são calculados uma única vez, no momento em que a análise é
// criada (routes/clients.js), e ficam congelados na coluna `analyses.indicators`.
// Isso é bom para performance e para manter o histórico estável — mas quando
// uma FÓRMULA é corrigida, as análises antigas continuam mostrando o número
// errado até serem recalculadas. Este script faz esse backfill.
//
// É seguro rodar quantas vezes quiser: recalcula sempre a partir do bp/dsp
// original, que não é alterado. Nenhum dado de entrada é tocado.
//
// Uso:
//   node scripts/recalc-indicators.js          # aplica
//   node scripts/recalc-indicators.js --dry    # só mostra o que mudaria
//
// Em produção, com o DATABASE_URL do Supabase no ambiente:
//   DATABASE_URL='postgresql://...' node scripts/recalc-indicators.js

import 'dotenv/config';
import { db } from '../src/lib/db.js';
import { calculateIndicators } from '../src/lib/calculator.js';
import { monthsInPeriod } from '../src/lib/period.js';

const DRY = process.argv.includes('--dry');

// bp/dsp/indicators são colunas TEXT com JSON — mas alguns drivers/caminhos já
// devolvem objeto. Aceita os dois para o script não depender disso.
function parse(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

// Achata {grupo: {chave: valor}} em {chave: valor} para comparar antes/depois.
function flatten(ind) {
  const out = {};
  for (const group of Object.values(ind || {})) {
    if (group && typeof group === 'object') Object.assign(out, group);
  }
  return out;
}

function changedKeys(before, after) {
  const a = flatten(before), b = flatten(after);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];
  for (const k of keys) {
    const x = a[k], y = b[k];
    if (x === y) continue;
    // Ignora ruído de ponto flutuante — só reporta diferença real.
    if (typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 1e-9) continue;
    diffs.push({ key: k, from: x, to: y });
  }
  return diffs;
}

const fmt = v => v == null ? '—' : (typeof v === 'number' ? Number(v.toFixed(4)) : v);

const rows = await db.prepare(
  'SELECT id, client_id, year, period_label, bp, dsp, indicators FROM analyses ORDER BY created_at'
).all();

console.log(`${rows.length} análise(s) encontrada(s).${DRY ? '  [simulação — nada será gravado]' : ''}\n`);

let touched = 0;
const tally = new Map();

for (const row of rows) {
  const bp = parse(row.bp);
  const dsp = parse(row.dsp);
  const before = parse(row.indicators);
  const after = calculateIndicators({ bp, dsp, periodMonths: monthsInPeriod(row.period_label) });

  const diffs = changedKeys(before, after);
  if (!diffs.length) continue;

  touched++;
  const label = row.period_label || `Exercício ${row.year}`;
  console.log(`• ${row.id}  (${label})`);
  for (const d of diffs) {
    console.log(`    ${d.key}: ${fmt(d.from)}  →  ${fmt(d.to)}`);
    tally.set(d.key, (tally.get(d.key) || 0) + 1);
  }

  if (!DRY) {
    await db.prepare('UPDATE analyses SET indicators = ? WHERE id = ?')
      .run(JSON.stringify(after), row.id);
  }
}

console.log(`\n${touched} de ${rows.length} análise(s) ${DRY ? 'seriam atualizadas' : 'atualizadas'}.`);
if (tally.size) {
  console.log('\nIndicadores afetados:');
  for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(42)} ${n}`);
  }
}

process.exit(0);
