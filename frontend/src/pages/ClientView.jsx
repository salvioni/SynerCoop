import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

const FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const brl = v => v != null ? FMT.format(v) : '—';
const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
const num = v => v != null ? Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const COLORS = {
  blue: 'oklch(0.24 0.06 260)',
  gold: 'oklch(0.78 0.12 80)',
  green: 'oklch(0.55 0.13 155)',
  red: 'oklch(0.55 0.21 27)',
  muted: 'oklch(0.5 0.02 255)',
  bg: 'oklch(0.96 0.008 250)',
};
const PIE_COLORS = [COLORS.blue, COLORS.gold, COLORS.green, COLORS.muted];

function parseAnalysis(a) {
  return {
    year: a.year,
    bp: typeof a.bp === 'string' ? JSON.parse(a.bp || '{}') : (a.bp || {}),
    dsp: typeof a.dsp === 'string' ? JSON.parse(a.dsp || '{}') : (a.dsp || {}),
    ind: typeof a.indicators === 'string' ? JSON.parse(a.indicators || '{}') : (a.indicators || {}),
  };
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 12, color: 'var(--t2)' }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 14px', fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
      <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--t0)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 500 }}>{typeof p.value === 'number' ? FMT.format(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function ClientView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    api.get(`/clients/${id}`)
      .then(d => { setClient(d.client); setAnalyses(d.analyses || []); })
      .catch(() => navigate('/app/clients', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]);

  async function deleteAnalysis(a) {
    setConfirm(null);
    try {
      await api.del(`/analyses/${a.id}`);
      setAnalyses(prev => prev.filter(x => x.id !== a.id));
    } catch (e) { alert(e.message); }
  }

  if (loading || !client) return null;

  const sorted = [...analyses].sort((a, b) => a.year - b.year);
  const parsed = sorted.map(parseAnalysis);
  const latest = parsed[parsed.length - 1];

  const STATS = [
    { label: 'Total de análises', val: analyses.length, icon: 'ti-chart-bar' },
    { label: 'Último exercício', val: latest?.year || '—', icon: 'ti-calendar' },
    { label: 'Ativo Total', val: brl(latest?.bp?.total_ativo), icon: 'ti-building-bank' },
    { label: 'Receita Líquida', val: brl(latest?.dsp?.receita_liquida ?? latest?.dsp?.ingressos), icon: 'ti-trending-up' },
  ];

  const KEY_IND = [
    { label: 'Liquidez Corrente', val: num(latest?.ind?.liquidez?.liquidez_corrente), good: (latest?.ind?.liquidez?.liquidez_corrente ?? 0) >= 1 },
    { label: 'Endividamento Total', val: pct(latest?.ind?.endividamento?.endividamento_total_pct), good: (latest?.ind?.endividamento?.endividamento_total_pct ?? 1) <= 0.6 },
    { label: 'ROE', val: pct(latest?.ind?.rentabilidade?.rentabilidade_pl_pct), good: (latest?.ind?.rentabilidade?.rentabilidade_pl_pct ?? 0) >= 0.03 },
    { label: 'Ciclo Operacional', val: latest?.ind?.capacidade_operacional?.ciclo_operacional != null ? Math.round(latest.ind.capacidade_operacional.ciclo_operacional) + ' dias' : '—', good: (latest?.ind?.capacidade_operacional?.ciclo_operacional ?? 999) <= 120 },
    { label: 'Capital de Giro', val: brl(latest?.ind?.tesouraria?.capital_giro), good: (latest?.ind?.tesouraria?.capital_giro ?? 0) > 0 },
    { label: 'EBITDA', val: brl(latest?.ind?.liquidez?.ebitda), good: (latest?.ind?.liquidez?.ebitda ?? 0) > 0 },
  ];

  // Chart data
  const evolutionData = parsed.map(p => ({
    name: String(p.year),
    'Ativo Total': p.bp.total_ativo || 0,
    'Receita Líquida': p.dsp.receita_liquida || p.dsp.ingressos || 0,
    'Sobras/Perdas': p.dsp.sobras_perdas || 0,
  }));

  const indicatorData = parsed.map(p => ({
    name: String(p.year),
    'Liquidez Corrente': p.ind.liquidez?.liquidez_corrente || 0,
    'Endividamento %': (p.ind.endividamento?.endividamento_total_pct || 0) * 100,
    'ROE %': (p.ind.rentabilidade?.rentabilidade_pl_pct || 0) * 100,
  }));

  const compositionData = latest ? [
    { name: 'Ativo Circulante', value: latest.bp.ativo_circulante || 0 },
    { name: 'Ativo Permanente', value: latest.bp.ativo_permanente || 0 },
    { name: 'Realizável LP', value: latest.bp.ativo_realizavel_lp || 0 },
  ].filter(d => d.value > 0) : [];

  const dspData = latest ? [
    { name: 'Receita Líquida', value: Math.abs(latest.dsp.receita_liquida || 0) },
    { name: 'CMV', value: Math.abs(latest.dsp.cmv || 0) },
    { name: 'Desp. Operacionais', value: Math.abs(latest.dsp.despesas_operacionais || 0) },
    { name: 'Sobras/Perdas', value: Math.abs(latest.dsp.sobras_perdas || 0) },
  ].filter(d => d.value > 0) : [];

  const hasMultiple = parsed.length > 1;

  return (
    <div className="page-body" style={{ padding: '40px 32px' }}>
      <button className="back" onClick={() => navigate('/app/clients')} style={{ marginBottom: 16 }}>
        <i className="ti ti-arrow-left"></i> Clientes
      </button>

      {/* Client header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 32 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12, background: 'var(--blue)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 500, flexShrink: 0,
        }}>
          {client.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: 4 }}>{client.name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14, color: 'var(--t2)' }}>
            <span style={{ textTransform: 'capitalize' }}>{client.type || 'empresa'}</span>
            {client.cnpj && <span style={{ fontFamily: 'ui-monospace, monospace' }}>{client.cnpj}</span>}
            {client.contact_email && <span><i className="ti ti-mail" style={{ fontSize: 14, marginRight: 4 }}></i>{client.contact_email}</span>}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="dash-grid" style={{ marginBottom: 24 }}>
        {STATS.map(({ label, val, icon }) => (
          <div key={label} className="dash-card">
            <div className="dash-card-head">
              <span className="dash-card-label">{label}</span>
              <i className={`ti ${icon} dash-card-icon`}></i>
            </div>
            <div className="dash-card-val">{val}</div>
          </div>
        ))}
      </div>

      {/* Charts row — evolution + composition */}
      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: hasMultiple ? '1.5fr 1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {hasMultiple ? (
            <ChartCard title="Evolução patrimonial" subtitle="Por exercício">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={evolutionData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} tickFormatter={v => FMT.format(v)} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Ativo Total" fill={COLORS.blue} radius={[4,4,0,0]} />
                  <Bar dataKey="Receita Líquida" fill={COLORS.gold} radius={[4,4,0,0]} />
                  <Bar dataKey="Sobras/Perdas" fill={COLORS.green} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : (
            <ChartCard title="Composição do Ativo" subtitle={`Exercício ${latest.year}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={compositionData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                      {compositionData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {compositionData.map((d, i) => (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }}></div>
                      <span style={{ color: 'var(--t2)' }}>{d.name}</span>
                      <span style={{ fontWeight: 500, color: 'var(--t0)', marginLeft: 'auto' }}>{FMT.format(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          )}

          <ChartCard title="Resultado (DSP)" subtitle={`Exercício ${latest.year}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={dspData} dataKey="value" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                    {dspData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dspData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }}></div>
                    <span style={{ color: 'var(--t2)' }}>{d.name}</span>
                    <span style={{ fontWeight: 500, color: 'var(--t0)', marginLeft: 'auto' }}>{FMT.format(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      {/* Indicators evolution (only with multiple analyses) */}
      {hasMultiple && (
        <div style={{ marginBottom: 24 }}>
          <ChartCard title="Evolução dos indicadores" subtitle="Por exercício">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={indicatorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--t2)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Liquidez Corrente" stroke={COLORS.blue} strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Endividamento %" stroke={COLORS.red} strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="ROE %" stroke={COLORS.green} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* Key indicators */}
      {latest && (
        <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16 }}>Indicadores-chave</h3>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>Exercício {latest.year}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {KEY_IND.map(({ label, val, good }) => (
              <div key={label} style={{ padding: '12px 16px', background: 'var(--bg2)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--t0)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {val}
                  {val !== '—' && (
                    <span style={{ fontSize: 10, color: good ? 'var(--green-t)' : 'var(--red-t)' }}>
                      ● {good ? 'Bom' : 'Atenção'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis history */}
      <div style={{ background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16 }}>Histórico de análises</h3>
          <span style={{ fontSize: 13, color: 'var(--t2)' }}>{analyses.length} {analyses.length === 1 ? 'análise' : 'análises'}</span>
        </div>
        {!analyses.length ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--t3)' }}>
            <i className="ti ti-file-off" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: .4 }}></i>
            Nenhuma análise realizada.
          </div>
        ) : (
          [...analyses].sort((a, b) => b.year - a.year).map((a, i) => (
            <div key={a.id}
              onClick={() => navigate(`/app/analyses/${a.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                borderTop: i > 0 ? '1px solid var(--bd)' : 'none', cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 8, background: 'var(--bg2)', border: '1px solid var(--bd)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--blue-text)', flexShrink: 0,
              }}>
                {a.year}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t0)' }}>Exercício {a.year}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                  {new Date(a.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <span className="pill pill-g">Concluída</span>
              <div onClick={e => e.stopPropagation()}>
                <button className="ib ib-d" title="Excluir" onClick={() => setConfirm({
                  title: `Excluir análise ${a.year}?`,
                  message: 'Esta ação é irreversível.',
                  danger: true, confirmLabel: 'Excluir',
                  onConfirm: () => deleteAnalysis(a),
                })}>
                  <i className="ti ti-trash"></i>
                </button>
              </div>
              <i className="ti ti-chevron-right" style={{ color: 'var(--t3)', flexShrink: 0 }}></i>
            </div>
          ))
        )}
      </div>

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
