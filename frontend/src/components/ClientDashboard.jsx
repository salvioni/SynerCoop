import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import ConfirmModal from './ConfirmModal.jsx';
import { AVATAR_COLORS, initials } from './UserAvatar.jsx';
import { CLIENT_TYPES } from '../lib/constants.js';
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
        <h3 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.01em' }}>{title}</h3>
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

// Painel de análises de um único cliente — usado tanto em ClientView.jsx
// (rota /app/clients/:id, com navegação de volta pra lista) quanto em
// Dashboard.jsx para contas de entidade única (cooperativa/empresa/etc,
// que não têm uma carteira de clientes — a própria organização É o cliente).
export default function ClientDashboard({ clientId, backHref, allowDelete = true }) {
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({});
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const logoRef = useRef(null);

  useEffect(() => {
    api.get(`/clients/${clientId}`)
      .then(d => { setClient(d.client); setAnalyses(d.analyses || []); })
      .catch(() => { if (backHref) navigate(backHref, { replace: true }); })
      .finally(() => setLoading(false));
  }, [clientId]);

  function openEdit() {
    setForm({ name: client.name, cnpj: client.cnpj || '', type: client.type || 'cooperativa', contact_email: client.contact_email || '', contact_phone: client.contact_phone || '', notes: client.notes || '', logo: client.logo || null, logo_color: client.logo_color || null });
    setErrs({}); setErr(''); setEditModal(true);
  }

  function pickLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(p => ({ ...p, logo: ev.target.result, logo_color: null }));
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function saveEdit() {
    if (!form.name?.trim()) { setErrs({ name: 'Informe o nome.' }); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.put(`/clients/${clientId}`, form);
      setClient(r.client);
      setEditModal(false);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrs(e.fields);
      else setErr(e.message || 'Erro ao salvar.');
    } finally { setBusy(false); }
  }

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
    <div className="page-body">
      {backHref && (
        <button className="back" onClick={() => navigate(backHref)} style={{ marginBottom: 16 }}>
          <i className="ti ti-arrow-left"></i> Clientes
        </button>
      )}

      {/* Client header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div className="cl-card-av" style={{
          width: 56, height: 56, borderRadius: 12, fontSize: 18, flexShrink: 0,
          ...(client.logo ? { backgroundImage: `url(${client.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : client.logo_color ? { background: client.logo_color } : {}),
        }}>
          {!client.logo && initials(client.name)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 56 }}>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1, fontWeight: 500 }}>{client.name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14, color: 'var(--t2)' }}>
            <span style={{ textTransform: 'capitalize' }}>{client.type || 'empresa'}</span>
            {client.cnpj && <span style={{ fontFamily: 'ui-monospace, monospace' }}>{client.cnpj}</span>}
            {client.contact_email && <span><i className="ti ti-mail" style={{ fontSize: 14, marginRight: 4 }}></i>{client.contact_email}</span>}
          </div>
        </div>
      </div>
      <button className="ib" title="Editar cliente" onClick={openEdit} style={{ color: 'var(--t2)', fontSize: 26 }}><i className="ti ti-edit"></i></button>
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
        <div className="grid-2" style={{ marginBottom: 24 }}>
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
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={compositionData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                    {compositionData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {compositionData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }}></div>
                    <span style={{ color: 'var(--t2)' }}>{d.name}</span>
                    <span style={{ fontWeight: 500, color: 'var(--t0)', marginLeft: 'auto' }}>{FMT.format(d.value)}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}

          <ChartCard title="Resultado (DSP)" subtitle={`Exercício ${latest.year}`}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={dspData} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                  {dspData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              {dspData.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }}></div>
                  <span style={{ color: 'var(--t2)' }}>{d.name}</span>
                  <span style={{ fontWeight: 500, color: 'var(--t0)', marginLeft: 'auto' }}>{FMT.format(d.value)}</span>
                </div>
              ))}
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
            <h3 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.01em' }}>Indicadores-chave</h3>
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>Exercício {latest.year}</span>
          </div>
          <div className="grid-3">
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
          <h3 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.01em' }}>Histórico de análises</h3>
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

      {editModal && (
        <div className="overlay" onClick={e => { if (e.target === e.currentTarget) setEditModal(false); }}>
          <div className="modal">
            <div className="modal-head">
              <span className="modal-title">Editar cliente</span>
              <button className="modal-close" onClick={() => setEditModal(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body">
              {err && <div className="err-banner">{err}</div>}
              <div className="inp-wrap" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="cl-logo-pick" onClick={() => logoRef.current?.click()}>
                  <div className="cl-card-av" style={{ width: 56, height: 56, borderRadius: 14, fontSize: 18, ...(form.logo ? { backgroundImage: `url(${form.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : form.logo_color ? { background: form.logo_color } : {}) }}>
                    {!form.logo && initials(form.name)}
                  </div>
                  <div className="cl-logo-pick-ov" style={{ borderRadius: 14 }}>
                    <i className="ti ti-camera" style={{ fontSize: 18, color: '#fff' }}></i>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t0)', marginBottom: 8 }}>Logo <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(opcional)</span></div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {AVATAR_COLORS.map(c => (
                      <button key={c.value} type="button" title={c.label} onClick={() => setForm(p => ({ ...p, logo_color: c.value, logo: null }))} style={{ width: 22, height: 22, borderRadius: '50%', background: c.value, border: form.logo_color === c.value ? '2px solid var(--gold)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                  {(form.logo || form.logo_color) && (
                    <button type="button" style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--red-t)', cursor: 'pointer' }} onClick={() => setForm(p => ({ ...p, logo: null, logo_color: null }))}>
                      Remover
                    </button>
                  )}
                </div>
                <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickLogo} />
              </div>
              <div className="inp-wrap">
                <label className="inp-label">Nome *</label>
                <input className={`inp${errs.name ? ' inp-err' : ''}`} value={form.name || ''} onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrs(p => ({ ...p, name: '' })); }} autoFocus />
                {errs.name && <div className="inp-hint">{errs.name}</div>}
              </div>
              <div className="inp-wrap">
                <label className="inp-label">Tipo</label>
                <select className="inp" value={form.type || 'cooperativa'} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {CLIENT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div className="inp-wrap">
                <label className="inp-label">CNPJ</label>
                <input className="inp" placeholder="00.000.000/0001-00" value={form.cnpj || ''} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))} />
              </div>
              <div className="inp-wrap">
                <label className="inp-label">E-mail de contato</label>
                <input className="inp" type="email" value={form.contact_email || ''} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
              </div>
              <div className="inp-wrap">
                <label className="inp-label">Telefone</label>
                <input className="inp" value={form.contact_phone || ''} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
              </div>
              <div className="inp-wrap" style={{ marginBottom: 0 }}>
                <label className="inp-label">Observações</label>
                <textarea className="inp" rows={2} style={{ resize: 'vertical' }} value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-foot" style={{ justifyContent: allowDelete ? 'space-between' : 'flex-end' }}>
              {allowDelete && (
                <button className="btn btn-d" onClick={() => { setEditModal(false); setConfirm({ title: 'Excluir cliente', message: `"${client.name}" será removido permanentemente.`, confirmLabel: 'Excluir', danger: true, onConfirm: async () => { try { await api.del(`/clients/${clientId}`); navigate(backHref || '/app/clients'); } catch (e) { alert(e.message); } } }); }}>
                  <i className="ti ti-trash"></i> Excluir cliente
                </button>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => setEditModal(false)}>Cancelar</button>
                <button className="btn btn-p" onClick={saveEdit} disabled={busy}>{busy ? 'Salvando…' : <><i className="ti ti-check"></i> Salvar</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
