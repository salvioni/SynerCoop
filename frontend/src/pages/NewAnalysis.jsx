import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAccountInfo } from '../lib/accountInfo.jsx';
import { useBackNavigate } from '../lib/useBackNavigate.js';
import ClientFormModal from '../components/ClientFormModal.jsx';

const STEPS = [
  { n: 1, label: 'Cliente' },
  { n: 2, label: 'Upload' },
  { n: 3, label: 'Processamento' },
];
const STEPS_SINGLE_ENTITY = STEPS.filter(s => s.n !== 1);

export default function NewAnalysis() {
  const navigate = useNavigate();
  const { user, isSingleEntity } = useAuth();
  const { refetch: refetchAccountInfo } = useAccountInfo();
  const goBack = useBackNavigate('/app/dashboard');
  const [step, setStep] = useState(isSingleEntity ? 2 : 1);

  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(isSingleEntity ? user.self_client_id : '');
  const [search, setSearch] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);

  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [processing, setProcessing] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const [hintArrow, setHintArrow] = useState(null);
  const fileRef = useRef(null);
  const step1WrapRef = useRef(null);
  const addClientBtnRef = useRef(null);
  const emptyTextRef = useRef(null);

  useEffect(() => {
    const req = isSingleEntity
      ? api.get(`/clients/${user.self_client_id}`).then(r => [r.client])
      : api.get('/clients?active=1').then(r => r.clients || []);
    req.then(setClients).catch(() => {}).finally(() => setLoadingClients(false));
  }, [isSingleEntity]);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.cnpj || '').includes(search)
  );

  const selectedClient = clients.find(c => c.id === clientId);

  const showEmptyHint = step === 1 && !loadingClients && !search && !filtered.length;

  useEffect(() => {
    if (!showEmptyHint) { setHintArrow(null); return; }
    const wrap = step1WrapRef.current;
    if (!wrap) return;

    function measure() {
      const btn = addClientBtnRef.current;
      const text = emptyTextRef.current;
      if (!btn || !text) return;
      const wrapRect = wrap.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const textRect = text.getBoundingClientRect();

      const x1 = textRect.right - wrapRect.left + 24;
      const y1 = textRect.top + textRect.height / 2 - wrapRect.top;
      const x2 = btnRect.left + btnRect.width / 2 - wrapRect.left;
      const y2 = btnRect.bottom - wrapRect.top + 16;
      const dx = x2 - x1;
      const rise = Math.max(y1 - y2, 1);
      // formato de "gancho": começo bem reto/quase horizontal saindo do
      // texto, e só sobe forte perto do botão.
      const c1x = x1 + dx * 0.45;
      const c1y = y1 + rise * 0.05;
      const c2x = x1 + dx * 0.9;
      const c2y = y1 - rise * 0.15;

      setHintArrow({ d: `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}` });
    }

    measure();
    // ResizeObserver cobre qualquer mudança de layout dentro do wrap (não só
    // resize da janela) — ex.: sidebar recolhendo, fonte carregando — com o
    // throttling de frame já embutido no browser, sem precisar de debounce manual.
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [showEmptyHint]);

  function onClientCreated(client) {
    setClients(p => [...p, client]);
    setClientId(client.id);
    setClientModal(false);
    setSearch('');
    setStep(2);
  }

  function selectFile(f) {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['pdf', 'xlsx', 'xls'].includes(ext)) {
      setErr('Formato não suportado. Use PDF, XLSX ou XLS.');
      return;
    }
    setFile(f);
    setErr('');
  }

  async function doAnalyze() {
    if (!file || !clientId) return;
    setProcessing(true);
    setStep(3);
    setErr('');
    try {
      const r = await uploadFile(`/clients/${clientId}/extract`, file);
      const ex = r.extracted;
      const bpClean = {};
      const dspClean = {};
      Object.entries(ex.bp || {}).forEach(([k, v]) => { if (v != null) bpClean[k] = Number(v) || 0; });
      Object.entries(ex.dsp || {}).forEach(([k, v]) => { if (v != null) dspClean[k] = Number(v) || 0; });
      const saved = await api.post(`/clients/${clientId}/analyses`, {
        bp: bpClean, dsp: dspClean, year: ex.year || new Date().getFullYear(),
        confidence: ex.confidence, notes: ex.notes,
      });
      refetchAccountInfo();
      navigate(`/app/analyses/${saved.analysis.id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao processar. Tente novamente.');
      setProcessing(false);
      setStep(2);
    }
  }

  return (
    <div className="page-body" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
      <button className="back" onClick={goBack} style={{ marginBottom: 16 }}>
        <i className="ti ti-arrow-left"></i> Voltar
      </button>

      <h1 style={{ marginBottom: 8 }}>Nova análise</h1>
      <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 32 }}>
        Suba o balanço da empresa cliente — a IA extrai os dados e calcula os indicadores.
      </p>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
        {(isSingleEntity ? STEPS_SINGLE_ENTITY : STEPS).map((s, i, arr) => (
          <div key={s.n} style={{ display: 'contents' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 500,
                background: step >= s.n ? 'var(--blue)' : 'var(--bg2)',
                color: step >= s.n ? '#fff' : 'var(--t3)',
                border: step >= s.n ? 'none' : '1px solid var(--bd)',
              }}>
                {step > s.n ? <i className="ti ti-check" style={{ fontSize: 16 }}></i> : s.n}
              </div>
              <span style={{ fontSize: 14, fontWeight: step === s.n ? 500 : 400, color: step >= s.n ? 'var(--t0)' : 'var(--t3)' }}>
                {s.label}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div style={{ flex: 1, height: 1, margin: '0 16px', background: step > s.n ? 'var(--blue)' : 'var(--bd)' }}></div>
            )}
          </div>
        ))}
      </div>

      {err && <div className="err-banner" style={{ marginBottom: 16 }}>{err}</div>}

      {/* Step 1: Select client */}
      {step === 1 && (
        <div ref={step1WrapRef} style={{ position: 'relative' }}>
          {hintArrow && (
            <svg width="100%" height="100%"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <defs>
                <marker id="hint-arrowhead" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="var(--t3)" />
                </marker>
              </defs>
              <path d={hintArrow.d} fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#hint-arrowhead)" />
            </svg>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div className="cl-search" style={{ flex: 1 }}>
              <i className="ti ti-search"></i>
              <input className="inp" placeholder="Buscar cliente ou CNPJ..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button ref={addClientBtnRef} className="btn" onClick={() => setClientModal(true)}>
              <i className="ti ti-plus"></i> Adicionar cliente
            </button>
          </div>

          {loadingClients ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Carregando...</div>
          ) : !filtered.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
              <span ref={emptyTextRef}>{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente ativo.'}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(c => (
                <button key={c.id} onClick={() => { setClientId(c.id); setStep(2); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    background: 'var(--bg1)', border: '1px solid var(--bd)',
                    borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'border-color .12s',
                  }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: 'var(--blue)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, flexShrink: 0,
                  }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t0)' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                      {c.type}{c.cnpj ? ` · ${c.cnpj}` : ''}
                    </div>
                  </div>
                  <i className="ti ti-chevron-right" style={{ color: 'var(--t3)' }}></i>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Upload */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-building" style={{ fontSize: 16 }}></i>
            <span style={{ fontWeight: 500, color: 'var(--t0)' }}>{selectedClient?.name}</span>
            {!isSingleEntity && (
              <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--t2)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
                trocar
              </button>
            )}
          </div>

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
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { setFile(null); setErr(''); }}>
                Remover
              </button>
              <button className="btn btn-p" style={{ flex: 2, justifyContent: 'center' }}
                onClick={doAnalyze}>
                <i className="ti ti-sparkles"></i> Analisar arquivo
              </button>
            </div>
          )}

        </div>
      )}

      {/* Step 3: Processing */}
      {step === 3 && (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <i className="ti ti-loader" style={{ fontSize: 40, color: 'var(--gold)', display: 'block', marginBottom: 16, animation: 'spin .8s linear infinite' }}></i>
          <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--t0)', marginBottom: 8 }}>Processando análise...</div>
          <p style={{ fontSize: 14, color: 'var(--t2)' }}>
            Extraindo dados e calculando indicadores de <strong>{selectedClient?.name}</strong>
          </p>
        </div>
      )}

      {clientModal && (
        <ClientFormModal client={null} onClose={() => setClientModal(false)} onSaved={onClientCreated} />
      )}
    </div>
  );
}
