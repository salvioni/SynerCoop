import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, uploadFile, ApiError } from '../lib/api.js';

const STEPS = ['Selecionar cliente', 'Enviar arquivo', 'Confirmar e salvar'];

export default function NewAnalysis() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedClientId = params.get('clientId');

  const [step, setStep] = useState(preselectedClientId ? 1 : 0);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || '');
  const [clientSearch, setClientSearch] = useState('');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractErr, setExtractErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/clients').then(d => setClients(d.clients || [])).catch(() => {});
  }, []);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const filteredClients = clients.filter(c =>
    !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Step 1: file select
  function onFileSelect(f) {
    if (!f) return;
    const allowed = ['.pdf', '.xlsx', '.xls'];
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) { setExtractErr(`Formato não suportado: ${ext}. Use PDF, XLSX ou XLS.`); return; }
    if (f.size > 10 * 1024 * 1024) { setExtractErr('Arquivo muito grande. Limite: 10MB.'); return; }
    setFile(f);
    setExtractErr('');
    setExtracted(null);
  }

  async function doExtract() {
    if (!file || !selectedClientId) return;
    setExtracting(true);
    setExtractErr('');
    try {
      const r = await uploadFile(`/clients/${selectedClientId}/extract`, file);
      setExtracted(r.extracted);
      setStep(2);
    } catch (e) {
      setExtractErr(e.message || 'Erro ao processar o arquivo.');
    } finally { setExtracting(false); }
  }

  async function doSave() {
    if (!extracted || !selectedClientId) return;
    setSaving(true);
    setSaveErr('');
    try {
      const r = await uploadFile(`/clients/${selectedClientId}/analyses`, file, {
        year: extracted.year,
        confidence: extracted.confidence,
        notes: extracted.notes,
      });
      navigate(`/app/analyses/${r.analysis.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && e.message?.includes('Já existe')) {
        setSaveErr(e.message);
      } else {
        setSaveErr(e.message || 'Erro ao salvar análise.');
      }
    } finally { setSaving(false); }
  }

  const confidenceLabel = (c) => {
    if (!c) return null;
    if (c >= 0.85) return { label: 'Alta', cls: 'confidence-high' };
    if (c >= 0.6)  return { label: 'Média', cls: 'confidence-medium' };
    return { label: 'Baixa', cls: 'confidence-low' };
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <button className="back-btn" onClick={() => navigate(-1)}>
        <i className="ti ti-arrow-left"></i> Voltar
      </button>

      <div className="ph" style={{ marginTop: '.75rem' }}>
        <div>
          <h1 className="pt">Nova análise financeira</h1>
          <div className="ps">Envie um arquivo PDF ou Excel com os dados financeiros</div>
        </div>
      </div>

      {/* Step wizard */}
      <div className="step-wizard" style={{ marginBottom: '1.5rem' }}>
        {STEPS.map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div className={`step-circle ${i === step ? 'step-item active' : i < step ? 'step-item done' : ''}`}
                style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${i <= step ? '#1D9E75' : 'var(--color-border-secondary)'}`, background: i === step ? '#1D9E75' : i < step ? 'var(--color-background-success)' : 'var(--color-background-primary)', color: i === step ? '#fff' : i < step ? 'var(--color-text-success)' : 'var(--color-text-tertiary)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i < step ? <i className="ti ti-check"></i> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === step ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', fontWeight: i === step ? 500 : 400, whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? '#1D9E75' : 'var(--color-border-tertiary)', margin: '0 8px', marginBottom: 20 }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Select client */}
      {step === 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: '1rem' }}>Selecione o cliente</div>
          <div className="filter-group" style={{ marginBottom: '1rem' }}>
            <div className="filter-icon"><i className="ti ti-search"></i></div>
            <input className="filter-text" placeholder="Buscar cliente…"
              value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredClients.map(c => (
              <div key={c.id} onClick={() => setSelectedClientId(c.id)}
                style={{ padding: '10px 14px', borderRadius: 'var(--border-radius-md)', border: `1.5px solid ${selectedClientId === c.id ? '#1D9E75' : 'var(--color-border-tertiary)'}`, background: selectedClientId === c.id ? 'var(--color-background-success)' : 'var(--color-background-primary)', cursor: 'pointer', transition: '.15s' }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{c.type}{c.cnpj ? ` · ${c.cnpj}` : ''}</div>
              </div>
            ))}
            {!filteredClients.length && (
              <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13, padding: '1rem' }}>
                Nenhum cliente encontrado.
              </div>
            )}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" onClick={() => navigate('/app/clients')}>Cancelar</button>
            <button className="btn btn-p" disabled={!selectedClientId} onClick={() => setStep(1)}>
              Continuar <i className="ti ti-arrow-right"></i>
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div>
          {selectedClient && (
            <div className="lnot" style={{ marginBottom: '1rem' }}>
              <i className="ti ti-building"></i>
              <span>Cliente: <strong>{selectedClient.name}</strong></span>
            </div>
          )}

          <div
            className={`upload-area ${dragging ? 'drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); onFileSelect(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls"
              onChange={e => onFileSelect(e.target.files[0])} />
            <div className="upload-area-icon">
              <i className={`ti ${file ? 'ti-file-check' : 'ti-upload'}`}></i>
            </div>
            {file ? (
              <>
                <div className="upload-area-text" style={{ color: 'var(--color-text-success)' }}>{file.name}</div>
                <div className="upload-area-sub">{(file.size / 1024).toFixed(0)} KB · Clique para trocar</div>
              </>
            ) : (
              <>
                <div className="upload-area-text">Arraste ou clique para enviar</div>
                <div className="upload-area-sub">PDF, XLSX ou XLS — máximo 10MB</div>
              </>
            )}
          </div>

          {extractErr && <div className="form-err" style={{ marginTop: '1rem' }}>{extractErr}</div>}

          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button className="btn" onClick={() => { setStep(0); setFile(null); setExtractErr(''); }}>
              <i className="ti ti-arrow-left"></i> Voltar
            </button>
            <button className="btn btn-p" disabled={!file || extracting} onClick={doExtract}>
              {extracting ? <><i className="ti ti-loader"></i> Processando…</> : <><i className="ti ti-sparkles"></i> Extrair com IA</>}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review and save */}
      {step === 2 && extracted && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Dados extraídos — {extracted.year}</div>
              {confidenceLabel(extracted.confidence) && (
                <span className={`sb ${confidenceLabel(extracted.confidence).cls}`}>
                  Confiança {confidenceLabel(extracted.confidence).label}
                </span>
              )}
            </div>
            {extracted.notes && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: '.75rem' }}>
                <i className="ti ti-info-circle"></i> {extracted.notes}
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              Balanço Patrimonial — resumo
            </div>
            <div className="mrow" style={{ marginBottom: '1rem' }}>
              {[
                { label: 'Ativo Total', val: extracted.bp?.total_ativo },
                { label: 'Ativo Circulante', val: extracted.bp?.ativo_circulante },
                { label: 'Passivo Circulante', val: extracted.bp?.passivo_circulante },
                { label: 'Patrimônio Líquido', val: extracted.bp?.patrimonio_liquido },
              ].map(({ label, val }) => (
                <div key={label} className="mc">
                  <div className="ml">{label}</div>
                  <div className="mv" style={{ fontSize: 16 }}>
                    {val != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(val) : '—'}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
              DSP — resumo
            </div>
            <div className="mrow">
              {[
                { label: 'Receita Bruta', val: extracted.dsp?.receita_bruta },
                { label: 'Receita Líquida', val: extracted.dsp?.receita_liquida },
                { label: 'EBITDA', val: extracted.dsp?.ebitda },
                { label: 'Sobras/Perdas', val: extracted.dsp?.sobras_perdas },
              ].map(({ label, val }) => (
                <div key={label} className="mc">
                  <div className="ml">{label}</div>
                  <div className="mv" style={{ fontSize: 16, color: val != null && val < 0 ? 'var(--color-text-danger)' : undefined }}>
                    {val != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(val) : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {saveErr && <div className="form-err" style={{ marginBottom: '1rem' }}>{saveErr}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button className="btn" onClick={() => setStep(1)}>
              <i className="ti ti-arrow-left"></i> Voltar
            </button>
            <button className="btn btn-p" disabled={saving} onClick={doSave}>
              {saving ? 'Salvando…' : <><i className="ti ti-device-floppy"></i> Salvar análise</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
