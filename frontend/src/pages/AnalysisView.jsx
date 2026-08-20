import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile } from '../lib/api.js';
import { useBackNavigate } from '../lib/useBackNavigate.js';
import { useAuth } from '../lib/auth.jsx';
import { useAccountInfo } from '../lib/accountInfo.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import InfoTooltip from '../components/InfoTooltip.jsx';
import { periodLabel, periodShort, periodSlug } from '../lib/period.js';
import { INDICATOR_HELP, PILAR_HELP } from '../lib/indicatorHelp.js';
import { SIGNING_ENABLED } from '../lib/constants.js';

function AutoTextarea({ value, onChange, placeholder }) {
  const ref = useRef(null);
  const resize = useCallback(() => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px'; } }, []);
  useEffect(() => { resize(); }, [value, resize]);
  return <textarea ref={ref} value={value} onChange={e => { onChange(e); resize(); }} placeholder={placeholder}
    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg2)', color: 'var(--t0)', fontSize: 14, lineHeight: 1.7, fontFamily: 'inherit', resize: 'none', outline: 'none', overflow: 'hidden' }} />;
}

const FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const brl = v => v != null ? FMT.format(v) : '—';
const fmtT = v => v != null ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—';
const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
const num = v => v != null ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const days = v => v != null ? Math.round(v) + 'd' : '—';
const f = (v, fn) => v == null ? '—' : fn(v);
const avPct = (v, ref) => (!ref || v == null) ? '—' : ((v / ref) * 100).toFixed(1) + '%';

const PILARES = [
  { key: 'liquidez', label: 'Liquidez e Eficiência', icon: 'ti-droplet', items: [
    { k: 'liquidez_corrente', label: 'Liquidez Corrente', fn: num },
    { k: 'liquidez_geral', label: 'Liquidez Geral', fn: num },
    { k: 'liquidez_seca', label: 'Liquidez Seca', fn: num },
    { k: 'imobilizacao_recursos_proprios', label: 'Imob. Rec. Próprios', fn: pct },
    { k: 'ebitda', label: 'EBITDA', fn: brl },
    { k: 'inadimplencia_total_pct', label: 'Inadimplência s/ Créditos', fn: pct },
  ]},
  { key: 'rentabilidade', label: 'Rentabilidade', icon: 'ti-coin', items: [
    { k: 'rentabilidade_pl_pct', label: 'ROE', fn: pct },
    { k: 'rentabilidade_ativos_pct', label: 'ROA', fn: pct },
    { k: 'rentabilidade_ingressos_pct', label: 'Margem Líquida', fn: pct },
  ]},
  { key: 'endividamento', label: 'Endividamento', icon: 'ti-trending-up', items: [
    { k: 'endividamento_total_pct', label: 'Endividamento Total', fn: pct },
    { k: 'perfil_endividamento_pct', label: 'Perfil (Curto Prazo)', fn: pct },
    { k: 'nivel_alavancagem_ebitda', label: 'Dívida/EBITDA', fn: num },
  ]},
  { key: 'capacidade_operacional', label: 'Capacidade Operacional', icon: 'ti-refresh', items: [
    { k: 'pmr', label: 'PMR (Recebimento)', fn: days },
    { k: 'pme', label: 'PME (Estoques)', fn: days },
    { k: 'pmp', label: 'PMP (Pagamento)', fn: days },
    { k: 'ciclo_financeiro', label: 'Ciclo Financeiro', fn: days },
    { k: 'giro_ativo', label: 'Giro do Ativo', fn: num },
  ]},
  { key: 'tesouraria', label: 'Tesouraria', icon: 'ti-building-bank', items: [
    { k: 'capital_giro', label: 'Capital de Giro', fn: brl },
    { k: 'ncg', label: 'NCG', fn: brl },
    { k: 'tesouraria', label: 'Saldo de Tesouraria', fn: brl },
    { k: 'independencia_financeira', label: 'Independência Fin.', fn: num },
  ]},
];

// Para cada indicador, se subir é bom ou ruim. Sem isso a variação viraria
// apenas "mudou", e pintar de verde um endividamento que cresceu seria pior do
// que não mostrar nada. null = neutro (só informa a variação, sem julgar).
const BETTER_WHEN = {
  liquidez_corrente: 'up', liquidez_geral: 'up', liquidez_seca: 'up',
  garantia_capital_terceiros: 'up', imobilizacao_recursos_proprios: 'down',
  ebitda: 'up', inadimplencia_total_pct: 'down',
  rentabilidade_pl_pct: 'up', rentabilidade_ativos_pct: 'up',
  rentabilidade_ingressos_pct: 'up', rentabilidade_capital_integralizado_pct: 'up',
  endividamento_total_pct: 'down', perfil_endividamento_pct: 'down',
  nivel_alavancagem_ebitda: 'down', endividamento_operacional_pct: 'down',
  endividamento_financeiro_total_pct: 'down', endividamento_financeiro_lp_pct: 'down',
  endividamento_lp_pct: null,
  pmr: 'down', pme: 'down', pmp: 'up', ciclo_operacional: 'down',
  ciclo_financeiro: 'down', giro_ativo: 'up', giro_permanente: 'up',
  capital_giro: 'up', ncg: 'down', tesouraria: 'up',
  independencia_financeira: 'up', indice_autofinanciamento: 'up',
};

// Variação vs. o período anterior. Mostra a diferença em pontos percentuais
// quando o indicador já é um percentual, e variação relativa nos demais —
// "de 1,20 para 1,32" é mais legível como +10% do que como +0,12.
function Delta({ k, atual, anterior, periodo }) {
  if (atual == null || anterior == null || anterior === 0) return null;
  const isPct = k.endsWith('_pct');
  const diff = atual - anterior;
  if (Math.abs(diff) < 1e-9) {
    return <span style={{ fontSize: 11, color: 'var(--t3)' }}>sem variação vs {periodo}</span>;
  }
  const up = diff > 0;
  const dir = BETTER_WHEN[k];
  const color = dir == null ? 'var(--t2)'
    : (up === (dir === 'up')) ? 'var(--green-t)' : 'var(--red-t)';
  const texto = isPct
    ? `${up ? '+' : '−'}${Math.abs(diff * 100).toFixed(1)} p.p.`
    : `${up ? '+' : '−'}${Math.abs((diff / Math.abs(anterior)) * 100).toFixed(1)}%`;
  return (
    <span style={{ fontSize: 11, color, whiteSpace: 'nowrap' }} title={`Período anterior: ${periodo}`}>
      <i className={`ti ti-arrow-${up ? 'up' : 'down'}-right`} style={{ fontSize: 12, verticalAlign: 'middle' }} />
      {' '}{texto} <span style={{ color: 'var(--t3)' }}>vs {periodo}</span>
    </span>
  );
}

const SCORECARD = [
  { key: 'liquidez', label: 'Liquidez', icon: 'ti-droplet' },
  { key: 'endividamento', label: 'Endividamento', icon: 'ti-trending-up' },
  { key: 'rentabilidade', label: 'Rentabilidade', icon: 'ti-coin' },
  { key: 'capacidade_operacional', label: 'Cap. Operacional', icon: 'ti-refresh' },
  { key: 'tesouraria', label: 'Tesouraria', icon: 'ti-building-bank' },
];

// ── Textos de tooltip para indicadores, BP e DSP ────────────────────────────
const BP_TOOLTIP = {
  ativo_circulante: 'Bens e direitos conversíveis em caixa em até 12 meses: disponibilidades, recebíveis, estoques, etc.',
  disponibilidades: 'Caixa, bancos e aplicações de liquidez imediata.',
  clientes: 'Valores a receber de clientes e cooperados pelas vendas ou serviços prestados.',
  estoques: 'Mercadorias, produtos e insumos disponíveis para venda ou uso na produção.',
  ativo_nao_circulante: 'Bens e direitos de longo prazo: imóveis, máquinas, equipamentos, investimentos estratégicos, etc.',
  ativo_permanente: 'Imóveis, veículos, máquinas e outros bens utilizados na atividade por mais de 12 meses.',
  total_ativo: 'Soma de todos os bens e direitos da cooperativa — total de recursos disponíveis.',
  passivo_circulante: 'Obrigações que vencem em até 12 meses: fornecedores, empréstimos de curto prazo, tributos, etc.',
  passivo_nao_circulante: 'Dívidas e obrigações com vencimento após 12 meses: financiamentos de longo prazo, provisões, etc.',
  patrimonio_liquido: 'Recursos dos próprios sócios/cooperados: capital social, reservas e sobras acumuladas.',
  total_passivo_pl: 'Soma de todas as fontes de recursos (dívidas + capital próprio). Deve ser igual ao Total do Ativo.',
};

const DSP_TOOLTIP = {
  ingressos: 'Valor total das vendas ou serviços prestados antes de qualquer dedução (Receita Bruta).',
  receita_liquida: 'Receita após deduções como impostos sobre vendas, devoluções e abatimentos. Base de cálculo para as margens.',
  cmv: 'Custo das Mercadorias Vendidas ou da Mão de Obra — gastos diretamente ligados ao produto ou serviço entregue.',
  lucro_bruto: 'Receita Líquida menos o CMV — margem antes das despesas operacionais.',
  despesas_operacionais: 'Gastos com administração, vendas e outras despesas necessárias para manter a operação.',
  ebitda: 'Resultado operacional antes de juros, impostos e depreciação — mede a geração de caixa da operação pura.',
  resultado_antes_ir: 'Resultado da cooperativa antes da incidência do Imposto de Renda e Contribuição Social.',
  sobras: 'Resultado final do período. Positivo (sobras) indica eficiência; negativo (perdas) indica que os gastos superaram as receitas.',
};

function scoreGrade(key, ind) {
  const d = ind?.[key] || {};
  const r = { liquidez: () => { const v = d.liquidez_corrente; return v == null ? null : v >= 1.5 ? ['green','Boa'] : v >= 1 ? ['yellow','Regular'] : ['red','Crítica']; }, endividamento: () => { const v = d.endividamento_total_pct; return v == null ? null : v <= 0.4 ? ['green','Baixo'] : v <= 0.6 ? ['yellow','Moderado'] : ['red','Elevado']; }, rentabilidade: () => { const v = d.rentabilidade_pl_pct; return v == null ? null : v >= 0.10 ? ['green','Boa'] : v >= 0.03 ? ['yellow','Regular'] : ['red','Baixa']; }, capacidade_operacional: () => { const v = d.ciclo_operacional; return v == null ? null : v <= 60 ? ['green','Boa'] : v <= 120 ? ['yellow','Regular'] : ['red','Longa']; }, tesouraria: () => { const v = d.tesouraria; return v == null ? null : v > 0 ? ['green','Positiva'] : v > -50000 ? ['yellow','Neutra'] : ['red','Negativa']; } };
  return (r[key] || (() => null))();
}

// Espelha normalizeRecomendacao do backend (lib/narrative.js). A IA às vezes
// devolve a recomendação como objeto em vez de string; narrativas salvas antes
// da normalização no servidor ainda têm esse formato no banco, e sem isto a
// tela quebra inteira num `rec.indexOf is not a function`.
function recToText(rec) {
  if (typeof rec === 'string') return rec;
  if (rec && typeof rec === 'object') {
    const titulo = rec.titulo ?? rec.title ?? rec.acao ?? rec.nome ?? '';
    const desc   = rec.descricao ?? rec.description ?? rec.detalhe ?? rec.texto ?? rec.acao_necessaria ?? '';
    if (titulo && desc) return `${titulo}: ${desc}`;
    const unico = titulo || desc;
    if (unico) return String(unico);
    return Object.values(rec).filter(v => typeof v === 'string').join(': ') || JSON.stringify(rec);
  }
  return String(rec ?? '');
}

function indColor(pk, k, v) {
  if (v == null) return '';
  const r = { liquidez: () => ['liquidez_corrente','liquidez_geral','liquidez_seca'].includes(k) ? (v >= 1 ? 'green' : v >= 0.7 ? 'yellow' : 'red') : (v > 0 ? 'green' : 'red'), rentabilidade: () => v >= 0.1 ? 'green' : v >= 0.03 ? 'yellow' : 'red', endividamento: () => k === 'nivel_alavancagem_ebitda' ? (v <= 2 ? 'green' : v <= 4 ? 'yellow' : 'red') : (v <= 0.4 ? 'green' : v <= 0.6 ? 'yellow' : 'red'), capacidade_operacional: () => k === 'pmp' ? (v >= 30 ? 'green' : 'yellow') : (['pme','pmr','ciclo_financeiro','ciclo_operacional'].includes(k) ? (v <= 60 ? 'green' : v <= 120 ? 'yellow' : 'red') : (v >= 1 ? 'green' : 'yellow')), tesouraria: () => k === 'independencia_financeira' ? (v >= 0.5 ? 'green' : v >= 0.3 ? 'yellow' : 'red') : (v > 0 ? 'green' : v > -50000 ? 'yellow' : 'red') };
  return (r[pk] || (() => ''))();
}

// Percorre todos os pilares e devolve os indicadores em estado crítico e a
// contagem dos que não puderam ser calculados. Serve para responder, logo no
// topo, "onde está o problema?" e "dá pra confiar nestes números?" — hoje as
// duas respostas exigiam varrer a página inteira.
// Indicadores cujo valor foi levado à base anual quando o período é menor que
// o ano (ver calculator.js). São os que dividem um saldo do balanço por um
// valor da DSP — o número exibido é o ritmo do período projetado para 12 meses,
// não o realizado. Marcá-los evita que alguém leia "ROE 33%" de um mês como
// resultado apurado.
const ANUALIZADOS = new Set([
  'nivel_alavancagem_ebitda', 'rentabilidade_capital_integralizado_pct',
  'rentabilidade_pl_pct', 'rentabilidade_ativos_pct',
  'pme', 'pmr', 'pmp', 'ciclo_operacional', 'ciclo_financeiro',
  'giro_ativo', 'giro_permanente',
  'capital_giro_faturamento_pct', 'ncg_faturamento_pct', 'tesouraria_faturamento_pct',
]);

function auditIndicadores(indicators, pilares) {
  const criticos = [];
  let semDados = 0, total = 0;
  for (const pilar of pilares) {
    const data = indicators?.[pilar.key] || {};
    for (const item of pilar.items) {
      total++;
      const v = data[item.k];
      if (v == null) { semDados++; continue; }
      if (indColor(pilar.key, item.k, v) === 'red') {
        criticos.push({ ...item, pilarKey: pilar.key, valor: v });
      }
    }
  }
  return { criticos, semDados, total };
}

const GC = { green: { bg: 'rgba(20,135,78,.08)', bd: 'rgba(20,135,78,.2)', t: 'var(--green-t)' }, yellow: { bg: 'rgba(235,136,31,.08)', bd: 'rgba(235,136,31,.2)', t: 'var(--yellow-t)' }, red: { bg: 'rgba(208,29,33,.08)', bd: 'rgba(208,29,33,.2)', t: 'var(--red-t)' }, '': { bg: 'var(--bg2)', bd: 'var(--bd)', t: 'var(--t3)' } };

const REPORT_SECTIONS = [
  { key: 'sumario', title: '1. Sumário Executivo', heading: true },
  { key: '_h_pilares', title: '2. Análise por Pilares', heading: true, divider: true },
  { key: 'liquidez', title: 'A. Liquidez e Eficiência Econômica' },
  { key: 'rentabilidade', title: 'B. Rentabilidade' },
  { key: 'endividamento', title: 'C. Endividamento' },
  { key: 'capacidade_operacional', title: 'D. Capacidade Operacional' },
  { key: 'tesouraria', title: 'E. Tesouraria e Capital de Giro' },
  { key: '_h_swot', title: '3. Diagnóstico — SWOT Financeiro', heading: true, divider: true },
  { key: 'forcas', title: 'Forças' },
  { key: 'fraquezas', title: 'Fraquezas' },
  { key: 'riscos', title: 'Riscos' },
];

const TABS = [
  { k: 'geral', label: 'Visão Geral', icon: 'ti-eye' },
  { k: 'relatorio', label: 'Relatório', icon: 'ti-file-text' },
  { k: 'indicadores', label: 'Indicadores', icon: 'ti-chart-dots-3' },
  { k: 'bp', label: 'Balanço Patrimonial', icon: 'ti-scale' },
  { k: 'dsp', label: 'DSP', icon: 'ti-receipt' },
];

export default function AnalysisView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [reportErr, setReportErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [tab, setTab] = useState('geral');
  const [narrative, setNarrative] = useState(null);
  const [genNarrative, setGenNarrative] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [actionErr, setActionErr] = useState('');
  // Análise imediatamente anterior do mesmo cliente — usada para mostrar a
  // variação de cada indicador. Um retrato isolado não responde "melhorou ou
  // piorou?", que é a primeira pergunta de quem lê o resultado.
  const [prev, setPrev] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const { isSingleEntity } = useAuth();
  const { accountInfo } = useAccountInfo();
  const goBack = useBackNavigate(analysis ? `/app/clients/${analysis.client_id}` : '/app/clients');

  useEffect(() => {
    api.get(`/analyses/${id}`)
      .then(d => { setAnalysis(d.analysis); if (d.analysis.narrative) setNarrative(d.analysis.narrative); })
      .catch(() => navigate('/app/clients', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]);

  // Fecha o menu de ações ao clicar fora ou apertar Esc — sem isso ele fica
  // aberto atrás de qualquer outra interação da página.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  useEffect(() => {
    if (!analysis?.client_id) { setPrev(null); return; }
    let cancelled = false;
    api.get(`/analyses?clientId=${analysis.client_id}&limit=50`)
      .then(r => {
        // "Anterior" = a mais recente entre as que vêm antes desta na linha do
        // tempo (ano e, no mesmo ano, data de criação).
        const isBefore = a => a.year < analysis.year
          || (a.year === analysis.year && new Date(a.created_at) < new Date(analysis.created_at));
        const older = (r.analyses || [])
          .filter(a => a.id !== analysis.id && isBefore(a))
          .sort((a, b) => b.year - a.year || new Date(b.created_at) - new Date(a.created_at))[0];
        if (!older || cancelled) return null;
        return api.get(`/analyses/${older.id}`);
      })
      .then(d => { if (d && !cancelled) setPrev(d.analysis); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [analysis?.id, analysis?.client_id]);

  async function generateNarrativeAI() {
    setGenNarrative(true); setReportErr('');
    try { const r = await api.post(`/analyses/${id}/narrative`); setNarrative(r.narrative); }
    catch (e) { setReportErr(e.message || 'Erro ao gerar relatório.'); }
    finally { setGenNarrative(false); }
  }

  async function saveNarrative() {
    setSaving(true);
    try { await api.patch(`/analyses/${id}/narrative`, { narrative }); setEditMode(false); }
    catch (e) { setActionErr(e.message || 'Erro ao salvar narrativa.'); }
    finally { setSaving(false); }
  }

  async function downloadReport() {
    setReporting(true); setReportErr('');
    try {
      const blob = await downloadFile(`/analyses/${id}/report`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `relatorio_${analysis.client_name?.replace(/[^a-zA-Z0-9]/g, '_')}_${periodSlug(analysis)}.docx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setReportErr(e.message || 'Erro ao baixar.'); }
    finally { setReporting(false); }
  }

  async function downloadExcel() {
    setExporting(true); setReportErr('');
    try {
      const blob = await downloadFile(`/analyses/${id}/excel`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `balanco_${analysis.client_name?.replace(/[^a-zA-Z0-9]/g, '_')}_${periodSlug(analysis)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setReportErr(e.message || 'Erro ao baixar.'); }
    finally { setExporting(false); }
  }

  async function doDelete() {
    try { await api.del(`/analyses/${id}`); navigate(`/app/clients/${analysis.client_id}`, { replace: true }); }
    catch (e) { setActionErr(e.message || 'Erro ao excluir análise.'); }
  }

  async function signAnalysis() {
    setSigning(true);
    try {
      const r = await api.post(`/analyses/${id}/sign`);
      setAnalysis(a => ({ ...a, status: 'signed', signed_at: r.signed_at, signed_by_name: r.signed_by_name }));
    } catch (e) { setActionErr(e.message || 'Erro ao assinar.'); }
    finally { setSigning(false); }
  }

  async function unsignAnalysis() {
    setSigning(true);
    try {
      await api.del(`/analyses/${id}/sign`);
      setAnalysis(a => ({ ...a, status: 'editable', signed_at: null, signed_by_name: null }));
    } catch (e) { setActionErr(e.message || 'Erro ao revogar assinatura.'); }
    finally { setSigning(false); }
  }

  function updateNarrative(key, val) { setNarrative(n => ({ ...n, [key]: val })); }

  if (loading || !analysis) return null;

  const { bp = {}, dsp = {}, indicators = {} } = analysis;
  // Em conta de entidade única o "cliente" é a própria conta. O client_name foi
  // gravado junto da análise e não acompanha uma renomeação feita em Ajustes —
  // o accountInfo é a fonte viva do nome da empresa.
  const displayName = (isSingleEntity && accountInfo?.companyName) || analysis.client_name;
  const sobras = dsp?.sobras_perdas;
  const totalAtivo = bp.total_ativo || 1;
  const ebitda = indicators?.liquidez?.ebitda;
  const receitaRef = dsp.receita_liquida ?? dsp.ingressos ?? 1;
  const ancTotal = (bp.ativo_realizavel_lp ?? 0) + (bp.ativo_permanente ?? 0) || (bp.total_ativo && bp.ativo_circulante ? bp.total_ativo - bp.ativo_circulante : null);

  return (
    <div className="page-body" style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <button className="back" onClick={goBack} style={{ marginBottom: 16 }}>
        <i className="ti ti-arrow-left"></i> Voltar
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          {/* O título identifica ESTE documento (que período, de quem); o
              subtítulo diz que tipo de documento é. O contrário deixava todas
              as análises com o mesmo título e a identidade em letra miúda. */}
          <p style={{ fontSize: 14, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>Análise financeira</span>
            {!analysis.client_active && <span className="pill pill-y">Arquivado</span>}
            {SIGNING_ENABLED && (
              <span className={`pill ${analysis.status === 'signed' ? 'pill-g' : 'pill-b'}`}>
                {analysis.status === 'signed' ? 'Assinada' : 'Editável'}
              </span>
            )}
          </p>
          <h1 className="page-h1">
            {periodShort(analysis)} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>•</span> {displayName}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          {SIGNING_ENABLED && (analysis.status === 'signed' ? (
            <button className="btn" onClick={unsignAnalysis} disabled={signing}>
              {signing ? <><i className="ti ti-loader"></i> Revogando…</> : <><i className="ti ti-signature-off"></i> Revogar assinatura</>}
            </button>
          ) : (
            <button className="btn" onClick={signAnalysis} disabled={signing}>
              {signing ? <><i className="ti ti-loader"></i> Assinando…</> : <><i className="ti ti-signature"></i> Assinar</>}
            </button>
          ))}
          <button className="btn" onClick={downloadExcel} disabled={exporting}>
            {exporting ? <><i className="ti ti-loader"></i> Gerando…</> : <><i className="ti ti-file-spreadsheet"></i> Baixar Excel</>}
          </button>
          <button className="btn btn-p" onClick={downloadReport} disabled={reporting}>
            {reporting ? <><i className="ti ti-loader"></i> Gerando…</> : <><i className="ti ti-file-download"></i> Baixar Relatório</>}
          </button>
          {/* Ações secundárias saem da fileira principal: "Excluir" encostado
              em "Baixar Relatório" é vizinhança perigosa — um clique errado é
              irreversível. */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button className="btn" aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={() => setMenuOpen(o => !o)}>
              <i className="ti ti-dots"></i>
            </button>
            {menuOpen && (
              <div role="menu" style={{
                position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
                background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 10,
                boxShadow: '0 12px 32px rgba(0,0,0,.14)', minWidth: 210, overflow: 'hidden',
              }}>
                <button role="menuitem" className="an-menu-item" onClick={() => {
                  setMenuOpen(false);
                  const url = window.location.href;
                  const text = `Análise financeira - ${displayName} (${periodShort(analysis)})`;
                  if (navigator.share) { navigator.share({ title: text, url }); }
                  else { navigator.clipboard.writeText(url).then(() => alert('Link copiado!')); }
                }}>
                  <i className="ti ti-share"></i> Compartilhar
                </button>
                <button role="menuitem" className="an-menu-item an-menu-item-danger" onClick={() => {
                  setMenuOpen(false);
                  setConfirm({ title: 'Excluir análise?', message: `Análise de ${periodShort(analysis)} será excluída.`, confirmLabel: 'Excluir', danger: true, onConfirm: doDelete });
                }}>
                  <i className="ti ti-trash"></i> Excluir análise
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {SIGNING_ENABLED && analysis.status === 'signed' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px',
          background: 'var(--green-dim)', border: '1px solid var(--green-t)', borderRadius: 8, fontSize: 13, color: 'var(--green-t)',
        }}>
          <i className="ti ti-signature" style={{ fontSize: 16 }}></i>
          Assinada por <strong>{analysis.signed_by_name || 'alguém do escritório'}</strong>
          {analysis.signed_at && ` em ${new Date(analysis.signed_at.includes('T') ? analysis.signed_at : `${analysis.signed_at.replace(' ', 'T')}Z`).toLocaleString('pt-BR')}`}
          — edição bloqueada. Revogue a assinatura para editar.
        </div>
      )}

      {reportErr && <div className="err-banner" style={{ marginBottom: 16 }}>{reportErr}</div>}
      {actionErr && <div className="err-banner" style={{ marginBottom: 16 }}>{actionErr}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
        {TABS.map(({ k, label, icon }) => (
          <button key={k} className={`nav-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            <i className={`ti ${icon}`} style={{ fontSize: 15 }}></i> {label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: VISÃO GERAL ═══ */}
      {tab === 'geral' && (() => {
        const INDICATOR_META = {
          liquidez_corrente: { benchmark: '> 1,20', desc: (v) => v >= 1.2 ? `R$ ${v.toFixed(2).replace('.',',')} disponível para cada R$ 1,00 de dívida no curto prazo.` : `Abaixo de 1,20 — capacidade limitada de cobrir obrigações de curto prazo.` },
          liquidez_geral: { benchmark: '≥ 1,00', desc: (v) => v >= 1 ? 'Ativos totais cobrem todas as obrigações.' : 'Abaixo de 1,00 — ativos totais não cobrem todas as obrigações.' },
          liquidez_seca: { benchmark: '≥ 1,00', desc: (v) => v >= 1 ? 'Boa capacidade sem depender de estoques.' : 'Dependência de venda de estoques para honrar dívidas.' },
          imobilizacao_recursos_proprios: { benchmark: '< 80%', desc: (v) => v < 0.8 ? 'Nível saudável de imobilização.' : 'Imobilizado supera o Patrimônio Líquido; depende de capital de terceiros.' },
          ebitda: { benchmark: '> 0', desc: (v) => v > 0 ? 'Geração de caixa operacional positiva.' : 'EBITDA negativo — operação não gera caixa.' },
          rentabilidade_pl_pct: { benchmark: '≥ Selic', desc: (v) => v >= 0.1 ? 'Retorno atrativo para os sócios.' : v >= 0.03 ? 'Retorno positivo, mas baixo frente ao custo de oportunidade.' : 'Retorno insuficiente para os sócios.' },
          rentabilidade_ativos_pct: { benchmark: '> 5%', desc: (v) => v >= 0.05 ? 'Boa eficiência na utilização dos ativos.' : 'Baixa eficiência na utilização dos ativos para gerar lucro.' },
          rentabilidade_ingressos_pct: { benchmark: '> 5%', desc: (v) => v >= 0.05 ? 'Margem de sobras saudável.' : 'Margem apertada sobre os ingressos.' },
          endividamento_total_pct: { benchmark: '< 50%', desc: (v) => v <= 0.5 ? 'Nível de endividamento controlado.' : 'Mais da metade dos ativos financiados por terceiros.' },
          perfil_endividamento_pct: { benchmark: '< 50%', desc: (v) => v <= 0.5 ? 'Dívida bem distribuída entre curto e longo prazo.' : 'Grande parcela da dívida concentrada no curto prazo.' },
          nivel_alavancagem_ebitda: { benchmark: '< 3x', desc: (v) => v <= 3 ? 'Alavancagem sustentável.' : 'Dívida elevada em relação à geração de caixa.' },
          pmr: { benchmark: '< 90 dias', desc: (v) => v <= 90 ? 'Prazo de recebimento saudável.' : v <= 180 ? 'Recebimento lento — avaliar política de crédito.' : 'Prazo de recebimento excessivo.' },
          pme: { benchmark: '< 60 dias', desc: (v) => v <= 60 ? 'Giro de estoques adequado.' : 'Estoques com giro lento.' },
          pmp: { benchmark: '> 30 dias', desc: (v) => v >= 30 ? 'Prazo de pagamento adequado.' : 'Prazo curto de pagamento — pressão sobre o caixa.' },
          ciclo_financeiro: { benchmark: '< 60 dias', desc: (v) => v <= 60 ? 'Ciclo financeiro eficiente.' : v <= 120 ? 'Ciclo financeiro longo — capital preso na operação.' : 'Ciclo financeiro crítico.' },
          giro_ativo: { benchmark: '> 0,5', desc: (v) => v >= 0.5 ? 'Boa utilização dos ativos para gerar receita.' : 'Receita baixa em relação ao volume de ativos investidos.' },
          capital_giro: { benchmark: '> 0', desc: (v) => v > 0 ? 'Capital de giro positivo.' : 'Capital de giro negativo — risco de liquidez.' },
          ncg: { benchmark: 'Contextual', desc: (v) => v > 0 ? 'Necessidade de capital operacional.' : 'Gera caixa na operação.' },
          tesouraria: { benchmark: '> 0', desc: (v) => v > 0 ? 'Fôlego financeiro disponível.' : 'Saldo de tesouraria negativo — dependência de financiamento.' },
          independencia_financeira: { benchmark: '> 0,5', desc: (v) => v >= 0.5 ? 'Boa independência financeira.' : 'Dependência de capital de terceiros.' },
        };

        const PILAR_META = {
          liquidez: { title: 'Liquidez e Eficiência Econômica', desc: 'Capacidade da empresa de honrar compromissos de curto e longo prazo.' },
          rentabilidade: { title: 'Rentabilidade', desc: 'Retorno gerado sobre patrimônio e ativos investidos.' },
          endividamento: { title: 'Endividamento', desc: 'Estrutura e perfil das dívidas da companhia.' },
          capacidade_operacional: { title: 'Capacidade Operacional', desc: 'Eficiência do ciclo de vendas, recebimento e giro.' },
          tesouraria: { title: 'Tesouraria e Capital de Giro', desc: 'Saldo financeiro disponível e necessidade de capital operacional.' },
        };

        const statusLabel = (color) => ({ green: 'Bom', yellow: 'Atenção', red: 'Crítico', '': 'Sem dados' }[color] || 'Sem dados');
        const statusDot = (color) => ({ green: 'var(--green-t)', yellow: 'var(--yellow-t)', red: 'var(--red-t)', '': 'var(--t3)' }[color] || 'var(--t3)');

        const splitBullets = (raw) => {
          // A IA pode devolver lista ou objeto onde o prompt pediu um
          // parágrafo — coage antes de usar .split().
          const text = Array.isArray(raw) ? raw.map(recToText).join(' ')
            : (raw && typeof raw === 'object') ? recToText(raw) : raw;
          if (!text) return [];
          return String(text).split(/\.\s+|\n/).map(s => s.trim()).filter(s => s.length > 0).map(s => s.endsWith('.') ? s : s + '.');
        };

        const lcVal = indicators?.liquidez?.liquidez_corrente;
        const lcColor = indColor('liquidez', 'liquidez_corrente', lcVal);
        const etVal = indicators?.endividamento?.endividamento_total_pct;
        const etColor = indColor('endividamento', 'endividamento_total_pct', etVal);
        const cfVal = indicators?.capacidade_operacional?.ciclo_financeiro;
        const pmrVal = indicators?.capacidade_operacional?.pmr;
        const thirdVal = cfVal != null ? cfVal : pmrVal;
        const thirdKey = cfVal != null ? 'ciclo_financeiro' : 'pmr';
        const thirdLabel = cfVal != null ? 'Ciclo Financeiro' : 'PMR';
        const thirdFormatted = cfVal != null ? days(cfVal) : days(pmrVal);
        const thirdHelp = cfVal != null ? INDICATOR_HELP.ciclo_financeiro : INDICATOR_HELP.pmr;
        const thirdColor = indColor('capacidade_operacional', thirdKey, thirdVal);

        const audit = auditIndicadores(indicators, PILARES);
        // Confiança vem do extractor: 1.0 no caminho do modelo padrão (leitura
        // direta de células) e o valor estimado pela IA nos demais. Abaixo de
        // 0.9 vale avisar — os números são editáveis, mas ninguém corrige o
        // que não sabe que está torto.
        const conf = analysis.confidence;
        const confBaixa = conf != null && conf < 0.9;

        return <>
        {/* ── Qualidade da extração ── */}
        {/* Linha de texto, sem cartão: é um dado de rodapé sobre a extração,
            não um alerta. Emoldurar dava a ele mais peso visual que os próprios
            indicadores logo abaixo. */}
        {(conf != null || audit.semDados > 0 || analysis.notes) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
              {conf != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--t2)' }}>
                  <i className={`ti ${confBaixa ? 'ti-alert-triangle' : 'ti-circle-check'}`}
                     style={{ fontSize: 15, color: confBaixa ? 'var(--yellow-t)' : 'var(--green-t)' }} />
                  <strong style={{ color: 'var(--t0)', fontWeight: 600 }}>{Math.round(conf * 100)}%</strong>
                  de confiança na extração
                </span>
              )}
              {audit.semDados > 0 && (
                <>
                  <span style={{ color: 'var(--bd2)' }}>·</span>
                  <span style={{ color: 'var(--t2)' }}>
                    {audit.semDados} de {audit.total} indicadores sem dados no documento
                  </span>
                </>
              )}
              {analysis.notes && (
                <button
                  onClick={() => setNotesOpen(o => !o)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12,
                    color: 'var(--t3)', display: 'inline-flex', alignItems: 'center', gap: 3,
                    textDecoration: 'underline', textUnderlineOffset: 3,
                  }}
                >
                  {notesOpen ? 'ocultar' : 'como foi extraído'}
                </button>
              )}
            </div>
            {confBaixa && (
              <div style={{ fontSize: 12, color: 'var(--yellow-t)', marginTop: 4 }}>
                Confira os valores no Balanço Patrimonial e na DSP antes de usar este material.
              </div>
            )}
            {analysis.notes && notesOpen && (
              <div style={{
                marginTop: 10, paddingLeft: 12, borderLeft: '2px solid var(--bd)',
                fontSize: 12, color: 'var(--t3)', lineHeight: 1.65, maxWidth: 820,
              }}>
                {analysis.notes}
              </div>
            )}
          </div>
        )}

        {/* Período menor que o ano: parte dos indicadores é anualizada, e isso
            precisa estar dito — senão um ROE de janeiro é lido como apurado. */}
        {indicators?._anualizado && (
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
            <i className="ti ti-info-circle" style={{ fontSize: 15, color: 'var(--blue-text)', flexShrink: 0, marginTop: 1 }} />
            <span>
              Este período cobre {indicators._anualizado.periodMonths === 1
                ? 'um mês'
                : `${indicators._anualizado.periodMonths} meses`}.
              Os indicadores marcados com <strong>a.a.</strong> foram levados à base anual
              (×{indicators._anualizado.fator}) para poderem ser lidos junto dos demais —
              são o ritmo do período projetado para 12 meses, não o valor realizado.
              Valores absolutos, como o EBITDA, seguem sendo os do período.
            </span>
          </div>
        )}

        {/* ── Onde está o problema ── */}
        {audit.criticos.length > 0 && (
          <div style={{
            marginBottom: 20, padding: '14px 16px', borderRadius: 10,
            background: 'var(--red-dim)', border: '1px solid rgba(208,29,33,.3)',
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 18, color: 'var(--red-t)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t0)' }}>
                {audit.criticos.length === 1
                  ? '1 indicador em estado crítico'
                  : `${audit.criticos.length} indicadores em estado crítico`}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {audit.criticos.map(c => (
                <button key={c.k} onClick={() => {
                  document.getElementById(`pilar-${c.pilarKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                  borderRadius: 100, border: '1px solid rgba(208,29,33,.3)', background: 'var(--bg1)',
                  fontSize: 12, color: 'var(--t0)', cursor: 'pointer',
                }}>
                  {c.label}
                  <strong style={{ color: 'var(--red-t)' }}>{f(c.valor, c.fn)}</strong>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Stats Cards ── */}
        <div className="dash-grid" style={{ marginBottom: 24 }}>
          {[
            { label: 'Ativo Total', val: f(bp?.total_ativo, brl), icon: 'ti-building-bank',
              info: 'Tudo o que a organização tem: caixa, estoques, contas a receber, imóveis, máquinas. É o tamanho do patrimônio colocado para trabalhar.' },
            { label: 'Receita / Ingressos', val: f(dsp?.receita_liquida ?? dsp?.ingressos, brl), icon: 'ti-trending-up',
              info: 'O que entrou com a atividade no período, já descontados impostos sobre vendas, devoluções e abatimentos.' },
            { label: 'EBITDA', val: f(ebitda, brl), icon: 'ti-chart-bar', info: INDICATOR_HELP.ebitda },
            { label: 'Sobras / Perdas', val: f(sobras, brl), icon: 'ti-wallet', neg: (sobras ?? 0) < 0,
              info: 'Resultado final do período. Em cooperativas não se chama lucro: sobras quando positivo, perdas quando negativo.' },
          ].map(({ label, val, icon, neg, info }) => (
            <div key={label} className="dash-card">
              <div className="dash-card-head">
                <span className="dash-card-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {label}{info && <InfoTooltip text={info} />}
                </span>
                <i className={`ti ${icon} dash-card-icon`}></i>
              </div>
              <div className="dash-card-val" style={neg ? { color: 'var(--red-t)' } : {}}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── Scorecard Saúde Financeira ── */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, marginBottom: 16, display: 'flex', alignItems: 'center' }}>
            Saúde Financeira
            <InfoTooltip text="Leitura rápida de cada pilar a partir do seu indicador-chave: liquidez corrente, endividamento total, ROE, ciclo operacional e saldo de tesouraria. Verde = dentro do benchmark, amarelo = atenção, vermelho = crítico." />
          </h2>
          <div className="grid-5">
            {SCORECARD.map(({ key, label, icon }) => {
              const r = scoreGrade(key, indicators);
              const c = GC[r?.[0]] || GC[''];
              return (
                <div key={key} style={{ padding: 16, borderRadius: 10, border: `1px solid ${c.bd}`, background: c.bg, textAlign: 'center' }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 22, color: c.t, marginBottom: 8, display: 'block' }}></i>
                  <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: c.t }}>{r?.[1] || '—'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 1. Sumário Executivo ── */}
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.05em' }}>✨ Sumário Executivo</span>
          </div>
          {narrative?.sumario ? (
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.7, color: 'var(--t0)', marginBottom: 20 }}>{recToText(narrative.sumario)}</p>
          ) : (
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.7, color: 'var(--t3)', fontStyle: 'italic', marginBottom: 20 }}>Gere o relatório com IA para visualizar o sumário executivo.</p>
          )}
          <div className="grid-3">
            {[
              { label: 'Liquidez Corrente', val: num(lcVal), color: lcColor, help: INDICATOR_HELP.liquidez_corrente },
              { label: 'Endividamento Total', val: pct(etVal), color: etColor, help: INDICATOR_HELP.endividamento_total_pct },
              { label: thirdLabel, val: thirdFormatted, color: thirdColor, help: thirdHelp },
            ].map(({ label, val, color, help }) => {
              const c = GC[color] || GC[''];
              return (
                <div key={label} style={{ padding: '14px 16px', borderRadius: 10, background: c.bg, border: `1px solid ${c.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                      {label}{help && <InfoTooltip text={help} />}
                    </div>
                    <div className="display-val-md" style={{ color: 'var(--t0)' }}>{val}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: c.t, padding: '3px 10px', borderRadius: 100, background: c.bg, border: `1px solid ${c.bd}` }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: statusDot(color), display: 'inline-block', marginRight: 5, verticalAlign: 'middle' }}></span>{statusLabel(color)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 2. Análise por Pilares ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Análise por Pilares</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {PILARES.map(pilar => {
              const pm = PILAR_META[pilar.key];
              const data = indicators?.[pilar.key] || {};
              const prevInd = prev?.indicators
                ? (typeof prev.indicators === 'string' ? JSON.parse(prev.indicators) : prev.indicators)
                : null;
              return (
                <div key={pilar.key} id={`pilar-${pilar.key}`} style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, scrollMarginTop: 16 }}>
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--t0)', marginBottom: 4, display: 'flex', alignItems: 'center' }}>
                      {pm?.title || pilar.label}
                      {PILAR_HELP[pilar.key] && <InfoTooltip text={PILAR_HELP[pilar.key]} />}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--t3)', margin: 0 }}>{pm?.desc || ''}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {pilar.items.map(({ k, label, fn }, idx) => {
                      const raw = data[k];
                      const color = indColor(pilar.key, k, raw);
                      const c = GC[color] || GC[''];
                      const meta = INDICATOR_META[k];
                      const descText = meta ? (raw != null ? meta.desc(raw) : 'Dado insuficiente no documento para calcular este indicador.') : '';
                      return (
                        <div key={k} className="grid-4col-indicator" style={{
                          padding: '12px 0',
                          borderBottom: idx < pilar.items.length - 1 ? '1px solid var(--bd)' : 'none'
                        }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t0)', display: 'flex', alignItems: 'center' }}>
                              {label}
                              {INDICATOR_HELP[k] && <InfoTooltip text={INDICATOR_HELP[k]} />}
                            </div>
                            {meta && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>Benchmark: {meta.benchmark}</div>}
                          </div>
                          <div className="display-val-lg" style={{ color: 'var(--t0)', textAlign: 'center' }}>
                            {f(raw, fn)}
                            {indicators?._anualizado && ANUALIZADOS.has(k) && raw != null && (
                              <span title="Valor anualizado" style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 4, verticalAlign: 'super' }}>a.a.</span>
                            )}
                            {prevInd && (
                              <div style={{ marginTop: 2, lineHeight: 1.3 }}>
                                <Delta k={k} atual={raw} anterior={prevInd[pilar.key]?.[k]} periodo={periodShort(prev)} />
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: statusDot(color), padding: '2px 8px', borderRadius: 100, background: c.bg, border: `1px solid ${c.bd}`, whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: 99, background: statusDot(color), display: 'inline-block', marginRight: 5, verticalAlign: 'middle' }}></span>{statusLabel(color)}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.5 }}>{descText}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sem narrativa, a Visão Geral terminava nos indicadores sem dizer que
            o diagnóstico e as recomendações podem ser gerados — o botão só
            existia na aba Relatório, onde quem está lendo aqui não vai. */}
        {!narrative && (
          <div style={{
            background: 'var(--bg1)', border: '1px dashed var(--bd2)', borderRadius: 12,
            padding: 28, marginBottom: 24, textAlign: 'center',
          }}>
            <i className="ti ti-sparkles" style={{ fontSize: 28, color: 'var(--gold)' }} />
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--t0)', margin: '10px 0 6px' }}>
              Diagnóstico e recomendações
            </h3>
            <p style={{ fontSize: 14, color: 'var(--t2)', maxWidth: 460, margin: '0 auto 18px', lineHeight: 1.6 }}>
              A partir dos indicadores acima, a IA redige o SWOT financeiro e as recomendações
              estratégicas — que também vão para o relatório em Word.
            </p>
            <button className="btn btn-p" onClick={generateNarrativeAI} disabled={genNarrative}>
              {genNarrative
                ? <><i className="ti ti-loader" style={{ animation: 'spin .8s linear infinite' }}></i> Gerando…</>
                : <><i className="ti ti-sparkles"></i> Gerar diagnóstico com IA</>}
            </button>
          </div>
        )}

        {/* ── 3. SWOT ── */}
        {narrative && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Diagnóstico SWOT Financeiro</span>
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              {[
                { label: 'Forças', text: narrative.forcas, bg: 'rgba(20,135,78,.06)', bd: 'rgba(20,135,78,.25)', icon: 'ti-trending-up', color: 'var(--green-t)' },
                { label: 'Oportunidades', text: null, bg: 'rgba(196,164,52,.06)', bd: 'rgba(196,164,52,.25)', icon: 'ti-sparkles', color: 'var(--gold)' },
                { label: 'Fraquezas', text: narrative.fraquezas, bg: 'rgba(235,136,31,.06)', bd: 'rgba(235,136,31,.25)', icon: 'ti-trending-down', color: 'var(--yellow-t)' },
                { label: 'Riscos', text: narrative.riscos, bg: 'rgba(208,29,33,.06)', bd: 'rgba(208,29,33,.25)', icon: 'ti-alert-triangle', color: 'var(--red-t)' },
              ].map(({ label, text, bg, bd, icon, color }) => {
                const bullets = text ? splitBullets(text) : [];
                return (
                  <div key={label} style={{ padding: 20, borderRadius: 12, background: bg, border: `1px solid ${bd}`, minHeight: 120 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 18, color }}></i>
                      <span style={{ fontSize: 14, fontWeight: 700, color }}>{label}</span>
                    </div>
                    {bullets.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {bullets.map((b, i) => (
                          <li key={i} style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.6 }}>{b}</li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--t3)', fontStyle: 'italic', margin: 0 }}>
                        {label === 'Oportunidades' ? 'Oportunidades a explorar.' : 'Sem dados disponíveis.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 4. Recomendações ── */}
        {narrative && (
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 28, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Recomendações Estratégicas</span>
            </div>
            {(!narrative.recomendacoes || narrative.recomendacoes.length === 0) ? (
              <p style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.7, color: 'var(--t3)', fontStyle: 'italic', margin: 0 }}>Gere o relatório com IA para visualizar as recomendações estratégicas.</p>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {narrative.recomendacoes.map((recRaw, i) => {
                const rec = recToText(recRaw);
                const colonIdx = rec.indexOf(':');
                const title = colonIdx > 0 ? rec.substring(0, colonIdx).replace(/^Recomendação\s*\d*\s*/i, '').trim() : `Recomendação ${i + 1}`;
                const desc = colonIdx > 0 ? rec.substring(colonIdx + 1).trim() : rec;
                const priority = i < 2 ? 'ALTA' : 'MÉDIA';
                const prColor = i < 2 ? 'var(--red-t)' : 'var(--yellow-t)';
                const prBg = i < 2 ? 'rgba(208,29,33,.08)' : 'rgba(235,136,31,.08)';
                return (
                  <div key={i} style={{ padding: '24px 0', borderTop: i > 0 ? '1px solid var(--bd)' : 'none', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    <div className="display-num" style={{ color: 'var(--t3)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--t0)' }}>{title}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: prColor, padding: '3px 10px', borderRadius: 100, background: prBg, letterSpacing: '.06em', flexShrink: 0 }}>{priority}</span>
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.7, margin: 0 }}>{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* ── 5. Footer ── */}
        <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', marginTop: 32, marginBottom: 0 }}>
          Relatório gerado por SynerCoop · IA assistida · Revise antes de enviar ao cliente
        </p>
        </>;
      })()}

      {/* ═══ TAB: RELATÓRIO ═══ */}
      {tab === 'relatorio' && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 20 }}>Relatório de Análise</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {narrative && (!SIGNING_ENABLED || analysis.status !== 'signed') && <>
                <button className="btn" onClick={() => editMode ? saveNarrative() : setEditMode(true)} disabled={saving}>
                  <i className={`ti ${editMode ? 'ti-check' : 'ti-edit'}`}></i>
                  {editMode ? (saving ? 'Salvando…' : 'Salvar') : 'Editar'}
                </button>
                {editMode && <button className="btn" onClick={() => setEditMode(false)}>Cancelar</button>}
              </>}
            </div>
          </div>

          {/* Aviso IA */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'var(--gold-dim)', border: '1px solid var(--gold)', borderRadius: 8, marginBottom: 20, fontSize: 13, color: 'var(--t1)' }}>
            <i className="ti ti-sparkles" style={{ color: 'var(--gold)', fontSize: 16, marginTop: 1, flexShrink: 0 }} />
            <span>Este relatório foi gerado por inteligência artificial com base nos dados inseridos. <strong>Revise o conteúdo antes de utilizá-lo</strong> — o sistema pode cometer erros ou omissões.</span>
          </div>

          {!narrative ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <i className="ti ti-file-text" style={{ fontSize: 36, color: 'var(--t3)', display: 'block', marginBottom: 12 }}></i>
              <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 16 }}>O relatório não foi gerado automaticamente. Clique abaixo para gerar agora.</p>
              <button className="btn btn-p" onClick={generateNarrativeAI} disabled={genNarrative}>
                {genNarrative ? <><i className="ti ti-loader" style={{ animation: 'spin .8s linear infinite' }}></i> Gerando…</> : <><i className="ti ti-sparkles"></i> Gerar Relatório com IA</>}
              </button>
            </div>
          ) : <>
            <div style={{ borderBottom: '2px solid var(--blue)', paddingBottom: 12, marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--t0)' }}>Relatório de Análise de Desempenho Financeiro</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>{analysis.client_name} · {periodLabel(analysis)}</div>
            </div>

            {REPORT_SECTIONS.map(({ key, title, heading, divider }) => {
              if (key.startsWith('_h_') || heading) {
                return (
                  <div key={key} style={{ marginTop: divider ? 32 : 0, marginBottom: 16 }}>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--t0)' }}>{title}</h3>
                    {heading && !key.startsWith('_h_') && (
                      <div style={{ marginTop: 8 }}>
                        {editMode
                          ? <AutoTextarea value={narrative[key] || ''} onChange={e => updateNarrative(key, e.target.value)} placeholder="Digite o texto desta seção..." />
                          : <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--t1)', margin: 0 }}>{narrative[key] || <em style={{ color: 'var(--t3)' }}>Sem conteúdo.</em>}</p>}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key={key} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--blue-text)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {title}<div style={{ flex: 1, height: 1, background: 'var(--bd)' }}></div>
                  </div>
                  {editMode
                    ? <AutoTextarea value={narrative[key] || ''} onChange={e => updateNarrative(key, e.target.value)} placeholder="Digite o texto desta seção..." />
                    : <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--t1)' }}>{narrative[key] || <em style={{ color: 'var(--t3)' }}>Sem conteúdo.</em>}</p>}
                </div>
              );
            })}

            <div style={{ marginTop: 32, marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--t0)', marginBottom: 16 }}>4. Recomendações Estratégicas</h3>
              {editMode
                ? <AutoTextarea value={(narrative.recomendacoes || []).map(recToText).join('\n')} onChange={e => updateNarrative('recomendacoes', e.target.value.split('\n').filter(l => l.trim()))} placeholder="Uma recomendação por linha..." />
                : <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(narrative.recomendacoes || []).map((r, i) => (
                      <li key={i} style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--t1)', display: 'flex', gap: 8, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6 }}>
                        <span style={{ color: 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>{i + 1}.</span>{recToText(r)}
                      </li>
                    ))}
                  </ul>}
            </div>
          </>}
        </div>
      )}

      {/* ═══ TAB: INDICADORES ═══ */}
      {tab === 'indicadores' && (
        <div className="grid-2">
          {PILARES.map(pilar => {
            const data = indicators?.[pilar.key] || {};
            return (
              <div key={pilar.key} style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bd)' }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--t0)' }}>{pilar.label}</div>
                </div>
                <div className="table-scroll"><table className="fin-table">
                  <thead><tr><th>Indicador</th><th className="r">Valor</th><th className="r">Status</th></tr></thead>
                  <tbody>
                    {pilar.items.map(({ k, label, fn }) => {
                      const raw = data[k]; const color = indColor(pilar.key, k, raw); const c = GC[color] || GC[''];
                      const sl = { green: 'Bom', yellow: 'Atenção', red: 'Crítico', '': '—' }[color] || '—';
                      return (
                        <tr key={k}>
                          {/* display:flex num <td> tira a célula do layout de
                              tabela e desalinha as colunas entre as linhas —
                              o flex vai num wrapper interno. */}
                          <td><span style={{ display: 'inline-flex', alignItems: 'center' }}>{label}{INDICATOR_HELP[k] && <InfoTooltip text={INDICATOR_HELP[k]} />}</span></td>
                          <td className="r">{f(raw, fn)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, fontWeight: 500, color: c.t, padding: '3px 10px', borderRadius: 100, background: c.bg, display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: 99, background: c.t, flexShrink: 0 }}></span>{sl}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TAB: BALANÇO PATRIMONIAL ═══ */}
      {tab === 'bp' && (
        <div className="grid-2">
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--t0)' }}>Ativo</div>
            </div>
            <div className="table-scroll"><table className="fin-table">
              <thead><tr><th>Descrição</th><th className="r">R$</th><th className="r">AV%</th></tr></thead>
              <tbody>
                <tr className="ft-group"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Ativo Circulante<InfoTooltip text={BP_TOOLTIP.ativo_circulante} /></span></td><td className="r">{fmtT(bp.ativo_circulante)}</td><td className="pct">{avPct(bp.ativo_circulante, totalAtivo)}</td></tr>
                {bp.disponibilidades != null && <tr className="ft-sub"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Disponibilidades<InfoTooltip text={BP_TOOLTIP.disponibilidades} /></span></td><td className="r">{fmtT(bp.disponibilidades)}</td><td className="pct">{avPct(bp.disponibilidades, totalAtivo)}</td></tr>}
                {bp.clientes != null && <tr className="ft-sub"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Clientes / Recebíveis<InfoTooltip text={BP_TOOLTIP.clientes} /></span></td><td className="r">{fmtT(bp.clientes)}</td><td className="pct">{avPct(bp.clientes, totalAtivo)}</td></tr>}
                {bp.estoques != null && <tr className="ft-sub"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Estoques<InfoTooltip text={BP_TOOLTIP.estoques} /></span></td><td className="r">{fmtT(bp.estoques)}</td><td className="pct">{avPct(bp.estoques, totalAtivo)}</td></tr>}
                <tr className="ft-group"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Ativo Não Circulante<InfoTooltip text={BP_TOOLTIP.ativo_nao_circulante} /></span></td><td className="r">{fmtT(ancTotal)}</td><td className="pct">{avPct(ancTotal, totalAtivo)}</td></tr>
                {bp.ativo_permanente != null && <tr className="ft-sub"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Ativo Permanente<InfoTooltip text={BP_TOOLTIP.ativo_permanente} /></span></td><td className="r">{fmtT(bp.ativo_permanente)}</td><td className="pct">{avPct(bp.ativo_permanente, totalAtivo)}</td></tr>}
                <tr className="ft-total"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>TOTAL DO ATIVO<InfoTooltip text={BP_TOOLTIP.total_ativo} /></span></td><td className="r">{fmtT(bp.total_ativo)}</td><td className="pct">100,0%</td></tr>
              </tbody>
            </table></div>
          </div>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--t0)' }}>Passivo + Patrimônio Líquido</div>
            </div>
            <div className="table-scroll"><table className="fin-table">
              <thead><tr><th>Descrição</th><th className="r">R$</th><th className="r">AV%</th></tr></thead>
              <tbody>
                <tr className="ft-group"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Passivo Circulante<InfoTooltip text={BP_TOOLTIP.passivo_circulante} /></span></td><td className="r">{fmtT(bp.passivo_circulante)}</td><td className="pct">{avPct(bp.passivo_circulante, totalAtivo)}</td></tr>
                {(bp.total_passivo_nao_circulante ?? bp.passivo_nao_circulante ?? bp.passivo_exigivel_lp) != null && (() => { const pnc = bp.total_passivo_nao_circulante ?? bp.passivo_nao_circulante ?? bp.passivo_exigivel_lp; return <tr className="ft-group"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Passivo Não Circulante<InfoTooltip text={BP_TOOLTIP.passivo_nao_circulante} /></span></td><td className="r">{fmtT(pnc)}</td><td className="pct">{avPct(pnc, totalAtivo)}</td></tr>; })()}
                <tr className="ft-group"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Patrimônio Líquido<InfoTooltip text={BP_TOOLTIP.patrimonio_liquido} /></span></td><td className="r">{fmtT(bp.patrimonio_liquido)}</td><td className="pct">{avPct(bp.patrimonio_liquido, totalAtivo)}</td></tr>
                <tr className="ft-total"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>TOTAL PASSIVO + PL<InfoTooltip text={BP_TOOLTIP.total_passivo_pl} /></span></td><td className="r">{fmtT(bp.total_passivo_pl)}</td><td className="pct">100,0%</td></tr>
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {/* ═══ TAB: DSP ═══ */}
      {tab === 'dsp' && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bd)' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--t0)' }}>Demonstração de Sobras e Perdas</div>
          </div>
          <div className="table-scroll"><table className="fin-table">
            <thead><tr><th>Descrição</th><th className="r">R$</th><th className="r">AV%</th></tr></thead>
            <tbody>
              <tr className="ft-group"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>{dsp.ingressos != null ? 'Ingressos / Receita Bruta' : 'Receita Bruta'}<InfoTooltip text={DSP_TOOLTIP.ingressos} /></span></td><td className="r">{fmtT(dsp.ingressos ?? dsp.receita_bruta)}</td><td className="pct">{avPct(dsp.ingressos ?? dsp.receita_bruta, receitaRef)}</td></tr>
              <tr className="ft-subtotal"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Receita Líquida<InfoTooltip text={DSP_TOOLTIP.receita_liquida} /></span></td><td className="r">{fmtT(dsp.receita_liquida)}</td><td className="pct">100,0%</td></tr>
              {dsp.cmv != null && <tr className="ft-sub"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>(-) CMV / CMO<InfoTooltip text={DSP_TOOLTIP.cmv} /></span></td><td className="r">{fmtT(dsp.cmv)}</td><td className="pct">{avPct(dsp.cmv, receitaRef)}</td></tr>}
              {dsp.lucro_bruto != null && <tr className="ft-subtotal"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Resultado Bruto<InfoTooltip text={DSP_TOOLTIP.lucro_bruto} /></span></td><td className="r">{fmtT(dsp.lucro_bruto)}</td><td className="pct">{avPct(dsp.lucro_bruto, receitaRef)}</td></tr>}
              {dsp.despesas_operacionais != null && <tr className="ft-sub"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>(-) Despesas Operacionais<InfoTooltip text={DSP_TOOLTIP.despesas_operacionais} /></span></td><td className="r">{fmtT(dsp.despesas_operacionais)}</td><td className="pct">{avPct(dsp.despesas_operacionais, receitaRef)}</td></tr>}
              <tr className="ft-ebitda"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>EBITDA<InfoTooltip text={DSP_TOOLTIP.ebitda} /></span></td><td className="r">{fmtT(ebitda)}</td><td className="pct">{avPct(ebitda, receitaRef)}</td></tr>
              {dsp.resultado_antes_ir != null && <tr className="ft-subtotal"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>Resultado Antes do IR<InfoTooltip text={DSP_TOOLTIP.resultado_antes_ir} /></span></td><td className="r">{fmtT(dsp.resultado_antes_ir)}</td><td className="pct">{avPct(dsp.resultado_antes_ir, receitaRef)}</td></tr>}
              <tr className="ft-result"><td><span style={{ display: 'inline-flex', alignItems: 'center' }}>SOBRAS / PERDAS<InfoTooltip text={DSP_TOOLTIP.sobras} /></span></td><td className="r" style={(sobras ?? 0) < 0 ? { color: 'var(--red-t)' } : {}}>{fmtT(sobras)}</td><td className="pct">{avPct(sobras, receitaRef)}</td></tr>
            </tbody>
          </table></div>
        </div>
      )}

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
