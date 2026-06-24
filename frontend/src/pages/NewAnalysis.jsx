import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile, ApiError } from '../lib/api.js';

const STEPS = [
  { n: 1, label: 'Cliente' },
  { n: 2, label: 'Upload' },
  { n: 3, label: 'Processamento' },
];

export default function NewAnalysis() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [search, setSearch] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);

  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.clients || []))
      .catch(() => {})
      .finally(() => setLoadingClients(false));
  }, []);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.cnpj || '').includes(search)
  );

  const selectedClient = clients.find(c => c.id === clientId);

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
      navigate(`/app/analyses/${saved.analysis.id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao processar. Tente novamente.');
      setProcessing(false);
      setStep(2);
    }
  }

  return (
    <div className="page-body" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
      <button className="back" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        <i className="ti ti-arrow-left"></i> Voltar
      </button>

      <h1 style={{ marginBottom: 8 }}>Nova análise</h1>
      <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 32 }}>
        Suba o balanço da empresa cliente — a IA extrai os dados e calcula os indicadores.
      </p>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
        {STEPS.map((s, i) => (
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
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, margin: '0 16px', background: step > s.n ? 'var(--blue)' : 'var(--bd)' }}></div>
            )}
          </div>
        ))}
      </div>

      {err && <div className="err-banner" style={{ marginBottom: 16 }}>{err}</div>}

      {/* Step 1: Select client */}
      {step === 1 && (
        <div>
          <div className="cl-search" style={{ marginBottom: 16 }}>
            <i className="ti ti-search"></i>
            <input className="inp" placeholder="Buscar cliente ou CNPJ..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loadingClients ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>Carregando...</div>
          ) : !filtered.length ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
              {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
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
            <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--t2)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
              trocar
            </button>
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
    </div>
  );
}
