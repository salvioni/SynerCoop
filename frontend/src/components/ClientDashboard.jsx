import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBackNavigate } from '../lib/useBackNavigate.js';
import ConfirmModal from './ConfirmModal.jsx';
import ClientFormModal from './ClientFormModal.jsx';
import { initials } from './UserAvatar.jsx';
import InfoTooltip from './InfoTooltip.jsx';
import AnalysisRow from './AnalysisRow.jsx';
import EmptyNote from './EmptyNote.jsx';
import { periodLabel, periodShort } from '../lib/period.js';
import { SIGNING_ENABLED } from '../lib/constants.js';
import {
  ComposedChart, BarChart, Bar, Area,
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine, LabelList,
} from 'recharts';

const FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const brl = v => v != null ? FMT.format(v) : '—';
const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
const num = v => v != null ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// Paleta dos gráficos — definida em main.css (:root e .theme-dark). O SVG
// resolve var() em atributos de apresentação, então a mesma marcação serve aos
// dois temas: no escuro os tons são reescalonados pra superfície escura, onde
// o azul-marinho do relatório impresso ficaria invisível.
const C = {
  navy:  'var(--ch-navy)',
  blue:  'var(--ch-blue)',
  gold:  'var(--ch-gold)',
  green: 'var(--ch-green)',
  red:   'var(--ch-red)',
  slate: 'var(--ch-slate)',
  muted: 'var(--ch-muted)',
};
const PIE_ATIVO   = [C.blue, C.gold, C.slate, C.muted];
const PIE_PASSIVO = [C.gold, C.slate, C.green, C.muted];

function parseAnalysis(a) {
  return {
    year:         a.year,
    period_label: a.period_label,
    bp:  typeof a.bp         === 'string' ? JSON.parse(a.bp  || '{}') : (a.bp  || {}),
    dsp: typeof a.dsp        === 'string' ? JSON.parse(a.dsp || '{}') : (a.dsp || {}),
    ind: typeof a.indicators === 'string' ? JSON.parse(a.indicators || '{}') : (a.indicators || {}),
  };
}

// Tooltip factory — formata cada série com `fmt`
function makeTip(fmt) {
  return function ChartTip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 150 }}>
        {label && <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--t0)' }}>{label}</div>}
        {payload.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', lineHeight: '1.7' }}>
            <span style={{ color: 'var(--t2)' }}>{p.name}</span>
            <span style={{ fontWeight: 600, color: p.color }}>{p.value != null ? fmt(p.value) : '—'}</span>
          </div>
        ))}
      </div>
    );
  };
}
const BrlTip  = makeTip(v => FMT.format(v));
const PctTip  = makeTip(v => `${Number(v).toFixed(1)}%`);
const DiasTip = makeTip(v => `${Math.round(v)} dias`);
const NumTip  = makeTip(v => Number(v).toFixed(2));

// Tooltip do waterfall — mostra delta (para barras de mudança) ou total (para barras de abertura/fechamento)
function WaterfallTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const bar = payload.find(p => p.dataKey === 'bar');
  if (!bar) return null;
  const d = bar.payload;
  const isChange = !d.isTotal && !d.isLast;
  const sign = isChange ? (d.delta >= 0 ? '+' : '') : '';
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.12)', minWidth: 180 }}>
      <div style={{ fontWeight: 600, color: 'var(--t0)', marginBottom: 4 }}>{d.name}</div>
      <div style={{ fontWeight: 700, color: isChange ? (d.delta >= 0 ? C.green : C.red) : C.blue }}>
        {sign}{FMT.format(d.delta)}
      </div>
      {isChange && d.running != null && (
        <div style={{ color: 'var(--t2)', marginTop: 2, fontSize: 11 }}>
          Saldo: {FMT.format(d.running)}
        </div>
      )}
    </div>
  );
}

// Destaque do cursor nos gráficos.
//
// O padrão do Recharts é um retângulo cinza-claro OPACO por trás da série sob
// o mouse. No tema claro ele lava a barra; no escuro vira um bloco branco por
// cima do gráfico. Trocado por um véu translúcido que escurece de leve no
// claro e clareia de leve no escuro, sem apagar o que está embaixo.
const CURSOR = { fill: 'currentColor', fillOpacity: 0.06, stroke: 'var(--bd2)', strokeOpacity: 0.5 };

// Eixos e grade reutilizáveis
// Gridlines sólidas finas — traçado (strokeDasharray) é anti-padrão (lê como "projeção")
// O ponto padrão do Recharts é branco por dentro — vira uma bolinha vazada que
// no tema escuro salta mais que a própria linha. Aqui ele é sólido, na cor da
// série, com um anel da superfície pra separar de linhas sobrepostas.
const dot = (color, r = 4) => ({ r, fill: color, stroke: 'var(--bg1)', strokeWidth: 1.5 });
// O ponto ativo (hover) tem o mesmo problema: anel branco fixo por padrão.
const adot = color => ({ r: 6, fill: color, stroke: 'var(--bg1)', strokeWidth: 2 });

const GRID    = <CartesianGrid stroke="var(--bd)" vertical={false} strokeWidth={0.5} />;
const XAXIS   = <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />;
const YAXBRL  = <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} tickFormatter={v => FMT.format(v)} width={72} />;
const YAXPCT  = <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={44} />;
const YAXDIAS = <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}d`} width={40} />;
const YAXNUM  = <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} tickFormatter={v => Number(v).toFixed(1)} width={44} />;
const LEG     = <Legend wrapperStyle={{ fontSize: 12 }} />;

// ── Semáforo financeiro para cooperativas ────────────────────────────
// Retorna 'good' | 'warn' | 'bad' | null com base em benchmarks setoriais.
function health(key, value) {
  if (value == null) return null;
  const rules = {
    liquidez_corrente:        v => v >= 1.5 ? 'good' : v >= 1.0 ? 'warn' : 'bad',
    liquidez_seca:            v => v >= 1.0 ? 'good' : v >= 0.7 ? 'warn' : 'bad',
    liquidez_geral:           v => v >= 1.0 ? 'good' : v >= 0.8 ? 'warn' : 'bad',
    independencia_financeira: v => v >= 0.40 ? 'good' : v >= 0.25 ? 'warn' : 'bad',
    endividamento_total:      v => v <= 0.50 ? 'good' : v <= 0.70 ? 'warn' : 'bad',
    roe:                      v => v >= 0.08 ? 'good' : v >= 0.03 ? 'warn' : 'bad',
    roa:                      v => v >= 0.05 ? 'good' : v >= 0.01 ? 'warn' : 'bad',
    margem_ebitda:            v => v >= 0.08 ? 'good' : v >= 0.03 ? 'warn' : 'bad',
    capital_giro:             v => v > 0 ? 'good' : 'bad',
    tesouraria:               v => v > 0 ? 'good' : v > -50000 ? 'warn' : 'bad',
    ebitda:                   v => v > 0 ? 'good' : 'bad',
    ciclo_financeiro:         v => v <= 60 ? 'good' : v <= 120 ? 'warn' : 'bad',
  };
  return rules[key]?.(value) ?? null;
}
// Cores de status vêm do tema — no escuro o verde/vermelho impressos ficam
// escuros demais contra o fundo.
const H_COLOR = { good: 'var(--green-t)', warn: 'var(--yellow-t)', bad: 'var(--red-t)' };
const H_LABEL = { good: 'Bom', warn: 'Atenção', bad: 'Crítico' };

function ChartCard({ title, info, subtitle, noData, style: s, children }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, ...s }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--t0)', margin: 0, display: 'flex', alignItems: 'center' }}>
          {title}
          {info && <InfoTooltip text={info} />}
        </h3>
        {subtitle && <span style={{ fontSize: 12, color: 'var(--t3)', flexShrink: 0, marginLeft: 12 }}>{subtitle}</span>}
      </div>
      {noData
        ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--t3)', fontSize: 13 }}>
            <i className="ti ti-chart-off" style={{ fontSize: 24, opacity: .4 }} />
            Dados insuficientes para este gráfico
          </div>
        : children}
    </div>
  );
}

function PieLegend({ data, colors }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
      {data.map((d, i) => (
        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 9, height: 9, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
          <span style={{ color: 'var(--t2)', flex: 1 }}>{d.name}</span>
          <span style={{ fontWeight: 500, color: 'var(--t0)' }}>{brl(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Painel de análises de um único cliente — usado em ClientView.jsx
// e em Dashboard.jsx para contas de entidade única (cooperativa/empresa/etc).
/**
 * Painel de um cliente. Também é o "Desempenho" das contas de entidade única
 * (que não têm carteira) — daí os três ajustes de apresentação:
 *   hideHeader  — esconde o cartão de identificação do cliente (logo/nome/tipo),
 *                 redundante quando o cliente É a própria conta.
 *   hideHistory — esconde o histórico de análises do rodapé, já que essas contas
 *                 têm a página "Análises" dedicada no menu.
 *   topSlot     — conteúdo opcional no topo (ex.: a saudação "Bom dia, Fulano"
 *                 + título da página).
 */
export default function ClientDashboard({ clientId, backHref, allowDelete = true, hideHeader = false, hideHistory = false, topSlot = null }) {
  const navigate = useNavigate();
  const [client, setClient]       = useState(null);
  const [analyses, setAnalyses]   = useState([]);
  // IDs das análises visíveis. null = todas — evita ter que sincronizar a
  // seleção toda vez que a lista chega ou muda.
  const [selectedIds, setSelectedIds] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [confirm, setConfirm]     = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const goBack = useBackNavigate(backHref || '/app/clients');

  useEffect(() => {
    api.get(`/clients/${clientId}`)
      .then(d => { setClient(d.client); setAnalyses(d.analyses || []); })
      .catch(() => { if (backHref) navigate(backHref, { replace: true }); })
      .finally(() => setLoading(false));
  }, [clientId]);

  async function deleteAnalysis(a) {
    setConfirm(null);
    try {
      await api.del(`/analyses/${a.id}`);
      setAnalyses(prev => prev.filter(x => x.id !== a.id));
    } catch (e) { setActionErr(e.message); }
  }

  async function archiveClient() {
    setConfirm(null);
    try {
      await api.del(`/clients/${clientId}`);
      navigate(backHref || '/app/clients');
    } catch (e) { setActionErr(e.message); }
  }

  async function reactivate() {
    try {
      const r = await api.put(`/clients/${clientId}`, { ...client, active: true });
      setClient(r.client);
    } catch (e) { setActionErr(e.message); }
  }

  // Âncora da seta que liga o estado vazio ao botão "Nova análise" da lateral.


  if (loading || !client) return null;

  // Conta/cliente sem nenhuma análise: cartões zerados e gráficos vazios não
  // dizem nada. A tela vira um convite ao primeiro passo — incluindo baixar o
  // modelo, porque quem acabou de criar a conta pode nem ter a planilha.
  if (!analyses.length) {
    return (
      <div className="page-body">
        {backHref && (
          <button className="back" onClick={goBack} style={{ marginBottom: 16 }}>
            <i className="ti ti-arrow-left" /> Voltar
          </button>
        )}
        {topSlot}
        {actionErr && (
          <div className="err-banner" style={{ marginBottom: 16 }}>{actionErr}</div>
        )}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12 }}>
          <EmptyNote>Nenhuma análise ainda.</EmptyNote>
        </div>
      </div>
    );
  }

  // Ordem cronológica de todas as análises — base tanto do filtro quanto dos
  // gráficos. O filtro entra ANTES de `parsed`, então cards, gráficos e
  // comparações passam todos a refletir só os períodos escolhidos.
  const allSorted   = [...analyses].sort((a, b) => a.year - b.year || new Date(a.created_at) - new Date(b.created_at));
  const isVisible   = a => !selectedIds || selectedIds.includes(a.id);
  const sorted      = allSorted.filter(isVisible);
  const parsed      = sorted.map(parseAnalysis);
  const latest      = parsed[parsed.length - 1];
  const prev        = parsed.length >= 2 ? parsed[parsed.length - 2] : null;
  const hasMultiple = parsed.length > 1;

  // Variação % entre dois valores (para setas de tendência)
  const trendPct = (cur, old) => {
    if (cur == null || old == null || old === 0) return null;
    return ((cur - old) / Math.abs(old)) * 100;
  };

  const STATS = [
    {
      label: 'Receita Líquida',
      val:   brl(latest?.dsp?.receita_liquida ?? latest?.dsp?.ingressos),
      icon:  'ti-trending-up',
      delta: trendPct(
        latest?.dsp?.receita_liquida ?? latest?.dsp?.ingressos,
        prev?.dsp?.receita_liquida   ?? prev?.dsp?.ingressos
      ),
      info: 'Total faturado menos devoluções e impostos sobre venda. É a principal medida do volume de negócios da cooperativa.',
    },
    {
      label: 'EBITDA',
      val:   brl(latest?.ind?.liquidez?.ebitda),
      icon:  'ti-chart-bar',
      delta: trendPct(latest?.ind?.liquidez?.ebitda, prev?.ind?.liquidez?.ebitda),
      info:  'Resultado operacional antes de juros, impostos, depreciação e amortização. Mede a geração de caixa da operação sem efeitos financeiros ou contábeis.',
    },
    {
      label: 'Sobras / Perdas',
      val:   brl(latest?.dsp?.sobras_perdas),
      icon:  'ti-coins',
      delta: trendPct(latest?.dsp?.sobras_perdas, prev?.dsp?.sobras_perdas),
      info:  'Resultado líquido do exercício. Em cooperativas não se chama "Lucro" — chama-se Sobras (positivo) ou Perdas (negativo). As sobras são distribuídas aos cooperados conforme o estatuto.',
    },
    {
      label: 'Ativo Total',
      val:   brl(latest?.bp?.total_ativo),
      icon:  'ti-building-bank',
      delta: trendPct(latest?.bp?.total_ativo, prev?.bp?.total_ativo),
      info:  'Total de bens e direitos da cooperativa: caixa, estoques, contas a receber, imóveis, máquinas etc.',
    },
  ];

  const KEY_IND = [
    {
      label:     'Liquidez Corrente',
      // shortDesc: explicação leiga direta sob o valor — complementa o InfoTooltip
      shortDesc: 'R$ disponível por cada R$1 de dívida de curto prazo',
      val:       num(latest?.ind?.liquidez?.liquidez_corrente),
      rawVal:    latest?.ind?.liquidez?.liquidez_corrente,
      healthKey: 'liquidez_corrente',
      gaugeMin:  0, gaugeMax: 3,
      info:      'Para cada R$1 em dívidas que vencem nos próximos 12 meses, a cooperativa tem R$X disponível em ativos de curto prazo. Acima de 1,5 é ótimo. Abaixo de 1,0 é alerta — pode haver dificuldade de pagamento.',
    },
    {
      label:     'Independência Financeira',
      shortDesc: 'Quanto do ativo é financiado com recursos próprios',
      val:       pct(latest?.ind?.tesouraria?.independencia_financeira),
      rawVal:    latest?.ind?.tesouraria?.independencia_financeira,
      healthKey: 'independencia_financeira',
      gaugeMin:  0, gaugeMax: 1,
      info:      'Porcentagem do ativo financiada com recursos próprios (Patrimônio Líquido dos cooperados). Acima de 40% indica boa solidez. Abaixo de 25% a cooperativa depende muito de dívidas.',
    },
    {
      label:     'ROE — Retorno sobre Patrimônio',
      shortDesc: 'Quanto o patrimônio dos cooperados rendeu no exercício',
      val:       pct(latest?.ind?.rentabilidade?.rentabilidade_pl_pct),
      rawVal:    latest?.ind?.rentabilidade?.rentabilidade_pl_pct,
      healthKey: 'roe',
      gaugeMin:  -0.05, gaugeMax: 0.25,
      info:      'Return on Equity (ROE) — quanto o patrimônio dos cooperados rendeu no exercício. Acima de 8% ao ano é considerado bom para cooperativas rurais. Compara com a taxa Selic para ter referência.',
    },
    {
      label:     'Ciclo Financeiro',
      shortDesc: 'Dias que a coop. financia as operações com recursos próprios',
      val:       latest?.ind?.capacidade_operacional?.ciclo_financeiro != null
                   ? Math.round(latest.ind.capacidade_operacional.ciclo_financeiro) + ' dias'
                   : '—',
      rawVal:    latest?.ind?.capacidade_operacional?.ciclo_financeiro,
      healthKey: 'ciclo_financeiro',
      gaugeMin:  0, gaugeMax: 180,
      // Ciclo financeiro: menor é melhor, então inverter no gauge
      gaugeInvert: true,
      info:      'Dias de estoque + dias para receber clientes − dias para pagar fornecedores. É o tempo que a cooperativa precisa financiar com recursos próprios. Abaixo de 60 dias é ótimo; acima de 120 merece atenção.',
    },
    {
      label:     'CDG — Capital de Giro',
      shortDesc: 'Folga financeira de longo prazo para sustentar as operações',
      val:       brl(latest?.ind?.tesouraria?.capital_giro),
      rawVal:    latest?.ind?.tesouraria?.capital_giro,
      healthKey: 'capital_giro',
      info:      'Capital de Giro (CDG) — folga financeira de longo prazo para financiar as operações do dia a dia. CDG positivo significa que os recursos permanentes (PL + dívida LP) superam os ativos fixos — sinal de boa estrutura financeira.',
    },
    {
      label:     'Tesouraria (T)',
      shortDesc: 'Caixa restante após financiar toda a operação',
      val:       brl(latest?.ind?.tesouraria?.tesouraria),
      rawVal:    latest?.ind?.tesouraria?.tesouraria,
      healthKey: 'tesouraria',
      info:      'Tesouraria = CDG menos a Necessidade de Capital de Giro (NCG). Tesouraria positiva significa que sobra caixa após financiar toda a operação. Negativa pode indicar dependência de crédito de curto prazo para financiar o giro.',
    },
  ];

  // ── Dados dos gráficos ──────────────────────────────────────────────────
  const xl = p => periodShort(p);

  // 1. Receita e Resultado — ComposedChart: bars (Receita/EBITDA) + line (Sobras)
  const receitaData = parsed.map(p => ({
    name:            xl(p),
    'Receita Líq.':  p.dsp.receita_liquida ?? p.dsp.ingressos,
    'EBITDA':        p.ind.liquidez?.ebitda,
    'Sobras/Perdas': p.dsp.sobras_perdas,
  }));
  const hasReceita = receitaData.some(r => r['Receita Líq.'] != null);

  // 2. Liquidez — LineChart: corrente + seca + referência 1,0
  const liquidezData = parsed.map(p => ({
    name:       xl(p),
    'Corrente': p.ind.liquidez?.liquidez_corrente,
    'Seca':     p.ind.liquidez?.liquidez_seca,
  }));
  const hasLiquidez = liquidezData.some(r => r['Corrente'] != null);

  // 3. Estrutura de Capital % — BarChart 100% empilhado
  // Calcula direto do BP quando disponível. O BP deve fechar em 100%
  // (Total Passivo + PL = Total Ativo), mas campos não extraídos somem silenciosamente.
  // O segmento "Não identificado" preenche a diferença até 100% em cinza — sinaliza
  // ao usuário que existe saldo no balanço que não foi mapeado pelo extrator,
  // sem inventar valores.
  const capitalData = parsed.map(p => {
    const ta   = p.bp.total_ativo;
    const pc   = p.bp.total_passivo_circulante ?? p.bp.passivo_circulante;
    const pnc  = p.bp.total_passivo_nao_circulante ?? p.bp.passivo_nao_circulante;
    const pl   = p.bp.patrimonio_liquido;
    const e    = p.ind.endividamento || {};
    const t    = p.ind.tesouraria || {};
    const fromBP = ta && ta > 0 && (pc != null || pnc != null || pl != null);

    let cpPct, lpPct, plPct;
    if (fromBP) {
      cpPct = pc  != null ? +(pc  / ta * 100) : 0;
      lpPct = pnc != null ? +(pnc / ta * 100) : 0;
      plPct = pl  != null ? +(pl  / ta * 100) : 0;
    } else {
      cpPct = e.endividamento_cp_pct        != null ? e.endividamento_cp_pct        * 100 : null;
      lpPct = e.endividamento_lp_pct        != null ? e.endividamento_lp_pct        * 100 : null;
      plPct = t.independencia_financeira     != null ? t.independencia_financeira     * 100 : null;
    }

    // Diferença até 100% = saldo do BP não mapeado pelo extrator
    const identified = (cpPct ?? 0) + (lpPct ?? 0) + (plPct ?? 0);
    const gap = cpPct != null ? Math.max(0, +(100 - identified).toFixed(1)) : null;

    return {
      name:                 xl(p),
      'Passivo CP':         cpPct != null ? +cpPct.toFixed(1) : null,
      'Passivo LP':         lpPct != null ? +lpPct.toFixed(1) : null,
      'Patrim. Líquido':    plPct != null ? +plPct.toFixed(1) : null,
      'Não identificado':   gap   != null && gap > 0.5 ? gap : null,
    };
  });
  const hasCapital = capitalData.some(r => r['Passivo CP'] != null);

  // 4. Rentabilidade — LineChart: ROE + ROA (%)
  const rentabData = parsed.map(p => {
    const r = p.ind.rentabilidade || {};
    return {
      name:  xl(p),
      'ROE': r.rentabilidade_pl_pct    != null ? +(r.rentabilidade_pl_pct    * 100).toFixed(2) : null,
      'ROA': r.rentabilidade_ativo_pct != null ? +(r.rentabilidade_ativo_pct * 100).toFixed(2) : null,
    };
  });
  const hasRentab = rentabData.some(r => r['ROE'] != null || r['ROA'] != null);

  // 5. Ciclo Financeiro — ComposedChart: barras PME+PMR + linha ciclo
  const cicloData = parsed.map(p => {
    const op = p.ind.capacidade_operacional || {};
    return {
      name:               xl(p),
      'PME':              op.pme              != null ? Math.round(op.pme)              : null,
      'PMR':              op.pmr              != null ? Math.round(op.pmr)              : null,
      'Ciclo Financeiro': op.ciclo_financeiro != null ? Math.round(op.ciclo_financeiro) : null,
    };
  });
  const hasCiclo = cicloData.some(r => r['PME'] != null || r['PMR'] != null);

  // 6. Modelo de Fleuriet — ComposedChart: área CDG + linhas NCG + Tesouraria
  const fleurietData = parsed.map(p => ({
    name:           xl(p),
    'Cap. de Giro': p.ind.tesouraria?.capital_giro,
    'NCG':          p.ind.tesouraria?.ncg,
    'Tesouraria':   p.ind.tesouraria?.tesouraria,
  }));
  const hasFleuriet = fleurietData.some(r => r['Cap. de Giro'] != null);

  // 7. Resultado Financeiro — mostra quanto do EBITDA é consumido por encargos
  // (crítico para cooperativas: Coopercitrus 2023 gerou R$306M EBITDA e pagou R$269M em juros)
  const resultFinData = parsed.map(p => {
    const ebitda  = p.ind.liquidez?.ebitda;
    const ingFin  = p.dsp.ingressos_financeiros;
    const despFin = p.dsp.despesas_financeiras;
    const resFin  = ingFin != null || despFin != null
      ? (ingFin ?? 0) - (despFin ?? 0)
      : p.dsp.resultado_financeiro ?? null;
    return {
      name:                 xl(p),
      'EBITDA':             ebitda,
      'Result. Financeiro': resFin,
      'Sobras/Perdas':      p.dsp.sobras_perdas,
    };
  });
  const hasResultFin = hasMultiple && resultFinData.some(r => r['EBITDA'] != null || r['Result. Financeiro'] != null || r['Sobras/Perdas'] != null);

  // 8. Cascata DSP — waterfall real (latest)
  // Cada barra de mudança mostra o DELTA (deduções em vermelho, acréscimos em verde).
  // Barras de abertura/fechamento mostram o valor absoluto em azul-escuro/verde-vermelho.
  // Implementação recharts: BarChart empilhado com base transparente + barra colorida.
  function buildWaterfall(p) {
    if (!p) return [];
    const dsp    = p.dsp;
    const ebitda = p.ind.liquidez?.ebitda;
    const steps  = [];

    const rb = dsp.receita_bruta;
    const rl = dsp.receita_liquida ?? dsp.ingressos;
    const rbruto = dsp.resultado_bruto;
    const sp = dsp.sobras_perdas;

    // Barra de abertura
    const opening = rb ?? rl;
    if (opening == null) return [];
    steps.push({ name: rb != null ? 'Receita Bruta' : 'Receita Líquida', delta: opening, running: opening, isTotal: true });

    // Deduções (receita bruta → líquida)
    if (rb != null && rl != null) {
      const d = rl - rb;
      if (Math.abs(d) > 0.01) steps.push({ name: 'Deduções', delta: d, running: rl });
    }

    // Custos das vendas (receita líquida → resultado bruto)
    if (rbruto != null) {
      const base = rl ?? rb;
      if (base != null) {
        const d = rbruto - base;
        if (Math.abs(d) > 0.01) steps.push({ name: 'Custos das Vendas', delta: d, running: rbruto });
      }
    }

    // Despesas operacionais (resultado bruto → EBITDA)
    if (ebitda != null) {
      const base = rbruto ?? rl ?? rb;
      if (base != null) {
        const d = ebitda - base;
        if (Math.abs(d) > 0.01) steps.push({ name: d >= 0 ? 'Out. Receitas Op.' : 'Desp. Operacionais', delta: d, running: ebitda });
      }
    }

    // Resultado financeiro / outros (EBITDA → sobras)
    if (sp != null) {
      const base = ebitda ?? rbruto ?? rl ?? rb;
      if (base != null) {
        const d = sp - base;
        if (Math.abs(d) > 0.01) steps.push({ name: d >= 0 ? 'Rec. Financeiras' : 'Res. Financeiro', delta: d, running: sp });
      }
      steps.push({ name: 'Sobras/Perdas', delta: sp, running: sp, isLast: true });
    }

    if (steps.length < 2) return [];

    // Computa base (offset transparente) para cada barra
    return steps.map(s => {
      if (s.isTotal || s.isLast) return { ...s, base: 0, bar: Math.abs(s.delta) };
      if (s.delta >= 0) return { ...s, base: s.running - s.delta, bar: s.delta };
      return { ...s, base: s.running, bar: Math.abs(s.delta) }; // decreases: bar vai do novo total ao anterior
    });
  }
  const cascataData = buildWaterfall(latest);
  // Cascata mostra com 1 ou mais períodos — é um gráfico de composição, não de evolução.
  const hasCascata  = cascataData.length >= 1;

  // 8. Composição do Ativo — pizza (latest)
  // realizável LP = contas a receber LP + outros créditos LP
  // (campo "ativo_realizavel_lp" não existe como campo direto no extrator)
  const realizavelLP = (latest?.bp.contas_receber_lp ?? 0) + (latest?.bp.outros_creditos_lp ?? 0);
  const ativoData = latest ? [
    { name: 'Circulante',    value: latest.bp.ativo_circulante },
    { name: 'Imobilizado',   value: latest.bp.imobilizado ?? latest.bp.ativo_permanente },
    { name: 'Realizável LP', value: realizavelLP > 0 ? realizavelLP : null },
    { name: 'Intangível',    value: latest.bp.intangivel },
  ].filter(d => d.value != null && d.value > 0) : [];

  // 9. Estrutura de Financiamento — pizza (latest)
  const passivoData = latest ? [
    { name: 'Passivo CP',      value: latest.bp.total_passivo_circulante ?? latest.bp.passivo_circulante },
    { name: 'Passivo LP',      value: latest.bp.total_passivo_nao_circulante ?? latest.bp.passivo_nao_circulante },
    { name: 'Patrim. Líquido', value: latest.bp.patrimonio_liquido },
  ].filter(d => d.value != null && d.value > 0) : [];

  const H = 240; // altura padrão dos gráficos de evolução

  return (
    <div className="page-body">
      {backHref && (
        <button className="back" onClick={goBack} style={{ marginBottom: 16 }}>
          <i className="ti ti-arrow-left" /> Voltar
        </button>
      )}

      {topSlot}

      {/* Banner de erro (substituindo alert()) */}
      {actionErr && (
        <div style={{ background: 'var(--red-bg,#ffebee)', color: 'var(--red-t,#c41d1d)', border: '1px solid var(--red-bd,#f5c6cb)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <i className="ti ti-alert-circle" />
          {actionErr}
          <button onClick={() => setActionErr('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>
            <i className="ti ti-x" />
          </button>
        </div>
      )}

      {/* ── Cabeçalho do cliente ──────────────────────────────────────── */}
      {!hideHeader && (
        <div className="client-hd" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div className="cl-card-av" style={{
              width: 56, height: 56, borderRadius: 12, fontSize: 18, flexShrink: 0,
              ...(client.logo ? { backgroundImage: `url(${client.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : client.logo_color ? { background: client.logo_color } : {}),
            }}>
              {!client.logo && initials(client.name)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 56 }}>
              <h1 className="client-view-name" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, color: client.active ? 'var(--t0)' : 'var(--t3)' }}>
                {client.name}
                {!client.active && <span className="pill pill-y">Arquivado</span>}
              </h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14, color: 'var(--t2)' }}>
                <span style={{ textTransform: 'capitalize' }}>{client.type || 'empresa'}</span>
                {client.cnpj && <span style={{ fontFamily: 'ui-monospace, monospace' }}>{client.cnpj}</span>}
                {client.contact_email && <span><i className="ti ti-mail" style={{ fontSize: 14, marginRight: 4 }} />{client.contact_email}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ib" title="Editar cliente" onClick={() => setEditModal(true)} style={{ color: 'var(--t2)', padding: 8 }}>
              <i className="ti ti-edit" style={{ fontSize: 22 }} />
            </button>
            {allowDelete && (client.active ? (
              <button className="ib" title="Arquivar cliente" style={{ color: 'var(--t2)', padding: 8 }} onClick={() => setConfirm({
                title: 'Arquivar cliente',
                message: `"${client.name}" será movido para arquivados. O histórico de análises é mantido e você pode reativá-lo quando quiser.`,
                confirmLabel: 'Arquivar', danger: true,
                onConfirm: archiveClient,
              })}>
                <i className="ti ti-archive" style={{ fontSize: 22 }} />
              </button>
            ) : (
              <button className="ib" title="Reativar cliente" onClick={reactivate} style={{ color: 'var(--t2)', padding: 8 }}>
                <i className="ti ti-archive-off" style={{ fontSize: 22 }} />
              </button>
            ))}
          </div>
        </div>
      )}

        {/* ── Filtro de períodos ───────────────────────────────────── */}
        {allSorted.length > 1 && (
          <div style={{
            marginBottom: 20, padding: '14px 18px', background: 'var(--bg1)',
            border: '1px solid var(--bd)', borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="ty-label">Períodos comparados</span>
              {selectedIds && (
                <button onClick={() => setSelectedIds(null)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 12, color: 'var(--blue-text)', textDecoration: 'underline',
                }}>
                  Mostrar todos ({allSorted.length})
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allSorted.map(a => {
                const on = isVisible(a);
                return (
                  <button
                    key={a.id}
                    aria-pressed={on}
                    onClick={() => {
                      const atuais = selectedIds || allSorted.map(x => x.id);
                      // Nunca deixa a seleção vazia — sem nenhum período não
                      // há o que desenhar, e a tela ficaria em branco sem
                      // explicação.
                      const novos = on ? atuais.filter(id => id !== a.id) : [...atuais, a.id];
                      if (!novos.length) return;
                      setSelectedIds(novos.length === allSorted.length ? null : novos);
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: 100, cursor: 'pointer', fontSize: 13,
                      border: `1px solid ${on ? 'var(--blue-text)' : 'var(--bd)'}`,
                      background: on ? 'var(--blue-dim)' : 'var(--bg2)',
                      color: on ? 'var(--blue-text)' : 'var(--t2)',
                      fontWeight: on ? 500 : 400,
                    }}
                  >
                    {periodShort(a)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      {/* ── Cards de resumo ───────────────────────────────────────────── */}
      <div className="dash-grid" style={{ marginBottom: 24 }}>
        {STATS.map(({ label, val, icon, delta, info }) => (
          <div key={label} className="dash-card">
            <div className="dash-card-head">
              <span className="dash-card-label" style={{ display: 'flex', alignItems: 'center' }}>
                {label}
                {info && <InfoTooltip text={info} />}
              </span>
              <i className={`ti ${icon} dash-card-icon`} />
            </div>
            <div className="dash-card-val">{val}</div>
            {delta != null && hasMultiple && (
              <div style={{ fontSize: 11, marginTop: 4, color: delta >= 0 ? C.green : C.red, display: 'flex', alignItems: 'center', gap: 3, fontVariantNumeric: 'tabular-nums' }}>
                <i className={`ti ${delta >= 0 ? 'ti-trending-up' : 'ti-trending-down'}`} style={{ fontSize: 12 }} />
                {delta >= 0 ? '+' : ''}{Math.round(delta)}% vs {periodShort(prev)}
              </div>
            )}
          </div>
        ))}
      </div>

      {latest && (
        <>
          {/* ── Painel Saúde Financeira ───────────────────────────────── */}
          {/* Semáforo de indicadores-chave — fica no topo para que quem não
              tem formação financeira veja imediatamente o diagnóstico */}
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--t0)', margin: 0 }}>
                Saúde Financeira
                <InfoTooltip text="Avaliação rápida dos principais indicadores financeiros com base em benchmarks de cooperativas brasileiras. Verde = saudável, Amarelo = atenção, Vermelho = crítico." />
              </h3>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{periodLabel(latest)}</span>
            </div>
            <div className="grid-3">
              {KEY_IND.map(({ label, val, rawVal, healthKey, info, gaugeMin, gaugeMax, gaugeInvert }) => {
                const h      = health(healthKey, rawVal);
                const hColor = h ? H_COLOR[h] : 'var(--bd)';
                const hLabel = h ? H_LABEL[h] : null;
                // Mini barra de gauge para indicadores com escala definida
                const gaugePct = (gaugeMin != null && gaugeMax != null && rawVal != null)
                  ? Math.min(100, Math.max(0, ((rawVal - gaugeMin) / (gaugeMax - gaugeMin)) * 100))
                  : null;
                const gaugeFill = gaugeInvert
                  ? (100 - (gaugePct ?? 0))   // Ciclo Financeiro: menos = melhor
                  : (gaugePct ?? 0);
                return (
                  <div key={label} style={{
                    padding: '14px 16px', background: 'var(--bg2)', borderRadius: 8,
                    borderLeft: `3px solid ${hColor}`,
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {label}
                      <InfoTooltip text={info} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--t0)', marginBottom: 6 }}>
                      {val}
                    </div>
                    {gaugePct != null && (
                      <div style={{ height: 3, background: 'var(--bg0)', borderRadius: 2, marginBottom: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${gaugeFill}%`, background: hColor, borderRadius: 2, transition: 'width .7s ease' }} />
                      </div>
                    )}
                    {hLabel && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: hColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        ● {hLabel}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Aviso: apenas 1 análise — sem gráficos de evolução ────── */}
          {!hasMultiple && (
            <div style={{
              marginBottom: 20, padding: '14px 18px',
              background: 'var(--bg1)', border: '1px dashed var(--bd)',
              borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              <i className="ti ti-chart-line" style={{ fontSize: 20, color: 'var(--t3)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t1)', marginBottom: 3 }}>Análise de período único</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
                  Os gráficos de evolução (comparativo entre exercícios) aparecem ao adicionar
                  análises de outros anos, trimestres ou meses. Por enquanto, veja abaixo
                  a cascata de resultado e a composição dos ativos/passivos deste período.
                </div>
              </div>
            </div>
          )}

          {/* ── Gráficos de evolução (≥ 2 análises) ──────────────────── */}
          {hasMultiple && (
            <>
              {/* 1. Receita Líquida */}
              <div style={{ marginBottom: 20 }}>
                <ChartCard
                  title="Receita Líquida"
                  info="Total faturado menos devoluções e impostos sobre venda. É a principal medida do volume de negócios da cooperativa ao longo dos exercícios."
                  subtitle="Evolução por exercício"
                  noData={!hasReceita}
                >
                  <ResponsiveContainer width="100%" height={H}>
                    <BarChart data={receitaData} barGap={4}>
                      {GRID}{XAXIS}{YAXBRL}
                      <Tooltip content={<BrlTip />} cursor={CURSOR} />{LEG}
                      <Bar dataKey="Receita Líq." fill={C.blue} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* 1b. Resultado Financeiro — EBITDA vs encargos vs Sobras */}
              {hasResultFin && (
                <div style={{ marginBottom: 20 }}>
                  <ChartCard
                    title="Resultado Financeiro"
                    info="Mostra quanto da geração operacional (EBITDA) foi consumida por encargos financeiros (juros, IOF, tarifas bancárias). Em cooperativas com alto endividamento, o resultado financeiro negativo pode zerar o EBITDA. Sobras/Perdas é o que sobra depois de tudo."
                    subtitle="EBITDA × encargos financeiros × Sobras"
                  >
                    <ResponsiveContainer width="100%" height={H}>
                      <ComposedChart data={resultFinData} barGap={4}>
                        {GRID}{XAXIS}{YAXBRL}
                        <Tooltip content={<BrlTip />} cursor={CURSOR} />{LEG}
                        <Bar dataKey="EBITDA"             fill={C.blue}  radius={[4,4,0,0]} />
                        <Bar dataKey="Result. Financeiro" fill={C.red}   radius={[4,4,0,0]} />
                        <Line type="monotone" dataKey="Sobras/Perdas" stroke={C.green} strokeWidth={2.5} dot={dot(C.green, 5)} activeDot={adot(C.green)} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              )}

              {/* 2. Liquidez + 3. Estrutura de Capital */}
              <div className="grid-2" style={{ marginBottom: 20 }}>
                <ChartCard
                  title="Evolução da Liquidez"
                  info="Liquidez Corrente: para cada R$1 em dívidas de curto prazo, quantos reais a cooperativa tem disponível. Liquidez Seca: mesma coisa excluindo os estoques (mais conservador). A linha vermelha marca o mínimo de 1,0 — abaixo disso é sinal de alerta."
                  noData={!hasLiquidez}
                >
                  <ResponsiveContainer width="100%" height={H}>
                    <LineChart data={liquidezData}>
                      {GRID}{XAXIS}{YAXNUM}
                      <Tooltip content={<NumTip />} cursor={CURSOR} />{LEG}
                      <ReferenceLine y={1} stroke={C.red} strokeDasharray="4 4" label={{ value: '1,0 mín.', position: 'insideTopRight', fontSize: 11, fill: C.red }} />
                      <Line type="monotone" dataKey="Corrente" stroke={C.blue} strokeWidth={2} dot={dot(C.blue)} activeDot={adot(C.blue)} connectNulls />
                      <Line type="monotone" dataKey="Seca"     stroke={C.gold} strokeWidth={2} dot={dot(C.gold)} activeDot={adot(C.gold)} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Estrutura de Capital"
                  info="Como os recursos da cooperativa são financiados: Passivo CP (dívidas a pagar em até 12 meses), Passivo LP (dívidas de longo prazo, acima de 12 meses) e Patrimônio Líquido (recursos próprios dos cooperados). Idealmente o PL deve representar mais de 40% do total."
                  subtitle="% do ativo total"
                  noData={!hasCapital}
                >
                  <ResponsiveContainer width="100%" height={H}>
                    <BarChart data={capitalData}>
                      {GRID}{XAXIS}{YAXPCT}
                      <Tooltip content={<PctTip />} cursor={CURSOR} />{LEG}
                      <Bar dataKey="Passivo CP"       stackId="a" fill={C.gold}  />
                      <Bar dataKey="Passivo LP"       stackId="a" fill={C.slate} />
                      <Bar dataKey="Patrim. Líquido"  stackId="a" fill={C.green} />
                      {/* Cinza — saldo não mapeado pelo extrator; só aparece quando existe */}
                      {capitalData.some(r => r['Não identificado'] != null) && (
                        <Bar dataKey="Não identificado" stackId="a" fill={C.muted} fillOpacity={0.35} radius={[4,4,0,0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* 4. Rentabilidade + 5. Ciclo Financeiro */}
              <div className="grid-2" style={{ marginBottom: 20 }}>
                <ChartCard
                  title="Rentabilidade"
                  info="ROE (Return on Equity): quanto o patrimônio dos cooperados rendeu no exercício. ROA (Return on Assets): quanto cada real investido em ativos gerou de resultado. Quanto maior, mais eficiente o uso dos recursos."
                  subtitle="ROE e ROA (%)"
                  noData={!hasRentab}
                >
                  <ResponsiveContainer width="100%" height={H}>
                    <LineChart data={rentabData}>
                      {GRID}{XAXIS}{YAXPCT}
                      <Tooltip content={<PctTip />} cursor={CURSOR} />{LEG}
                      <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="ROE" stroke={C.blue} strokeWidth={2} dot={dot(C.blue)} activeDot={adot(C.blue)} connectNulls />
                      <Line type="monotone" dataKey="ROA" stroke={C.gold} strokeWidth={2} dot={dot(C.gold)} activeDot={adot(C.gold)} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard
                  title="Ciclo Financeiro"
                  info="PME (Prazo Médio de Estoque): quantos dias o produto fica parado antes de ser vendido. PMR (Prazo Médio de Recebimento): quantos dias demora para receber dos clientes. A linha vermelha é o Ciclo Financeiro total = PME + PMR − PMP (tempo para pagar fornecedores). Quanto menor o ciclo, melhor."
                  subtitle="PME + PMR vs Ciclo (dias)"
                  noData={!hasCiclo}
                >
                  <ResponsiveContainer width="100%" height={H}>
                    <ComposedChart data={cicloData}>
                      {GRID}{XAXIS}{YAXDIAS}
                      <Tooltip content={<DiasTip />} cursor={CURSOR} />{LEG}
                      <Bar dataKey="PME" stackId="a" fill={C.blue} />
                      <Bar dataKey="PMR" stackId="a" fill={C.gold} radius={[4,4,0,0]} />
                      <Line type="monotone" dataKey="Ciclo Financeiro" stroke={C.slate} strokeWidth={2} dot={dot(C.slate)} activeDot={adot(C.slate)} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* 6. Modelo de Fleuriet */}
              <div style={{ marginBottom: 20 }}>
                <ChartCard
                  title="Modelo de Fleuriet"
                  info="Análise dinâmica do equilíbrio financeiro: CDG (Capital de Giro) = folga de longo prazo; NCG (Necessidade de Capital de Giro) = quanto as operações diárias consomem; Tesouraria = CDG − NCG. Quando Tesouraria > 0 e CDG > NCG, a cooperativa tem boa saúde financeira estrutural."
                  subtitle="Capital de Giro, NCG e Tesouraria"
                  noData={!hasFleuriet}
                >
                  <ResponsiveContainer width="100%" height={H}>
                    <ComposedChart data={fleurietData}>
                      {GRID}{XAXIS}{YAXBRL}
                      <Tooltip content={<BrlTip />} cursor={CURSOR} />{LEG}
                      <ReferenceLine y={0} stroke={C.muted} strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="Cap. de Giro" fill={C.blue} fillOpacity={0.12} stroke={C.blue} strokeWidth={2} connectNulls />
                      <Line type="monotone" dataKey="NCG"        stroke={C.navy}  strokeWidth={2} dot={dot(C.navy)} activeDot={adot(C.navy)} connectNulls />
                      <Line type="monotone" dataKey="Tesouraria" stroke={C.green} strokeWidth={2} dot={dot(C.green)} activeDot={adot(C.green)} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </>
          )}

          {/* 7. Cascata de Resultado (waterfall DSP) */}
          {hasCascata && (
            <div style={{ marginBottom: 20 }}>
              <ChartCard
                title="Cascata de Resultado"
                info="Mostra passo a passo como a Receita Bruta vira Sobras ou Perdas. Cada barra vermelha é uma dedução (impostos, devoluções, custos, despesas, encargos financeiros) que reduz o resultado. A barra verde final é o que sobra — ou o vermelho final é o que ficou negativo. Ideal para ver onde a cooperativa perde mais margem ao longo da demonstração de resultado."
                subtitle={`${periodLabel(latest)} — barras vermelhas = deduções, verde = sobras`}
              >
                <ResponsiveContainer width="100%" height={Math.max(180, cascataData.length * 50)}>
                  <BarChart data={cascataData} layout="vertical" barSize={24} barCategoryGap="30%">
                    <CartesianGrid stroke="var(--bd)" horizontal={false} strokeWidth={0.5} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: 'var(--t2)' }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => FMT.format(v)}
                    />
                    <YAxis
                      type="category" dataKey="name"
                      tick={{ fontSize: 12, fill: 'var(--t2)' }}
                      axisLine={false} tickLine={false}
                      width={148}
                    />
                    <Tooltip content={<WaterfallTip />} cursor={CURSOR} />
                    {/* Base transparente — desloca a barra colorida para a posição correta */}
                    <Bar dataKey="base" stackId="wf" fill="transparent" legendType="none" isAnimationActive={false} />
                    {/* Barra colorida: azul=total, verde=acréscimo, vermelho=dedução, verde/vermelho=resultado final */}
                    <Bar dataKey="bar" stackId="wf" radius={[0,4,4,0]} isAnimationActive={false}>
                      {cascataData.map((d, i) => {
                        let fill;
                        if (d.isLast)        fill = d.delta >= 0 ? C.green : C.red;
                        else if (d.isTotal)  fill = C.navy;
                        else if (d.delta >= 0) fill = C.green;
                        else                 fill = C.red;
                        return <Cell key={i} fill={fill} />;
                      })}
                      {/* Valor direto na ponta de cada barra — elimina dependência do tooltip */}
                      <LabelList
                        dataKey="bar"
                        position="right"
                        formatter={v => FMT.format(v)}
                        style={{ fontSize: 11, fill: 'var(--t2)', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* 8+9. Composição do Ativo + Estrutura de Financiamento */}
          {(ativoData.length > 0 || passivoData.length > 0) && (
            <div className="grid-2" style={{ marginBottom: 20 }}>
              {ativoData.length > 0 && (
                <ChartCard
                  title="Composição do Ativo"
                  info="Mostra como os bens e direitos da cooperativa estão distribuídos: Circulante (caixa, estoques, contas a receber — ativos que viram dinheiro em até 12 meses) e Não Circulante (imóveis, máquinas, investimentos de longo prazo). Cooperativas mais industrializadas tendem a ter maior proporção de ativos fixos (não circulante)."
                  subtitle={periodLabel(latest)}
                >
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={ativoData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={38} paddingAngle={2} stroke="none">
                        {ativoData.map((_, i) => <Cell key={i} fill={PIE_ATIVO[i % PIE_ATIVO.length]} />)}
                      </Pie>
                      <Tooltip content={<BrlTip />} cursor={CURSOR} />
                    </PieChart>
                  </ResponsiveContainer>
                  <PieLegend data={ativoData} colors={PIE_ATIVO} />
                </ChartCard>
              )}
              {passivoData.length > 0 && (
                <ChartCard
                  title="Estrutura de Financiamento"
                  info="Mostra como os ativos da cooperativa são financiados: Passivo CP (dívidas que vencem em até 12 meses), Passivo LP (financiamentos e empréstimos de longo prazo) e Patrimônio Líquido (recursos próprios dos cooperados). Quanto maior a fatia do PL, mais independente financeiramente é a cooperativa."
                  subtitle={periodLabel(latest)}
                >
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={passivoData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={38} paddingAngle={2} stroke="none">
                        {passivoData.map((_, i) => <Cell key={i} fill={PIE_PASSIVO[i % PIE_PASSIVO.length]} />)}
                      </Pie>
                      <Tooltip content={<BrlTip />} cursor={CURSOR} />
                    </PieChart>
                  </ResponsiveContainer>
                  <PieLegend data={passivoData} colors={PIE_PASSIVO} />
                </ChartCard>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Histórico de análises ─────────────────────────────────────── */}
      {!hideHistory && (
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--t0)', margin: 0 }}>Histórico de análises</h3>
          <span style={{ fontSize: 13, color: 'var(--t2)' }}>{analyses.length} {analyses.length === 1 ? 'análise' : 'análises'}</span>
        </div>
        {!sorted.length ? (
          <EmptyNote>Nenhum período selecionado.</EmptyNote>
        ) : (
          <div style={{ padding: '0 8px' }}>
            {[...analyses]
              .sort((a, b) => b.year - a.year || new Date(b.created_at) - new Date(a.created_at))
              .map(a => (
                <AnalysisRow key={a.id} analysis={a} hideClient onDelete={deleteAnalysis} />
              ))}
          </div>
        )}
      </div>
      )}

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
      {editModal && (
        <ClientFormModal
          client={client}
          onClose={() => setEditModal(false)}
          onSaved={c => { setClient(c); setEditModal(false); }}
        />
      )}
    </div>
  );
}
