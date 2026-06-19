import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, uploadFile, ApiError } from '../lib/api.js';
import ConfirmModal from '../components/ConfirmModal.jsx';

const BP_FIELDS = [
  { k: 'ativo_circulante',    label: 'Ativo Circulante' },
  { k: 'estoques',            label: 'Estoques' },
  { k: 'disponibilidades',    label: 'Disponibilidades' },
  { k: 'clientes',            label: 'Clientes / Recebíveis' },
  { k: 'ativo_realizavel_lp', label: 'Realizável Longo Prazo' },
  { k: 'ativo_permanente',    label: 'Ativo Permanente' },
  { k: 'total_ativo',         label: 'Total do Ativo' },
  { k: 'passivo_circulante',  label: 'Passivo Circulante' },
  { k: 'passivo_exigivel_lp', label: 'Exigível Longo Prazo' },
  { k: 'patrimonio_liquido',  label: 'Patrimônio Líquido' },
  { k: 'capital_integralizado', label: 'Capital Integralizado' },
  { k: 'total_passivo_pl',    label: 'Total Passivo + PL' },
];

const DSP_FIELDS = [
  { k: 'ingressos',             label: 'Ingressos / Rec. Bruta' },
  { k: 'receita_bruta',         label: 'Receita Bruta' },
  { k: 'receita_liquida',       label: 'Receita Líquida' },
  { k: 'cmv',                   label: 'CMV / CMO' },
  { k: 'lucro_bruto',           label: 'Lucro Bruto' },
  { k: 'despesas_operacionais', label: 'Despesas Operacionais' },
  { k: 'resultado_antes_ir',    label: 'Resultado Antes IR' },
  { k: 'imposto_renda',         label: 'Imposto de Renda' },
  { k: 'sobras_perdas',         label: 'Sobras / Perdas' },
  { k: 'depreciacao_amortizacao', label: 'Depreciação / Amort.' },
];

function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function fmtInp(v) {
  if (v == null) return '';
  return String(v);
}

function confClass(c) {
  if (!c) return '';
  if (c >= 0.85) return 'conf-hi';
  if (c >= 0.6) return 'conf-mid';
  return 'conf-lo';
}

const SUSPICIOUS_BP = new Set(['total_ativo', 'total_passivo_pl', 'patrimonio_liquido']);
const SUSPICIOUS_DSP = new Set(['receita_liquida', 'ingressos', 'receita_bruta']);

function isSuspicious(section, k, v) {
  const isZeroLike = (v === 0 || v === '0' || v === '' || v == null);
  if (section === 'bp') return SUSPICIOUS_BP.has(k) && isZeroLike;
  if (section === 'dsp') return SUSPICIOUS_DSP.has(k) && isZeroLike;
  return false;
}

function Stepper({ phase }) {
  const s1 = phase === 'idle' ? 'step-active' : 'step-done';
  const s2 = phase === 'reviewing' ? 'step-active' : phase === 'saving' ? 'step-done' : 'step-todo';
  const s3 = phase === 'saving' ? 'step-active' : 'step-todo';
  return (
    <div className="stepper">
      <div className={`step-item ${s1}`}>
        <div className="step-circle">{s1 === 'step-done' ? '✓' : '1'}</div>
        <span className="step-label">1. Arquivo</span>
      </div>
      <div className={`step-line${s2 !== 'step-todo' ? ' line-done' : ''}`}></div>
      <div className={`step-item ${s2}`}>
        <div className="step-circle">{s2 === 'step-done' ? '✓' : '2'}</div>
        <span className="step-label">2. Conferir dados</span>
      </div>
      <div className={`step-line${s3 !== 'step-todo' ? ' line-done' : ''}`}></div>
      <div className={`step-item ${s3}`}>
        <div className="step-circle">{s3 === 'step-done' ? '✓' : '3'}</div>
        <span className="step-label">3. Ver análise</span>
      </div>
    </div>
  );
}

export default function ClientView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);

  // upload state machine: idle | processing | reviewing | saving
  const [phase, setPhase] = useState('idle');
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  // review state
  const [year, setYear] = useState(new Date().getFullYear());
  const [bp, setBp] = useState({});
  const [dsp, setDsp] = useState({});
  const [confidence, setConfidence] = useState(null);
  const [extractNotes, setExtractNotes] = useState('');

  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get(`/clients/${id}`)
      .then(d => { setClient(d.client); setAnalyses(d.analyses || []); })
      .catch(() => navigate('/app/clients', { replace: true }))
      .finally(() => setLoading(false));
  }, [id]);

  function selectFile(f) {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['pdf', 'xlsx', 'xls'].includes(ext)) {
      setUploadErr('Formato não suportado. Use PDF, XLSX ou XLS.');
      return;
    }
    setFile(f);
    setUploadErr('');
  }

  async function doExtract() {
    if (!file) return;
    setPhase('processing');
    setUploadErr('');
    try {
      const r = await uploadFile(`/clients/${id}/extract`, file);
      const ex = r.extracted;
      setBp(ex.bp || {});
      setDsp(ex.dsp || {});
      setYear(ex.year || new Date().getFullYear());
      setConfidence(ex.confidence ?? null);
      setExtractNotes(ex.notes || '');
      setPhase('reviewing');
    } catch (e) {
      setUploadErr(e instanceof ApiError ? e.message : 'Erro ao extrair dados.');
      setPhase('idle');
    }
  }

  async function doSave() {
    setPhase('saving');
    try {
      const bpClean = {};
      const dspClean = {};
      BP_FIELDS.forEach(({ k }) => { const v = toNum(bp[k]); if (v !== null) bpClean[k] = v; });
      DSP_FIELDS.forEach(({ k }) => { const v = toNum(dsp[k]); if (v !== null) dspClean[k] = v; });

      const r = await api.post(`/clients/${id}/analyses`, {
        bp: bpClean, dsp: dspClean, year: Number(year), confidence, notes: extractNotes || undefined,
      });
      navigate(`/app/analyses/${r.analysis.id}`, { replace: true });
    } catch (e) {
      setUploadErr(e instanceof ApiError ? e.message : 'Erro ao salvar análise.');
      setPhase('reviewing');
    }
  }

  function cancelReview() {
    setPhase('idle');
    setFile(null);
    setUploadErr('');
  }

  async function deleteAnalysis(a) {
    setConfirm(null);
    try {
      await api.del(`/analyses/${a.id}`);
      setAnalyses(prev => prev.filter(x => x.id !== a.id));
    } catch (e) { alert(e.message); }
  }

  if (loading) return null;
  if (!client) return null;

  // ——— REVIEWING PHASE ———
  if (phase === 'reviewing' || phase === 'saving') {
    return (
      <>
        <div className="page-head">
          <div className="page-head-l">
            <h1>Revisar extração</h1>
            <p>{client.name}</p>
          </div>
          {phase === 'reviewing' && (
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn" onClick={cancelReview}>Cancelar</button>
              <button className="btn btn-p" onClick={doSave}>
                <i className="ti ti-check"></i> Confirmar e Salvar
              </button>
            </div>
          )}
        </div>

        <div className="page-body">
          {phase === 'saving' ? (
            <>
              <Stepper phase="saving" />
              <div className="processing">
                <i className="ti ti-loader"></i>
                Salvando análise…
              </div>
            </>
          ) : (
            <>
              <Stepper phase="reviewing" />

              {uploadErr && <div className="err-banner">{uploadErr}</div>}

              <div className="review-hint">
                <i className="ti ti-sparkles"></i>
                <p>
                  <strong>A IA extraiu os dados automaticamente.</strong>{' '}
                  Confira os valores e corrija qualquer número errado antes de continuar.
                  Campos com borda amarela merecem atenção.
                </p>
              </div>

              <div className="review-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {confidence != null && (
                    <span className={`conf-badge ${confClass(confidence)}`}>
                      <i className="ti ti-sparkles"></i> {(confidence * 100).toFixed(0)}% confiança
                    </span>
                  )}
                  {extractNotes && (
                    <span style={{ fontSize: 11, color: 'var(--yellow-t)' }}>
                      <i className="ti ti-info-circle"></i> {extractNotes}
                    </span>
                  )}
                </div>
                <div className="review-year">
                  <label htmlFor="rev-year">Ano fiscal:</label>
                  <input id="rev-year" className="year-inp" type="number" value={year}
                    onChange={e => setYear(e.target.value)} min={2000} max={2099} />
                </div>
              </div>

              <div className="rv-sect">
                <div className="rv-sect-title">Balanço Patrimonial (BP)</div>
                <div className="rv-grid">
                  {BP_FIELDS.map(({ k, label }) => {
                    const warn = isSuspicious('bp', k, bp[k]);
                    return (
                      <div key={k} className="rv-cell">
                        <label htmlFor={`bp-${k}`}>{label}</label>
                        <input id={`bp-${k}`} className={`rv-inp${warn ? ' rv-warn' : ''}`} type="number"
                          value={fmtInp(bp[k])}
                          onChange={e => setBp(p => ({ ...p, [k]: e.target.value }))}
                          placeholder="0" />
                        {warn && <div className="rv-warn-note"><i className="ti ti-alert-triangle"></i> Verificar</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rv-sect">
                <div className="rv-sect-title">Demonstração do Resultado (DSP)</div>
                <div className="rv-grid">
                  {DSP_FIELDS.map(({ k, label }) => {
                    const warn = isSuspicious('dsp', k, dsp[k]);
                    return (
                      <div key={k} className="rv-cell">
                        <label htmlFor={`dsp-${k}`}>{label}</label>
                        <input id={`dsp-${k}`} className={`rv-inp${warn ? ' rv-warn' : ''}`} type="number"
                          value={fmtInp(dsp[k])}
                          onChange={e => setDsp(p => ({ ...p, [k]: e.target.value }))}
                          placeholder="0" />
                        {warn && <div className="rv-warn-note"><i className="ti ti-alert-triangle"></i> Verificar</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ paddingTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 7 }}>
                <button className="btn" onClick={cancelReview}>Cancelar</button>
                <button className="btn btn-p" onClick={doSave}>
                  <i className="ti ti-check"></i> Confirmar e Salvar
                </button>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  // ——— IDLE / PROCESSING PHASE ———
  return (
    <>
      <div className="page-head">
        <div className="page-head-l">
          <button className="back" onClick={() => navigate('/app/clients')}>
            <i className="ti ti-arrow-left"></i> Clientes
          </button>
          <h1>{client.name}</h1>
          <p>{client.type}{client.cnpj ? ` · ${client.cnpj}` : ''}</p>
        </div>
      </div>

      <div className="page-body">
        {phase === 'processing' ? (
          <div className="processing">
            <i className="ti ti-loader"></i>
            Extraindo dados do arquivo…
          </div>
        ) : (
          <>
            {uploadErr && <div className="err-banner">{uploadErr}</div>}

            {/* Upload zone */}
            <div
              className={`upload-zone${drag ? ' drag' : ''}`}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); selectFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls"
                onChange={e => selectFile(e.target.files[0])} />
              <div className="uz-icon"><i className="ti ti-cloud-upload"></i></div>
              {file ? (
                <>
                  <div className="uz-title uz-file"><i className="ti ti-file-check"></i> {file.name}</div>
                  <div className="uz-sub">Clique para trocar o arquivo</div>
                </>
              ) : (
                <>
                  <div className="uz-title">Arraste o arquivo aqui ou clique para selecionar</div>
                  <div className="uz-sub">PDF, XLSX ou XLS · máx. 50 MB</div>
                </>
              )}
            </div>

            {file && (
              <div style={{ display: 'flex', gap: 7, marginBottom: 16 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => { setFile(null); setUploadErr(''); }}>
                  <i className="ti ti-x"></i> Remover arquivo
                </button>
                <button className="btn btn-p" style={{ flex: 2, justifyContent: 'center' }} onClick={doExtract}>
                  <i className="ti ti-sparkles"></i> Analisar arquivo
                </button>
              </div>
            )}

            {/* Analyses history */}
            <div className="sec-title">Análises anteriores ({analyses.length})</div>
            {!analyses.length ? (
              <div className="cl-empty" style={{ padding: '24px 0' }}>
                <i className="ti ti-file-off"></i>
                Nenhuma análise. Faça upload de um arquivo acima.
              </div>
            ) : (
              <div className="an-list">
                {analyses.map(a => (
                  <div key={a.id} className="an-item" onClick={() => navigate(`/app/analyses/${a.id}`)}>
                    <div className="an-year">{a.year}</div>
                    <div className="an-info">
                      <div className="an-client">{client.name}</div>
                      <div className="an-date">{new Date(a.created_at).toLocaleDateString('pt-BR')}</div>
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
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
