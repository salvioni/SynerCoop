import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAccountInfo } from '../lib/accountInfo.jsx';
import { useBackNavigate } from '../lib/useBackNavigate.js';
import { getPlan } from '../lib/plans.js';
import ClientFormModal from '../components/ClientFormModal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

const STEPS = [
  { n: 1, label: 'Cliente' },
  { n: 2, label: 'Upload' },
  { n: 3, label: 'Processamento' },
];
const STEPS_SINGLE_ENTITY = STEPS.filter(s => s.n !== 1);

export default function NewAnalysis() {
  const navigate = useNavigate();
  const { user, isSingleEntity } = useAuth();
  const { accountInfo, refetch: refetchAccountInfo } = useAccountInfo();
  const goBack = useBackNavigate('/app/dashboard');
  const [step, setStep] = useState(isSingleEntity ? 2 : 1);
  const [limitMsg, setLimitMsg] = useState(null);

  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(isSingleEntity ? user.self_client_id : '');
  const [search, setSearch] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);

  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [processing, setProcessing] = useState(false);
  const [inadimplencia, setInadimplencia] = useState('');
  const [clientModal, setClientModal] = useState(false);
  const [hintArrow, setHintArrow] = useState(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingPct, setLoadingPct] = useState(0);
  const [aiMsgIdx, setAiMsgIdx] = useState(0);
  const [clientAnalyses, setClientAnalyses] = useState([]);
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

  // Busca análises existentes do cliente selecionado assim que ele é escolhido
  // pra mostrar os períodos já cadastrados ANTES de o usuário perder tempo enviando
  // um arquivo duplicado.
  useEffect(() => {
    if (!clientId) { setClientAnalyses([]); return; }
    api.get(`/analyses?clientId=${clientId}&limit=50`).then(r => setClientAnalyses(r.analyses || [])).catch(() => {});
  }, [clientId]);

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

      // Verificar se o arquivo contém dados financeiros mínimos.
      // Arquivos não financeiros (contratos, atas, relatórios narrativos) ou
      // ilegíveis retornam quase todos os campos como null — mostrar aviso
      // claro em vez de salvar uma análise vazia.
      const bpNonNull = Object.values(ex.bp || {}).filter(v => v != null).length;
      const dspNonNull = Object.values(ex.dsp || {}).filter(v => v != null).length;
      if (bpNonNull + dspNonNull < 3) {
        setErr(
          'Não encontramos dados financeiros neste arquivo. Verifique se é um ' +
          'balanço patrimonial ou demonstrativo de resultado de uma cooperativa, ' +
          'e que o documento está legível. Se o PDF for escaneado (imagem), ' +
          'tente exportar em Excel ou usar um PDF gerado pelo sistema contábil.'
        );
        setProcessing(false);
        setStep(2);
        return;
      }

      const bpClean = {};
      const dspClean = {};
      Object.entries(ex.bp || {}).forEach(([k, v]) => { if (v != null) bpClean[k] = Number(v) || 0; });
      Object.entries(ex.dsp || {}).forEach(([k, v]) => { if (v != null) dspClean[k] = Number(v) || 0; });
      // inadimplência é dado gerencial (não vem do documento) — adicionado
      // separadamente ao DSP quando o usuário informa antes de enviar.
      const inadPct = parseFloat(inadimplencia);
      if (!isNaN(inadPct) && inadPct >= 0) dspClean.inadimplencia_pct = inadPct / 100;
      const saved = await api.post(`/clients/${clientId}/analyses`, {
        bp: bpClean, dsp: dspClean, year: ex.year || new Date().getFullYear(),
        confidence: ex.confidence, notes: ex.notes, detail: ex.detail || null,
        period_label: ex.period_label || null,
      });
      refetchAccountInfo();
      navigate(`/app/analyses/${saved.analysis.id}`, { replace: true });
    } catch (e) {
      // Alguém do mesmo escritório pode ter usado a última análise do mês
      // entre o carregamento desta tela e o clique em "Analisar arquivo" —
      // o servidor é a fonte da verdade do limite, então tratamos esse erro
      // à parte pra mostrar o mesmo aviso bloqueante do check antecipado
      // abaixo, e não só um banner de erro genérico.
      if (e instanceof ApiError && e.fields?.code === 'ANALYSIS_LIMIT_REACHED') {
        setLimitMsg(e.message);
        refetchAccountInfo();
      } else {
        setErr(e instanceof ApiError ? e.message : 'Erro ao processar. Tente novamente.');
      }
      setProcessing(false);
      setStep(2);
    }
  }

  const AI_MESSAGES = [
    'Interpretando margens de sobra…',
    'Analisando liquidez e endividamento…',
    'Calculando índices de rentabilidade…',
    'Avaliando ciclo financeiro…',
    'Redigindo diagnóstico por pilar…',
    'Formulando recomendações estratégicas…',
    'Revisando consistência dos dados…',
    'Finalizando parecer financeiro…',
  ];

  // Avança etapas visuais automaticamente enquanto o step 3 processa
  useEffect(() => {
    if (step !== 3) { setLoadingStep(0); setLoadingPct(0); return; }
    const schedule = [
      { delay: 600,   s: 1, pct: 15 },
      { delay: 4000,  s: 2, pct: 45 },
      { delay: 12000, s: 3, pct: 75 },
      { delay: 24000, s: 4, pct: 92 },
    ];
    const timers = schedule.map(({ delay, s, pct }) =>
      setTimeout(() => { setLoadingStep(s); setLoadingPct(pct); }, delay)
    );
    // Após atingir 92%, avança lentamente até 99% pra não parecer travado
    const creepHandle = { id: null };
    const creepStart = setTimeout(() => {
      let pct = 92;
      creepHandle.id = setInterval(() => {
        pct = Math.min(99, pct + 0.8);
        setLoadingPct(Math.round(pct));
      }, 3000);
    }, 24000);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(creepStart);
      if (creepHandle.id) clearInterval(creepHandle.id);
    };
  }, [step]);

  // Rotaciona mensagens descritivas enquanto a IA está gerando
  useEffect(() => {
    if (loadingStep < 3) { setAiMsgIdx(0); return; }
    const t = setInterval(() => setAiMsgIdx(i => (i + 1) % AI_MESSAGES.length), 3500);
    return () => clearInterval(t);
  }, [loadingStep]);

  const plan = getPlan(accountInfo?.plan);
  const monthlyUsed = accountInfo?.monthlyAnalyses ?? 0;
  const limitReached = plan.limit !== Infinity && monthlyUsed >= plan.limit;
  const blockingMsg = limitMsg || (limitReached
    ? `Você já usou ${monthlyUsed} de ${plan.limit} análises deste mês no plano ${plan.label}. Faça upgrade para continuar ou aguarde a virada do mês.`
    : null);

  if (blockingMsg) {
    return (
      <div className="page-body" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
        <button className="back" onClick={goBack} style={{ marginBottom: 16 }}>
          <i className="ti ti-arrow-left"></i> Voltar
        </button>
        <ConfirmModal
          title="Limite de análises atingido"
          message={blockingMsg}
          confirmLabel="Ver plano"
          onConfirm={() => navigate('/app/settings')}
          onClose={goBack}
        />
      </div>
    );
  }

  return (
    <div className="page-body" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
      <button className="back" onClick={goBack} style={{ marginBottom: 16 }}>
        <i className="ti ti-arrow-left"></i> Voltar
      </button>

      <h1 className="page-h1" style={{ marginBottom: 8 }}>Nova análise</h1>
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
                {step > s.n ? <i className="ti ti-check" style={{ fontSize: 16 }}></i> : i + 1}
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
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500,
                    background: c.logo ? 'transparent' : (c.logo_color || 'var(--blue)'),
                    color: '#fff',
                    ...(c.logo ? { backgroundImage: `url(${c.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
                  }}>
                    {!c.logo && c.name.charAt(0).toUpperCase()}
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

          {clientAnalyses.length > 0 && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, fontSize: 13, color: 'var(--t1)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <i className="ti ti-info-circle" style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }}></i>
              <span>
                Este cliente já tem {clientAnalyses.length === 1 ? 'uma análise' : `${clientAnalyses.length} análises`}:{' '}
                <strong>{clientAnalyses.map(a => a.period_label || String(a.year)).join(', ')}</strong>.
                {' '}Envie apenas se for um período diferente.
              </span>
            </div>
          )}

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

          {/* Campo de inadimplência — dado gerencial que não consta no balanço.
              Relevante especialmente para cooperativas de crédito e análise de
              carteira. Aparece sempre (independente de ter arquivo selecionado)
              pra o usuário poder preencher enquanto escolhe o arquivo. */}
          <div style={{ marginTop: 20, padding: '16px', background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t0)' }}>Taxa de inadimplência</span>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>opcional</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--t2)', margin: '0 0 10px' }}>
              Percentual de inadimplência da carteira — dado gerencial que não consta no balanço.
              Quando informado, aparece nos indicadores de liquidez e na narrativa.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="inp"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0,00"
                value={inadimplencia}
                onChange={e => setInadimplencia(e.target.value)}
                style={{ width: 110 }}
              />
              <span style={{ fontSize: 14, color: 'var(--t2)' }}>%</span>
            </div>
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

      {/* Step 3: Processing — animação de etapas */}
      {step === 3 && (() => {
        const STEPS_LOADING = [
          { icon: 'ti-file-text',   label: 'Lendo o documento' },
          { icon: 'ti-search',      label: 'Identificando campos financeiros' },
          { icon: 'ti-calculator',  label: 'Calculando indicadores' },
          { icon: 'ti-chart-dots',  label: 'Gerando análise financeira' },
        ];
        return (
          <div style={{ paddingTop: 16 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t0)', marginBottom: 4 }}>
                Processando análise de <strong>{selectedClient?.name}</strong>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>Analisando o documento com IA — não feche esta aba</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {STEPS_LOADING.map((s, i) => {
                const done   = loadingStep > i;
                const active = loadingStep === i;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px', borderRadius: 10,
                    background: done ? 'var(--bg1)' : active ? 'var(--bg1)' : 'var(--bg2)',
                    border: `1px solid ${done ? 'var(--bd)' : active ? 'var(--blue)' : 'var(--bd)'}`,
                    opacity: loadingStep < i ? 0.35 : 1,
                    transition: 'opacity .5s, border-color .3s',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? 'var(--green-dim, #d1fae5)' : active ? 'var(--blue-dim, #dbeafe)' : 'var(--bg0)',
                      border: `1.5px solid ${done ? 'var(--green-t, #16a34a)' : active ? 'var(--blue)' : 'var(--bd)'}`,
                      transition: 'background .3s, border-color .3s',
                    }}>
                      {done
                        ? <i className="ti ti-check" style={{ fontSize: 15, color: 'var(--green-t, #16a34a)' }} />
                        : <i className={`ti ${s.icon}`} style={{ fontSize: 15, color: active ? 'var(--blue)' : 'var(--t3)' }} />
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{
                        fontSize: 14, display: 'block',
                        fontWeight: done || active ? 500 : 400,
                        color: done || active ? 'var(--t0)' : 'var(--t2)',
                        transition: 'color .3s',
                      }}>{s.label}</span>
                      {active && i === 3 && (
                        <span style={{ fontSize: 11, color: 'var(--t2)', display: 'block', marginTop: 3, transition: 'opacity .4s' }}>
                          {AI_MESSAGES[aiMsgIdx]}
                        </span>
                      )}
                    </div>
                    {active && <i className="ti ti-loader" style={{ fontSize: 16, color: 'var(--blue)', animation: 'spin .8s linear infinite', flexShrink: 0 }} />}
                    {done  && <i className="ti ti-circle-check" style={{ fontSize: 16, color: 'var(--green-t, #16a34a)', flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>

            {/* Barra de progresso estimada */}
            <div style={{ background: 'var(--bg2)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 999,
                background: 'linear-gradient(90deg, var(--blue) 0%, var(--gold) 100%)',
                width: `${loadingPct}%`, transition: 'width 1.8s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Extraindo e calculando…</span>
              <span style={{ fontSize: 11, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>{loadingPct}%</span>
            </div>
          </div>
        );
      })()}

      {clientModal && (
        <ClientFormModal client={null} onClose={() => setClientModal(false)} onSaved={onClientCreated} />
      )}
    </div>
  );
}
