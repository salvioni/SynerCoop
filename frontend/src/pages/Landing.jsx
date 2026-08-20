import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PLANS as PLAN_INFO, PLAN_ORDER } from '../lib/plans.js';
import { api, ApiError } from '../lib/api.js';

const STEPS = [
  { n: '01', icon: 'ti-upload', t: 'Suba o arquivo', d: 'Um único documento em PDF ou Excel, com o balanço patrimonial e a demonstração de resultado. O período — mensal, bimestral, trimestral, semestral ou anual — é reconhecido pelo nome do arquivo.' },
  { n: '02', icon: 'ti-sparkles', t: 'A IA extrai e o sistema calcula', d: 'A IA identifica as contas do documento e o sistema calcula 37 indicadores em cinco grupos, sem digitação manual.' },
  { n: '03', icon: 'ti-file-text', t: 'Relatório pronto', d: 'Diagnóstico SWOT, recomendações e gráficos de evolução entre períodos. Exporte em Word ou baixe a planilha preenchida.' },
];

const INDICATORS = [
  'Liquidez geral, corrente e seca',
  'Rentabilidade do patrimônio líquido (ROE), do ativo (ROA), dos ingressos e do capital integralizado',
  'Endividamento total, perfil da dívida e alavancagem sobre EBITDA',
  'PME, PMR, PMP, ciclo operacional e ciclo financeiro',
  'Capital de giro, NCG e tesouraria pelo Modelo de Fleuriet',
  'Gráficos de evolução comparando os períodos já analisados',
  'Diagnóstico SWOT e recomendações estratégicas geradas por IA',
];

const PLANS = PLAN_ORDER.map(k => PLAN_INFO[k]);

// ── Modais de Termos, Privacidade e Contato ─────────────────────────────────
const LEGAL = {
  termos: {
    title: 'Termos de Uso',
    content: (
      <>
        <p>Ao utilizar a plataforma SynerCoop você concorda com as condições descritas neste documento. Leia-o com atenção antes de prosseguir.</p>
        <h3>1. Objeto</h3>
        <p>A SynerCoop fornece ferramentas de análise financeira voltadas a cooperativas, escritórios contábeis, empresas e associações. Os dados inseridos são processados para geração de indicadores e relatórios.</p>
        <h3>2. Responsabilidades do usuário</h3>
        <p>O usuário é responsável pela veracidade das informações inseridas. A SynerCoop não se responsabiliza por decisões financeiras tomadas com base nos relatórios gerados.</p>
        <h3>3. Propriedade intelectual</h3>
        <p>Todo o conteúdo da plataforma — incluindo código, marca e design — é propriedade da SynerCoop. É proibida a reprodução sem autorização expressa.</p>
        <h3>4. Privacidade</h3>
        <p>O tratamento de dados pessoais segue nossa Política de Privacidade, disponível neste mesmo portal. Os dados são armazenados com criptografia e nunca vendidos a terceiros.</p>
        <h3>5. Disponibilidade</h3>
        <p>A plataforma é fornecida "como está". Fazemos o possível para manter alta disponibilidade, mas não garantimos acesso ininterrupto.</p>
        <h3>6. Alterações</h3>
        <p>Estes termos podem ser atualizados a qualquer momento. O uso continuado da plataforma após a publicação de alterações implica aceitação das novas condições.</p>
        <p style={{ marginTop: 24, color: 'var(--t3)', fontSize: 12 }}>Última atualização: agosto de 2026</p>
      </>
    ),
  },
  privacidade: {
    title: 'Política de Privacidade',
    content: (
      <>
        <p>A SynerCoop valoriza a privacidade dos seus usuários. Esta política descreve quais dados coletamos, como os utilizamos e como os protegemos.</p>
        <h3>1. Dados coletados</h3>
        <p>Coletamos nome, e-mail, dados da organização e informações financeiras inseridas voluntariamente. Também coletamos dados de uso da plataforma (páginas acessadas, horários) para fins de melhoria do serviço.</p>
        <h3>2. Uso dos dados</h3>
        <p>Os dados são usados exclusivamente para prestação do serviço contratado — geração de análises, autenticação e comunicações relacionadas à conta. Não compartilhamos dados pessoais com terceiros, exceto quando exigido por lei.</p>
        <h3>3. Armazenamento e segurança</h3>
        <p>Todos os dados são armazenados com criptografia em servidores localizados no Brasil. Senhas são armazenadas com hash irreversível (bcrypt). Aplicamos boas práticas de segurança da informação (OWASP).</p>
        <h3>4. Seus direitos (LGPD)</h3>
        <p>Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a: acessar seus dados, corrigi-los, solicitar exclusão e revogar consentimentos. Para exercer esses direitos, entre em contato pelo e-mail abaixo.</p>
        <h3>5. Cookies</h3>
        <p>Usamos apenas cookies estritamente necessários para autenticação e funcionamento da plataforma. Não utilizamos cookies de rastreamento ou publicidade.</p>
        <h3>6. Contato</h3>
        <p>Dúvidas sobre privacidade: <a href="mailto:privacidade@synercoop.com.br" style={{ color: 'var(--blue-text)' }}>privacidade@synercoop.com.br</a></p>
        <p style={{ marginTop: 24, color: 'var(--t3)', fontSize: 12 }}>Última atualização: agosto de 2026</p>
      </>
    ),
  },
};

function LegalModal({ k, onClose }) {
  const entry = LEGAL[k];
  if (!entry) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg1)', borderRadius: 14, border: '1px solid var(--bd)', width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--bd)' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 400, color: 'var(--t0)' }}>{entry.title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6 }}>
            <i className="ti ti-x" style={{ fontSize: 20 }} />
          </button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', fontSize: 14, color: 'var(--t1)', lineHeight: 1.7 }}>
          <style>{`
            .legal-body h3 { font-family: var(--font-sans); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--t2); margin: 20px 0 6px }
            .legal-body p  { margin: 0 0 10px }
            .legal-body p:last-child { margin-bottom: 0 }
          `}</style>
          <div className="legal-body">{entry.content}</div>
        </div>
      </div>
    </div>
  );
}

// ── Mockup do produto no topo da página ─────────────────────────────────────
// Desenhado em SVG, não capturado de tela: uma imagem de print envelhece a cada
// mudança de layout, sai borrada em telas retina e pesa. Aqui os mesmos
// componentes do painel real — cartões de indicador, evolução da liquidez,
// semáforo — são reconstruídos com os tokens de cor do sistema, então o topo do
// site continua parecido com o produto sozinho.

const MOCK_KPI = [
  { l: 'Liquidez Corrente', v: '1,47', s: 'Bom',     c: 'var(--green-t)' },
  { l: 'Endividamento',     v: '62,3%', s: 'Atenção', c: 'var(--yellow-t)' },
  { l: 'Ciclo Financeiro',  v: '54d',  s: 'Bom',     c: 'var(--green-t)' },
];

// Séries do gráfico de linha, em unidades do próprio viewBox (0–100 x 0–46).
const SERIE_CORRENTE = [[0,30],[46,25],[92,26],[138,17],[184,14],[230,9]];
const SERIE_SECA     = [[0,38],[46,35],[92,33],[138,30],[184,28],[230,24]];
const linha = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');

const MOCK_BARRAS = [38, 52, 45, 63, 71, 86];

function HeroMock() {
  return (
    <div className="ld-preview" aria-hidden="true">
      <div className="ld-preview-bar">
        <span className="ld-dot" style={{ background: 'var(--red)', opacity: .55 }}></span>
        <span className="ld-dot" style={{ background: 'var(--yellow-t)', opacity: .65 }}></span>
        <span className="ld-dot" style={{ background: 'var(--green-t)', opacity: .65 }}></span>
        <span className="ld-preview-url">synercoop.app/clientes/cooperativa-agro-uniao</span>
      </div>

      <div className="ld-mock">
        <div className="ld-mock-head">
          <div>
            <div className="ld-mock-eyebrow">Cooperativa</div>
            <div className="ld-mock-title">Agro União Ltda</div>
          </div>
          <div className="ld-mock-chip">Exercício 2025</div>
        </div>

        <div className="ld-mock-kpis">
          {MOCK_KPI.map(k => (
            <div key={k.l} className="ld-mock-kpi">
              <div className="ld-mock-kpi-l">{k.l}</div>
              <div className="ld-mock-kpi-v">{k.v}</div>
              <div className="ld-mock-kpi-s" style={{ color: k.c }}>● {k.s}</div>
            </div>
          ))}
        </div>

        <div className="ld-mock-charts">
          <div className="ld-mock-card">
            <div className="ld-mock-card-t">Evolução da liquidez</div>
            <svg viewBox="0 0 230 46" className="ld-mock-svg" preserveAspectRatio="none">
              {[4, 17, 30, 43].map(y => (
                <line key={y} x1="0" y1={y} x2="230" y2={y} stroke="var(--bd)" strokeWidth=".5" />
              ))}
              <path d={linha(SERIE_SECA)} fill="none" stroke="var(--ch-gold)" strokeWidth="2"
                    vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              <path d={linha(SERIE_CORRENTE)} fill="none" stroke="var(--ch-blue)" strokeWidth="2"
                    vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="ld-mock-legend">
              <span><i style={{ background: 'var(--ch-blue)' }}></i>Corrente</span>
              <span><i style={{ background: 'var(--ch-gold)' }}></i>Seca</span>
            </div>
          </div>

          <div className="ld-mock-card">
            <div className="ld-mock-card-t">Receita por exercício</div>
            <div className="ld-mock-bars">
              {MOCK_BARRAS.map((h, i) => (
                <span key={i} style={{ height: `${h}%` }}></span>
              ))}
            </div>
            <div className="ld-mock-legend">
              <span><i style={{ background: 'var(--ch-blue)' }}></i>Receita líquida</span>
            </div>
          </div>
        </div>

        <div className="ld-mock-foot">
          <i className="ti ti-sparkles"></i>
          Sobras crescem pelo 3º exercício seguido; o ciclo financeiro caiu 11 dias.
        </div>
      </div>
    </div>
  );
}

// ── Seção de contato ────────────────────────────────────────────────────────
// Era um modal aberto por um link no rodapé, com três endereços de e-mail para
// a pessoa copiar. Agora é uma seção como Produto e Planos: quem quer falar
// escreve ali mesmo, e o "Fale conosco" do plano Enterprise cai aqui em vez de
// mandar a pessoa criar uma conta que não é o que ela quer.

const CANAIS = [
  { icon: 'ti-building', label: 'Comercial e parcerias', value: 'contato@synercoop.com.br' },
  { icon: 'ti-mail',     label: 'Suporte técnico',       value: 'suporte@synercoop.com.br' },
  { icon: 'ti-shield',   label: 'Privacidade e dados',   value: 'privacidade@synercoop.com.br' },
];

function Contato() {
  const [form, setForm] = useState({ nome: '', email: '', empresa: '', telefone: '', mensagem: '', website: '' });
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const set = campo => e => {
    setForm(f => ({ ...f, [campo]: e.target.value }));
    setErros(er => (er[campo] ? { ...er, [campo]: undefined } : er));
  };

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true); setErros({}); setErroGeral('');
    try {
      await api.post('/contact', form);
      setEnviado(true);
    } catch (err) {
      // Erros de campo voltam em `fields`; o resto vira uma linha acima do
      // botão — a pessoa não pode ficar sem saber que a mensagem não saiu.
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) setErros(err.fields);
      else setErroGeral(err instanceof ApiError ? err.message : 'Não foi possível enviar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section id="contato" className="ld-section-alt">
      <div className="ld-container ld-contato">
        <div>
          <div className="ld-section-label">Contato</div>
          <h2 className="ld-section-title">Vamos conversar.</h2>
          <p className="ld-contato-sub">
            Quer entender se o SynerCoop atende o seu caso, precisa de um plano sob medida
            ou tem uma dúvida sobre os relatórios? Escreva — respondemos em até um dia útil.
          </p>
          <ul className="ld-canais">
            {CANAIS.map(c => (
              <li key={c.value}>
                <i className={`ti ${c.icon}`}></i>
                <div>
                  <div className="ld-canal-l">{c.label}</div>
                  <a href={`mailto:${c.value}`} className="ld-canal-v">{c.value}</a>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="ld-form-card">
          {enviado ? (
            <div className="ld-form-ok" role="status">
              <i className="ti ti-circle-check"></i>
              <h3>Mensagem enviada</h3>
              <p>Obrigado, {form.nome.split(' ')[0]}. Respondemos no e-mail {form.email} em até um dia útil.</p>
            </div>
          ) : (
            <form onSubmit={enviar} noValidate>
              <div className="ld-form-row">
                <div>
                  <label className="inp-label" htmlFor="ct-nome">Nome</label>
                  <input id="ct-nome" className="inp" value={form.nome} onChange={set('nome')} autoComplete="name" />
                  {erros.nome && <div className="ld-form-err">{erros.nome}</div>}
                </div>
                <div>
                  <label className="inp-label" htmlFor="ct-email">E-mail</label>
                  <input id="ct-email" type="email" className="inp" value={form.email} onChange={set('email')} autoComplete="email" />
                  {erros.email && <div className="ld-form-err">{erros.email}</div>}
                </div>
              </div>
              <div className="ld-form-row">
                <div>
                  <label className="inp-label" htmlFor="ct-empresa">Organização <span className="ld-opt">(opcional)</span></label>
                  <input id="ct-empresa" className="inp" value={form.empresa} onChange={set('empresa')} autoComplete="organization" />
                </div>
                <div>
                  <label className="inp-label" htmlFor="ct-tel">Telefone <span className="ld-opt">(opcional)</span></label>
                  <input id="ct-tel" className="inp" value={form.telefone} onChange={set('telefone')} autoComplete="tel" />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label className="inp-label" htmlFor="ct-msg">Mensagem</label>
                <textarea id="ct-msg" className="inp ld-textarea" rows={5} value={form.mensagem} onChange={set('mensagem')}
                  placeholder="Conte um pouco sobre a sua organização e o que você precisa." />
                {erros.mensagem && <div className="ld-form-err">{erros.mensagem}</div>}
              </div>

              {/* Isca para robôs — invisível e fora da ordem de tabulação. */}
              <input className="ld-hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
                value={form.website} onChange={set('website')} />

              {erroGeral && <div className="ld-form-err" style={{ marginTop: 14 }}>{erroGeral}</div>}
              <button type="submit" className="btn btn-p" disabled={enviando}
                style={{ width: '100%', justifyContent: 'center', marginTop: 20, padding: '12px 20px' }}>
                {enviando ? 'Enviando…' : 'Enviar mensagem'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const [legal, setLegal] = useState(null); // 'termos' | 'privacidade'

  return (
    <div className="landing">
      {/* Header */}
      <header className="ld-header">
        <div className="ld-container ld-header-inner">
          <Link to="/" className="ld-logo">
            <div className="ld-logo-badge">S</div>
            <span className="ld-logo-name">SynerCoop</span>
          </Link>
          <nav className="ld-nav">
            <a href="#produto">Produto</a>
            <a href="#fluxo">Como funciona</a>
            <a href="#planos">Planos</a>
            <a href="#contato">Contato</a>
          </nav>
          <div className="ld-header-actions">
            <Link to="/login" className="ld-link">Entrar</Link>
            <Link to="/register" className="btn btn-p">Experimente grátis</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="ld-container ld-hero">
        <div className="ld-hero-copy">
          <div className="ld-badge-pill">
            <i className="ti ti-sparkles" style={{ color: 'var(--gold)' }}></i> Para cooperativas, escritórios contábeis, empresas e associações
          </div>
          <h1 className="ld-hero-title">
            Análise financeira da sua empresa em <span className="ld-accent">segundos</span>.
          </h1>
          <p className="ld-hero-sub">
            Suba um único arquivo em PDF ou Excel. A IA lê o balanço e a demonstração de resultado,
            o sistema calcula 37 indicadores e monta o relatório com diagnóstico e recomendações —
            pronto para revisar e entregar. Analise a sua própria organização ou uma carteira de clientes.
          </p>
          <div className="ld-hero-cta">
            <Link to="/register" className="btn btn-p" style={{ padding: '12px 20px' }}>
              Experimente grátis <i className="ti ti-arrow-right"></i>
            </Link>
            <a href="#planos" className="btn" style={{ padding: '12px 20px' }}>
              Veja nossos planos
            </a>
          </div>
          <div className="ld-trust">
            <span><i className="ti ti-shield-check" style={{ color: 'var(--green-t)' }}></i> Dados isolados por conta</span>
            <span><i className="ti ti-lock" style={{ color: 'var(--green-t)' }}></i> Conformidade LGPD</span>
          </div>
        </div>

        <HeroMock />
      </section>

      {/* Como funciona */}
      <section id="fluxo" className="ld-section-alt">
        <div className="ld-container" style={{ paddingTop: 80, paddingBottom: 80 }}>
          <div style={{ maxWidth: 560 }}>
            <div className="ld-section-label">Como funciona</div>
            <h2 className="ld-section-title">Do PDF ao diagnóstico em três passos.</h2>
          </div>
          <div className="ld-steps">
            {STEPS.map(s => (
              <div key={s.n} className="ld-step">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 24, color: 'var(--gold)' }}></i>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--t2)', opacity: .6 }}>{s.n}</span>
                </div>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, marginTop: 24 }}>{s.t}</h3>
                <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8, lineHeight: 1.625 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Indicadores */}
      <section id="produto" className="ld-container" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <div className="ld-two-col">
          <div>
            <div className="ld-section-label">O que é calculado</div>
            <h2 className="ld-section-title">
              Todos os indicadores que você já calcula <span className="ld-accent">no Excel</span> — automaticamente.
            </h2>
            <p style={{ color: 'var(--t2)', marginTop: 24, lineHeight: 1.625 }}>
              Cobrimos a metodologia tradicional de análise contábil: liquidez, rentabilidade, endividamento,
              capacidade operacional e tesouraria — 37 indicadores calculados a cada análise. A cada novo período
              enviado, os gráficos de evolução se atualizam sozinhos. Você revisa, ajusta o texto e exporta o
              relatório em Word ou a planilha do Balanço Perguntado já preenchida.
            </p>
          </div>
          <ul className="ld-indicator-list">
            {INDICATORS.map(i => (
              <li key={i}>
                <i className="ti ti-chart-bar" style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 2 }}></i>
                {i}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="ld-section-alt">
        <div className="ld-container" style={{ paddingTop: 80, paddingBottom: 80 }}>
          <div style={{ maxWidth: 560 }}>
            <div className="ld-section-label">Planos</div>
            <h2 className="ld-section-title">Comece grátis. Escale quando precisar.</h2>
          </div>
          <div className="ld-plans">
            {PLANS.map(p => (
              <div key={p.key} className={`ld-plan${p.highlight ? ' ld-plan-hl' : ''}`}>
                {p.highlight && <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--gold)', marginBottom: 12 }}>Mais popular</div>}
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>{p.label}</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 36, marginTop: 8 }}>
                  {p.price}
                  {p.price.startsWith('R$ ') && p.price !== 'R$ 0' && <span style={{ fontSize: 14, color: 'var(--t2)', fontFamily: 'var(--font-sans)' }}>/mês</span>}
                </div>
                <p style={{ fontSize: 14, color: 'var(--t2)', marginTop: 8 }}>{p.desc}</p>
                <ul className="ld-plan-feats">
                  {p.feats.map(f => (
                    <li key={f}><span style={{ color: 'var(--gold)' }}>✓</span> {f}</li>
                  ))}
                </ul>
                {/* Enterprise é "sob consulta": mandar pro cadastro daria à
                    pessoa uma conta de teste, que não é o que ela pediu. */}
                {p.priceNum === null ? (
                  <a href="#contato" className={`btn ${p.highlight ? 'btn-p' : ''}`} style={{ width: '100%', justifyContent: 'center', marginTop: 28 }}>
                    {p.cta}
                  </a>
                ) : (
                  <Link to="/register" className={`btn ${p.highlight ? 'btn-p' : ''}`} style={{ width: '100%', justifyContent: 'center', marginTop: 28 }}>
                    {p.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Contato />

      {/* Footer */}
      <footer className="ld-footer">
        <div className="ld-container ld-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ld-logo-badge" style={{ width: 24, height: 24, fontSize: 10 }}>S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>SynerCoop</span>
            <span style={{ color: 'var(--t3)' }}>© 2026</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 14, color: 'var(--t2)' }}>
            {['termos', 'privacidade'].map(k => (
              <button key={k} onClick={() => setLegal(k)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>
                {k === 'termos' ? 'Termos' : 'Privacidade'}
              </button>
            ))}
            <a href="#contato" style={{ color: 'inherit', textDecoration: 'none' }}>Contato</a>
          </div>
        </div>
      </footer>

      {legal && <LegalModal k={legal} onClose={() => setLegal(null)} />}
    </div>
  );
}
