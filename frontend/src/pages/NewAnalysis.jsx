import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, uploadFile, downloadFile, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useAccountInfo } from '../lib/accountInfo.jsx';
import { useBackNavigate } from '../lib/useBackNavigate.js';
import { getPlan, trialStatus } from '../lib/plans.js';
import { limiteMensalMsg, TRIAL_EXPIRADO_MSG } from '../lib/newAnalysis.jsx';
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
  const [clientModal, setClientModal] = useState(false);
  const [hintArrow, setHintArrow] = useState(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [loadingPct, setLoadingPct] = useState(0);
  const [aiMsgIdx, setAiMsgIdx] = useState(0);
  const [clientAnalyses, setClientAnalyses] = useState([]);
  // Resultado da checagem de período pelo nome do arquivo (ver
  // GET /clients/:id/check-period). null = não checado / nada a dizer.
  const [dupWarn, setDupWarn] = useState(null);
  const [forceUpload, setForceUpload] = useState(false);
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
  // Numa conta de entidade única o "cliente" é a própria conta. O nome vindo de
  // /clients foi buscado na montagem da tela e congela — se a pessoa renomear a
  // empresa em Ajustes, esta tela continuaria mostrando o nome antigo. O
  // accountInfo é a fonte viva desse nome.
  const displayName = (isSingleEntity && accountInfo?.companyName) || selectedClient?.name;

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

  async function baixarModelo() {
    try {
      const blob = await downloadFile('/analyses/modelo');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'balanco-perguntado.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message || 'Não foi possível baixar o modelo.'); }
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
    setDupWarn(null);
    setForceUpload(false);
    // Avisa já na seleção se o nome do arquivo aponta para um período que o
    // cliente já tem — antes de gastar a extração por IA.
    if (clientId) {
      api.get(`/clients/${clientId}/check-period?filename=${encodeURIComponent(f.name)}`)
        .then(r => { if (r.duplicate || r.periodMismatch) setDupWarn(r); })
        .catch(() => {});
    }
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
          'Não encontramos dados financeiros neste arquivo. Verifique se ele traz o ' +
          'balanço patrimonial e a demonstração de resultado, e que o documento está ' +
          'legível. Se o PDF for escaneado (imagem), tente exportar em Excel ou usar ' +
          'um PDF gerado pelo sistema contábil.'
        );
        setProcessing(false);
        setStep(2);
        return;
      }

      const bpClean = {};
      const dspClean = {};
      Object.entries(ex.bp || {}).forEach(([k, v]) => { if (v != null) bpClean[k] = Number(v) || 0; });
      Object.entries(ex.dsp || {}).forEach(([k, v]) => { if (v != null) dspClean[k] = Number(v) || 0; });
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
  // `limitMsg` vem do servidor quando alguém do mesmo escritório consumiu a
  // última análise enquanto esta tela estava aberta. Nos dois casos o aviso é
  // um modal sobre a tela atual — antes ele aparecia sozinho numa página em
  // branco, o que fazia parecer que a "Nova análise" tinha quebrado.
  const trial = trialStatus(accountInfo);
  const blockingMsg = trial?.expirado ? TRIAL_EXPIRADO_MSG
    : (limitMsg || (limitReached ? limiteMensalMsg(plan, monthlyUsed) : null));

  return (
    <div className="page-body" style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
      {blockingMsg && (
        <ConfirmModal
          title={trial?.expirado ? 'Teste grátis encerrado' : 'Limite de análises atingido'}
          message={blockingMsg}
          confirmLabel="Ver planos"
          cancelLabel="Entendi"
          onConfirm={() => navigate('/app/settings')}
          onClose={goBack}
        />
      )}
      <button className="back" onClick={goBack} style={{ marginBottom: 16 }}>
        <i className="ti ti-arrow-left"></i> Voltar
      </button>

      <h1 className="page-h1" style={{ marginBottom: 8 }}>Nova análise</h1>
      <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 6, lineHeight: 1.6, maxWidth: 620 }}>
        Envie o balanço patrimonial e a demonstração de resultado{isSingleEntity ? '' : ' da empresa cliente'} num
        único arquivo, em PDF ou Excel. A partir dele o sistema calcula os indicadores e monta o relatório.
      </p>
      {/* Os dois documentos raramente chegam com esse nome: a contabilidade
          entrega "Demonstrações Contábeis", "Relatório Contábil", "Balanço".
          Nomear as variações evita que a pessoa ache que não tem o arquivo
          certo — o extrator já procura por todos esses títulos dentro do PDF. */}
      <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 32, lineHeight: 1.6, maxWidth: 620 }}>
        Costuma vir da contabilidade com o nome de Demonstrações Contábeis, Demonstrações
        Financeiras, Relatório Contábil ou Balanço — qualquer um deles serve, desde que
        traga as duas peças.
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
          {/* Só faz sentido identificar o cliente quando há mais de um pra
              escolher. Numa conta de entidade única essa linha repetiria o
              nome que já está na barra lateral. */}
          {!isSingleEntity && (
            <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="ti ti-building" style={{ fontSize: 16 }}></i>
              <span style={{ fontWeight: 500, color: 'var(--t0)' }}>{displayName}</span>
              <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--t2)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
                trocar
              </button>
            </div>
          )}

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

          {/* O modelo fica junto do envio: é neste ponto que a pessoa descobre
              que não tem o arquivo. Antes ficava nas telas de estado vazio, que
              acabavam explicando o mesmo fluxo em três lugares. */}
          {!file && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button type="button" onClick={baixarModelo} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--t2)',
                display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'underline', textUnderlineOffset: 3,
              }}>
                <i className="ti ti-file-spreadsheet" style={{ fontSize: 15 }} />
                Não tem o arquivo? Baixe o modelo do Balanço Perguntado
              </button>
            </div>
          )}

          {/* Período já analisado — detectado pelo nome do arquivo, antes de
              gastar a extração. Não bloqueia de vez: o nome pode enganar, então
              fica a escolha de enviar assim mesmo. */}
          {dupWarn && !forceUpload && (
            <div style={{
              marginTop: 16, padding: '14px 16px', borderRadius: 10,
              background: dupWarn.periodMismatch ? 'var(--red-dim)' : 'var(--yellow-dim)',
              border: `1px solid ${dupWarn.periodMismatch ? 'rgba(208,29,33,.35)' : 'rgba(235,136,31,.35)'}`,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 18, color: dupWarn.periodMismatch ? 'var(--red-t)' : 'var(--yellow-t)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'var(--t1)', lineHeight: 1.6 }}>
                  {dupWarn.periodMismatch ? (
                    <>
                      As análises deste cliente são <strong>{dupWarn.periodMismatch.esperado}</strong> e
                      este arquivo é <strong>{dupWarn.periodMismatch.recebido}</strong>. Períodos de
                      tamanhos diferentes não se comparam entre si, então cada cliente segue um
                      padrão só — envie um documento {dupWarn.periodMismatch.esperado}.
                    </>
                  ) : (
                    <>
                      Este cliente já tem uma análise de{' '}
                      <strong>{dupWarn.detected?.period_label || `Exercício ${dupWarn.detected?.year}`}</strong>,
                      e o nome do arquivo aponta para esse mesmo período. Analisar de novo
                      criaria uma duplicata e consumiria uma análise do seu plano.
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {dupWarn.analysisId && (
                  <button className="btn" onClick={() => navigate(`/app/analyses/${dupWarn.analysisId}`)}>
                    <i className="ti ti-eye"></i> Ver a análise existente
                  </button>
                )}
                <button className="btn" onClick={() => { setFile(null); setDupWarn(null); }}>
                  Escolher outro arquivo
                </button>
                {/* Duplicata é só um palpite pelo nome do arquivo, então dá pra
                    insistir. Período incompatível é regra do sistema — o
                    servidor recusaria de qualquer forma. */}
                {!dupWarn.periodMismatch && (
                  <button className="btn" onClick={() => setForceUpload(true)}>
                    Enviar assim mesmo
                  </button>
                )}
              </div>
            </div>
          )}

          {file && (!dupWarn || (forceUpload && !dupWarn.periodMismatch)) && (
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => { setFile(null); setErr(''); setDupWarn(null); setForceUpload(false); }}>
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
                Processando análise de <strong>{displayName}</strong>
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
