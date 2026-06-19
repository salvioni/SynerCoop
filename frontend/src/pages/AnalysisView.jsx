import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadFile, ApiError } from '../lib/api.js';
import ConfirmModal from '../components/ConfirmModal.jsx';

const FMT_COMPACT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const brl   = v => v != null ? FMT_COMPACT.format(v) : '—';
const fmtT  = v => v != null ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—';
const pct   = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
const num   = v => v != null ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const days  = v => v != null ? Math.round(v) + 'd' : '—';
const f     = (v, fn) => v == null ? '—' : fn(v);
const avPct = (v, ref) => (!ref || v == null) ? '—' : ((v / ref) * 100).toFixed(1) + '%';

const PILARES = [
  {
    key: 'liquidez', label: 'Liquidez', icon: 'ti-droplet',
    items: [
      { k: 'liquidez_geral',                label: 'Liquidez Geral',               fn: num },
      { k: 'liquidez_corrente',             label: 'Liquidez Corrente',             fn: num },
      { k: 'liquidez_seca',                 label: 'Liquidez Seca',                 fn: num },
      { k: 'garantia_capital_terceiros',    label: 'Garantia Cap. Terceiros',       fn: num },
      { k: 'imobilizacao_recursos_proprios', label: 'Imob. Rec. Próprios',          fn: num },
      { k: 'ebitda',                        label: 'EBITDA',                        fn: brl },
    ],
  },
  {
    key: 'endividamento', label: 'Endividamento', icon: 'ti-trending-up',
    items: [
      { k: 'endividamento_total_pct',            label: 'Endividamento Total',         fn: pct },
      { k: 'endividamento_operacional_pct',       label: 'Endiv. Operacional',          fn: pct },
      { k: 'endividamento_financeiro_total_pct',  label: 'Endiv. Financeiro',           fn: pct },
      { k: 'endividamento_financeiro_lp_pct',     label: 'Endiv. Financeiro LP',        fn: pct },
      { k: 'endividamento_lp_pct',                label: 'Endividamento LP',             fn: pct },
      { k: 'perfil_endividamento_pct',            label: 'Perfil de Endividamento',     fn: pct },
      { k: 'nivel_alavancagem_ebitda',            label: 'Alavancagem Dívida/EBITDA',   fn: num },
    ],
  },
  {
    key: 'rentabilidade', label: 'Rentabilidade', icon: 'ti-coin',
    items: [
      { k: 'rentabilidade_pl_pct',                   label: 'ROE (Rentab. PL)',             fn: pct },
      { k: 'rentabilidade_ativos_pct',                label: 'ROA (Rentab. Ativos)',         fn: pct },
      { k: 'rentabilidade_ingressos_pct',             label: 'Rentab. Ingressos',            fn: pct },
      { k: 'rentabilidade_capital_integralizado_pct', label: 'Rentab. Cap. Integralizado',   fn: pct },
    ],
  },
  {
    key: 'capacidade_operacional', label: 'Cap. Operacional', icon: 'ti-refresh',
    items: [
      { k: 'pme',               label: 'PME (Est. → Vendas)',   fn: days },
      { k: 'pmr',               label: 'PMR (Vendas → Caixa)',  fn: days },
      { k: 'pmp',               label: 'PMP (Compras → Pag.)',  fn: days },
      { k: 'ciclo_operacional', label: 'Ciclo Operacional',     fn: days },
      { k: 'ciclo_financeiro',  label: 'Ciclo Financeiro',      fn: days },
      { k: 'giro_ativo',        label: 'Giro do Ativo',         fn: num  },
      { k: 'giro_permanente',   label: 'Giro Permanente',       fn: num  },
    ],
  },
  {
    key: 'tesouraria', label: 'Tesouraria', icon: 'ti-building-bank',
    items: [
      { k: 'capital_giro',               label: 'Capital de Giro',      fn: brl },
      { k: 'capital_giro_faturamento_pct', label: 'CG / Faturamento',   fn: pct },
      { k: 'capital_giro_pct',           label: 'CG / Ativo Total',     fn: pct },
      { k: 'ncg',                        label: 'NCG',                   fn: brl },
      { k: 'ncg_faturamento_pct',        label: 'NCG / Faturamento',    fn: pct },
      { k: 'tesouraria',                 label: 'Saldo de Tesouraria',  fn: brl },
      { k: 'tesouraria_faturamento_pct', label: 'Tesouraria / Fat.',    fn: pct },
      { k: 'independencia_financeira',   label: 'Independência Fin.',   fn: num },
    ],
  },
];

const SCORECARD = [
  { key: 'liquidez',               label: 'Liquidez',         icon: '💧' },
  { key: 'endividamento',          label: 'Endividamento',    icon: '📊' },
  { key: 'rentabilidade',          label: 'Rentabilidade',    icon: '💰' },
  { key: 'capacidade_operacional', label: 'Cap. Operacional', icon: '⚙️' },
  { key: 'tesouraria',             label: 'Tesouraria',       icon: '🏦' },
];

function scoreGrade(key, indicators, dsp) {
  const ind = indicators?.[key] || {};
  switch (key) {
    case 'liquidez': {
      const v = ind.liquidez_corrente;
      if (v == null) return null;
      if (v >= 1.5) return { grade: 'sc-green', label: 'Boa' };
      if (v >= 1.0) return { grade: 'sc-yellow', label: 'Regular' };
      return { grade: 'sc-red', label: 'Crítica' };
    }
    case 'endividamento': {
      const v = ind.endividamento_total_pct;
      if (v == null) return null;
      if (v <= 0.4) return { grade: 'sc-green', label: 'Baixo' };
      if (v <= 0.6) return { grade: 'sc-yellow', label: 'Moderado' };
      return { grade: 'sc-red', label: 'Elevado' };
    }
    case 'rentabilidade': {
      const v = ind.rentabilidade_pl_pct;
      if (v == null) return null;
      if (v >= 0.10) return { grade: 'sc-green', label: 'Boa' };
      if (v >= 0.03) return { grade: 'sc-yellow', label: 'Regular' };
      return { grade: 'sc-red', label: 'Baixa' };
    }
    case 'capacidade_operacional': {
      const v = ind.ciclo_operacional;
      if (v == null) return null;
      if (v <= 60)  return { grade: 'sc-green', label: 'Boa' };
      if (v <= 120) return { grade: 'sc-yellow', label: 'Regular' };
      return { grade: 'sc-red', label: 'Longa' };
    }
    case 'tesouraria': {
      const v = ind.tesouraria;
      const receita = dsp?.receita_liquida ?? dsp?.ingressos;
      if (v == null) return null;
      if (v > 0) return { grade: 'sc-green', label: 'Positiva' };
      const threshold = receita ? receita * 0.05 : 50000;
      if (v >= -threshold) return { grade: 'sc-yellow', label: 'Neutra' };
      return { grade: 'sc-red', label: 'Negativa' };
    }
    default: return null;
  }
}

function indBadge(pilarKey, itemKey, val) {
  if (val == null) return 'iv-n';
  switch (pilarKey) {
    case 'liquidez':
      if (itemKey === 'liquidez_corrente') return val >= 1.5 ? 'iv-g' : val >= 1.0 ? 'iv-y' : 'iv-r';
      if (['liquidez_geral', 'liquidez_seca'].includes(itemKey)) return val >= 1.0 ? 'iv-g' : val >= 0.7 ? 'iv-y' : 'iv-r';
      if (itemKey === 'ebitda') return val > 0 ? 'iv-g' : val < 0 ? 'iv-r' : 'iv-n';
      return val >= 1.0 ? 'iv-g' : val >= 0.5 ? 'iv-y' : 'iv-r';
    case 'endividamento':
      if (itemKey === 'nivel_alavancagem_ebitda') return val <= 2 ? 'iv-g' : val <= 4 ? 'iv-y' : 'iv-r';
      return val <= 0.4 ? 'iv-g' : val <= 0.6 ? 'iv-y' : 'iv-r';
    case 'rentabilidade':
      return val >= 0.1 ? 'iv-g' : val >= 0.03 ? 'iv-y' : 'iv-r';
    case 'capacidade_operacional':
      if (itemKey === 'pmp') return val >= 30 ? 'iv-g' : val >= 15 ? 'iv-y' : 'iv-r';
      if (itemKey === 'ciclo_financeiro') return val <= 30 ? 'iv-g' : val <= 60 ? 'iv-y' : 'iv-r';
      if (['pme', 'pmr', 'ciclo_operacional'].includes(itemKey)) return val <= 45 ? 'iv-g' : val <= 90 ? 'iv-y' : 'iv-r';
      return val >= 1.5 ? 'iv-g' : val >= 0.8 ? 'iv-y' : 'iv-r';
    case 'tesouraria':
      if (itemKey === 'independencia_financeira') return val >= 0.5 ? 'iv-g' : val >= 0.3 ? 'iv-y' : 'iv-r';
      if (itemKey.includes('pct')) return val > 0.05 ? 'iv-g' : val > 0 ? 'iv-y' : 'iv-r';
      return val > 0 ? 'iv-g' : val > -50000 ? 'iv-y' : 'iv-r';
    default:
      return val > 0 ? 'iv-g' : val < 0 ? 'iv-r' : 'iv-n';
  }
}

const REPORT_SECTIONS = [
  { key: 'resumo',       title: 'Resumo Executivo' },
  { key: 'balanco',      title: 'Análise do Balanço Patrimonial' },
  { key: 'resultado',    title: 'Desempenho Operacional' },
  { key: 'indicadores',  title: 'Análise dos Indicadores' },
  { key: 'recomendacoes', title: 'Considerações e Recomendações' },
];

export default function AnalysisView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [reporting, setReporting] = useState(false);
  const [reportErr, setReportErr] = useState('');
  const [confirm, setConfirm]     = useState(null);
  const [tab, setTab]             = useState('bp');
  const [editMode, setEditMode]   = useState(false);
  const [narrative, setNarrative] = useState({});

  useEffect(() => {
    api.get(`/analyses/${id}`)
      .then(d => { setAnalysis(d.analysis); setNarrative(d.analysis.narrative || {}); })
      .catch(() => navigate('/app/clients', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]);

  async function downloadReport() {
    setReporting(true); setReportErr('');
    try {
      const blob = await downloadFile(`/analyses/${id}/report`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio_${analysis.client_name?.replace(/\s+/g, '_')}_${analysis.year}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setReportErr(e.message || 'Erro ao gerar relatório.'); }
    finally { setReporting(false); }
  }

  async function doDelete() {
    setConfirm(null);
    try {
      await api.del(`/analyses/${id}`);
      navigate(`/app/clients/${analysis.client_id}`, { replace: true });
    } catch (e) { alert(e.message); }
  }

  if (loading) return null;
  if (!analysis) return null;

  const { bp = {}, dsp = {}, indicators = {} } = analysis;
  const sobras     = dsp?.sobras_perdas;
  const totalAtivo = bp.total_ativo || 1;

  const topLine     = dsp.ingressos ?? dsp.receita_bruta;
  const receitaRef  = dsp.receita_liquida ?? topLine ?? 1;
  const deducoes    = (topLine != null && dsp.receita_liquida != null) ? topLine - dsp.receita_liquida : null;
  const resultBruto = dsp.lucro_bruto ??
    (dsp.receita_liquida != null && dsp.cmv != null ? dsp.receita_liquida - dsp.cmv : null);
  const ebitda      = indicators?.liquidez?.ebitda ??
    (resultBruto != null && dsp.despesas_operacionais != null
      ? resultBruto - dsp.despesas_operacionais + (dsp.depreciacao_amortizacao ?? 0)
      : null);
  const ancTotal    = (bp.ativo_realizavel_lp != null || bp.ativo_permanente != null)
    ? (bp.ativo_realizavel_lp ?? 0) + (bp.ativo_permanente ?? 0)
    : (bp.total_ativo != null && bp.ativo_circulante != null ? bp.total_ativo - bp.ativo_circulante : null);

  const TABS = [
    { k: 'bp',  label: 'Balanço Patrimonial' },
    { k: 'dsp', label: 'Resultado (DSP)' },
    { k: 'ind', label: 'Indicadores' },
    { k: 'rel', label: 'Relatório' },
  ];

  return (
    <>
      {/* ── PAGE HEADER ── */}
      <div className="page-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <button className="back" onClick={() => navigate(`/app/clients/${analysis.client_id}`)}>
            <i className="ti ti-arrow-left"></i> {analysis.client_name}
          </button>
          <div className="page-head-l" style={{ flex: 1 }}>
            <h1>Análise {analysis.year}</h1>
            <p>{analysis.client_name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <button className="btn btn-sm" onClick={() => setConfirm({
            title: 'Excluir análise?',
            message: `Análise ${analysis.year} será excluída permanentemente.`,
            confirmLabel: 'Excluir', danger: true, onConfirm: doDelete,
          })}>
            <i className="ti ti-trash"></i>
          </button>
          <button className="btn btn-p btn-sm" onClick={downloadReport} disabled={reporting}>
            {reporting
              ? <><i className="ti ti-loader"></i> Gerando…</>
              : <><i className="ti ti-file-download"></i> Relatório</>}
          </button>
        </div>
      </div>

      {/* ── SUMMARY + SCORECARD (non-scrolling) ── */}
      <div style={{ padding: '12px 18px 0', flexShrink: 0 }}>
        {reportErr && <div className="err-banner" style={{ marginBottom: 10 }}>{reportErr}</div>}

        <div className="sum-row">
          {[
            { label: 'Ativo Total',         val: f(bp?.total_ativo, brl) },
            { label: 'Receita / Ingressos', val: f(dsp?.receita_liquida ?? dsp?.ingressos, brl) },
            { label: 'EBITDA',              val: f(ebitda, brl) },
            { label: 'Sobras / Perdas',     val: f(sobras, brl), neg: (sobras ?? 0) < 0 },
          ].map(({ label, val, neg }) => (
            <div key={label} className="sum-cell">
              <div className="sum-label">{label}</div>
              <div className="sum-val" style={neg ? { color: 'var(--red-t)' } : {}}>{val}</div>
            </div>
          ))}
        </div>

        {analysis.confidence != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 11, color: 'var(--t2)' }}>
            <i className="ti ti-sparkles"></i>
            Confiança da extração: <strong style={{ color: 'var(--t1)' }}>{(analysis.confidence * 100).toFixed(0)}%</strong>
            {analysis.notes && <span>· {analysis.notes}</span>}
          </div>
        )}

        <div className="sc-row">
          <span className="sc-label"><i className="ti ti-stethoscope"></i> Saúde</span>
          {SCORECARD.map(({ key, label, icon }) => {
            const result = scoreGrade(key, indicators, dsp);
            return (
              <span key={key} className={`sc-pill ${result ? result.grade : 'sc-gray'}`}>
                {icon} {label}: <strong>{result ? result.label : '—'}</strong>
              </span>
            );
          })}
        </div>
      </div>

      {/* ── NAV TABS ── */}
      <div className="nav-tabs">
        {TABS.map(({ k, label }) => (
          <button key={k} className={`nav-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB BODY (scrollable) ── */}
      <div className="tab-body">

        {/* ── BALANÇO PATRIMONIAL ── */}
        {tab === 'bp' && (
          <div className="bp-wrap">
            {/* ATIVO */}
            <div className="bp-side">
              <div className="bp-side-title">
                Ativo <span>{fmtT(bp.total_ativo)}</span>
              </div>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th className="r">R$</th>
                    <th className="r">AV%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="ft-group">
                    <td>Ativo Circulante</td>
                    <td className="r">{fmtT(bp.ativo_circulante)}</td>
                    <td className="pct">{avPct(bp.ativo_circulante, totalAtivo)}</td>
                  </tr>
                  {bp.disponibilidades != null && <tr className="ft-sub">
                    <td>Disponibilidades</td>
                    <td className="r">{fmtT(bp.disponibilidades)}</td>
                    <td className="pct">{avPct(bp.disponibilidades, totalAtivo)}</td>
                  </tr>}
                  {bp.clientes != null && <tr className="ft-sub">
                    <td>Clientes / Recebíveis</td>
                    <td className="r">{fmtT(bp.clientes)}</td>
                    <td className="pct">{avPct(bp.clientes, totalAtivo)}</td>
                  </tr>}
                  {bp.estoques != null && <tr className="ft-sub">
                    <td>Estoques</td>
                    <td className="r">{fmtT(bp.estoques)}</td>
                    <td className="pct">{avPct(bp.estoques, totalAtivo)}</td>
                  </tr>}
                  <tr className="ft-group">
                    <td>Ativo Não Circulante</td>
                    <td className="r">{fmtT(ancTotal)}</td>
                    <td className="pct">{avPct(ancTotal, totalAtivo)}</td>
                  </tr>
                  {bp.ativo_realizavel_lp != null && <tr className="ft-sub">
                    <td>Realizável a Longo Prazo</td>
                    <td className="r">{fmtT(bp.ativo_realizavel_lp)}</td>
                    <td className="pct">{avPct(bp.ativo_realizavel_lp, totalAtivo)}</td>
                  </tr>}
                  {bp.ativo_permanente != null && <tr className="ft-sub">
                    <td>Ativo Permanente</td>
                    <td className="r">{fmtT(bp.ativo_permanente)}</td>
                    <td className="pct">{avPct(bp.ativo_permanente, totalAtivo)}</td>
                  </tr>}
                  <tr className="ft-total">
                    <td>TOTAL DO ATIVO</td>
                    <td className="r">{fmtT(bp.total_ativo)}</td>
                    <td className="pct">100,0%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* PASSIVO + PL */}
            <div className="bp-side">
              <div className="bp-side-title">
                Passivo + PL <span>{fmtT(bp.total_passivo_pl)}</span>
              </div>
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th className="r">R$</th>
                    <th className="r">AV%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="ft-group">
                    <td>Passivo Circulante</td>
                    <td className="r">{fmtT(bp.passivo_circulante)}</td>
                    <td className="pct">{avPct(bp.passivo_circulante, totalAtivo)}</td>
                  </tr>
                  {bp.passivo_exigivel_lp != null && <tr className="ft-group">
                    <td>Passivo Não Circulante</td>
                    <td className="r">{fmtT(bp.passivo_exigivel_lp)}</td>
                    <td className="pct">{avPct(bp.passivo_exigivel_lp, totalAtivo)}</td>
                  </tr>}
                  <tr className="ft-group">
                    <td>Patrimônio Líquido</td>
                    <td className="r">{fmtT(bp.patrimonio_liquido)}</td>
                    <td className="pct">{avPct(bp.patrimonio_liquido, totalAtivo)}</td>
                  </tr>
                  {bp.capital_integralizado != null && <tr className="ft-sub">
                    <td>Capital Integralizado</td>
                    <td className="r">{fmtT(bp.capital_integralizado)}</td>
                    <td className="pct">{avPct(bp.capital_integralizado, totalAtivo)}</td>
                  </tr>}
                  <tr className="ft-total">
                    <td>TOTAL PASSIVO + PL</td>
                    <td className="r">{fmtT(bp.total_passivo_pl)}</td>
                    <td className="pct">100,0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RESULTADO (DSP) ── */}
        {tab === 'dsp' && (
          <div className="dsp-wrap">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th className="r">R$</th>
                  <th className="r">AV%</th>
                </tr>
              </thead>
              <tbody>
                <tr className="ft-group">
                  <td>{dsp.ingressos != null ? 'Ingressos / Receita Bruta' : 'Receita Bruta'}</td>
                  <td className="r">{fmtT(topLine)}</td>
                  <td className="pct">{avPct(topLine, receitaRef)}</td>
                </tr>
                {deducoes != null && (
                  <tr className="ft-sub">
                    <td>(-) Impostos / Deduções</td>
                    <td className="r">{fmtT(deducoes)}</td>
                    <td className="pct">{avPct(deducoes, receitaRef)}</td>
                  </tr>
                )}
                <tr className="ft-subtotal">
                  <td>Receita Líquida</td>
                  <td className="r">{fmtT(dsp.receita_liquida)}</td>
                  <td className="pct">100,0%</td>
                </tr>
                {dsp.cmv != null && <tr className="ft-sub">
                  <td>(-) CMV / CMO</td>
                  <td className="r">{fmtT(dsp.cmv)}</td>
                  <td className="pct">{avPct(dsp.cmv, receitaRef)}</td>
                </tr>}
                {resultBruto != null && <tr className="ft-subtotal">
                  <td>Resultado Bruto</td>
                  <td className="r">{fmtT(resultBruto)}</td>
                  <td className="pct">{avPct(resultBruto, receitaRef)}</td>
                </tr>}
                {dsp.despesas_operacionais != null && <tr className="ft-sub">
                  <td>(-) Despesas Operacionais</td>
                  <td className="r">{fmtT(dsp.despesas_operacionais)}</td>
                  <td className="pct">{avPct(dsp.despesas_operacionais, receitaRef)}</td>
                </tr>}
                {dsp.depreciacao_amortizacao != null && (
                  <tr className="ft-sub">
                    <td>(+) Depreciação / Amortização</td>
                    <td className="r">{fmtT(dsp.depreciacao_amortizacao)}</td>
                    <td className="pct">{avPct(dsp.depreciacao_amortizacao, receitaRef)}</td>
                  </tr>
                )}
                <tr className="ft-ebitda">
                  <td>EBITDA</td>
                  <td className="r">{fmtT(ebitda)}</td>
                  <td className="pct">{avPct(ebitda, receitaRef)}</td>
                </tr>
                {dsp.depreciacao_amortizacao != null && (
                  <tr className="ft-sub">
                    <td>(-) Depreciação / Amortização</td>
                    <td className="r">{fmtT(dsp.depreciacao_amortizacao)}</td>
                    <td className="pct">{avPct(dsp.depreciacao_amortizacao, receitaRef)}</td>
                  </tr>
                )}
                {dsp.resultado_antes_ir != null && <tr className="ft-subtotal">
                  <td>Resultado Antes do IR</td>
                  <td className="r">{fmtT(dsp.resultado_antes_ir)}</td>
                  <td className="pct">{avPct(dsp.resultado_antes_ir, receitaRef)}</td>
                </tr>}
                {dsp.imposto_renda != null && <tr className="ft-sub">
                  <td>(-) Imposto de Renda / CSLL</td>
                  <td className="r">{fmtT(dsp.imposto_renda)}</td>
                  <td className="pct">{avPct(dsp.imposto_renda, receitaRef)}</td>
                </tr>}
                <tr className="ft-result">
                  <td>SOBRAS / PERDAS</td>
                  <td className="r" style={(sobras ?? 0) < 0 ? { color: 'var(--red-t)' } : {}}>{fmtT(sobras)}</td>
                  <td className="pct">{avPct(sobras, receitaRef)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── INDICADORES ── */}
        {tab === 'ind' && (
          <div className="ind-grid">
            {PILARES.slice(0, 4).map(pilar => {
              const data = indicators?.[pilar.key] || {};
              return (
                <div key={pilar.key} className="ind-group">
                  <div className="ind-group-head">
                    <i className={`ti ${pilar.icon}`}></i>
                    {pilar.label}
                  </div>
                  {pilar.items.map(({ k, label, fn }) => {
                    const raw = data[k];
                    return (
                      <div key={k} className="ind-row">
                        <span className="ind-name">{label}</span>
                        <span className={`ind-val ${indBadge(pilar.key, k, raw)}`}>{f(raw, fn)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Tesouraria — full width */}
            {(() => {
              const pilar = PILARES[4];
              const data = indicators?.[pilar.key] || {};
              return (
                <div className="ind-group ind-wide">
                  <div className="ind-group-head">
                    <i className={`ti ${pilar.icon}`}></i>
                    {pilar.label}
                  </div>
                  <div className="ind-inner">
                    {pilar.items.map(({ k, label, fn }) => {
                      const raw = data[k];
                      return (
                        <div key={k} className="ind-row">
                          <span className="ind-name">{label}</span>
                          <span className={`ind-val ${indBadge(pilar.key, k, raw)}`}>{f(raw, fn)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── RELATÓRIO ── */}
        {tab === 'rel' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className={`btn${editMode ? ' btn-p' : ''}`} onClick={() => setEditMode(m => !m)}>
                <i className={`ti ${editMode ? 'ti-check' : 'ti-edit'}`}></i>
                {editMode ? 'Concluir edição' : 'Editar texto'}
              </button>
              <button className="btn btn-p" onClick={downloadReport} disabled={reporting}>
                {reporting
                  ? <><i className="ti ti-loader"></i> Gerando…</>
                  : <><i className="ti ti-file-download"></i> Baixar Relatório</>}
              </button>
              <button className="btn" onClick={() => alert('Compartilhamento em breve.')}>
                <i className="ti ti-share"></i> Compartilhar
              </button>
            </div>

            <div className="report-doc">
              <div className="report-header">
                <div className="report-title">Análise Financeira — {analysis.year}</div>
                <div className="report-meta">
                  <span><i className="ti ti-building"></i> {analysis.client_name}</span>
                  <span><i className="ti ti-calendar"></i> Exercício {analysis.year}</span>
                  {analysis.confidence != null && (
                    <span><i className="ti ti-sparkles"></i> Extração {(analysis.confidence * 100).toFixed(0)}% confiança</span>
                  )}
                </div>
              </div>

              {REPORT_SECTIONS.map(({ key, title }) => (
                <div key={key} className="report-section">
                  <div className="report-section-title">{title}</div>
                  {editMode ? (
                    <textarea
                      className="report-textarea"
                      value={narrative[key] || ''}
                      onChange={e => setNarrative(n => ({ ...n, [key]: e.target.value }))}
                      placeholder="Digite o texto desta seção…"
                    />
                  ) : (
                    <p className="report-p">
                      {narrative[key] || (
                        <em style={{ color: 'var(--t2)' }}>
                          Sem texto. Clique em "Editar texto" para adicionar.
                        </em>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
