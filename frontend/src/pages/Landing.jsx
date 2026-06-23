import { Link } from 'react-router-dom';

const STEPS = [
  { n: '01', icon: 'ti-upload', t: 'Suba o balanço', d: 'Faça upload do balanço patrimonial e DRE em PDF ou Excel da empresa cliente.' },
  { n: '02', icon: 'ti-sparkles', t: 'IA extrai e calcula', d: 'Nossa IA lê o documento, identifica as contas e calcula 30+ indicadores financeiros.' },
  { n: '03', icon: 'ti-file-text', t: 'Relatório pronto', d: 'Diagnóstico, SWOT e recomendações estratégicas — pronto para revisar e enviar.' },
];

const INDICATORS = [
  'Liquidez corrente, geral, seca e imediata',
  'ROE, ROA, ROI e margem EBITDA',
  'Endividamento total e perfil da dívida',
  'PMR, PMP, PME e ciclo financeiro',
  'Capital de giro, NCG e tesouraria',
  'Análise SWOT financeira automática',
  'Recomendações estratégicas geradas por IA',
];

const PLANS = [
  { name: 'Free', price: 'R$ 0', desc: 'Para testar com 1 ou 2 clientes.', feats: ['3 análises por mês', '1 usuário', 'Relatório padrão'], cta: 'Começar grátis' },
  { name: 'Pro', price: 'R$ 297', desc: 'Para escritórios em operação.', feats: ['100 análises/mês', 'Até 5 usuários', 'Relatório personalizado', 'Exportação PDF/Word'], highlight: true, cta: 'Assinar Pro' },
  { name: 'Enterprise', price: 'Sob consulta', desc: 'Para grandes operações.', feats: ['Análises ilimitadas', 'Usuários ilimitados', 'API + integrações', 'Suporte dedicado'], cta: 'Falar com vendas' },
];

const PREVIEW = [
  { l: 'Liquidez Corrente', v: '1,47', s: 'Bom', c: 'var(--green-t)' },
  { l: 'Endividamento Total', v: '62,25%', s: 'Crítico', c: 'var(--red-t)' },
  { l: 'PMR', v: '1.433 dias', s: 'Crítico', c: 'var(--red-t)' },
];

export default function Landing() {
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
          </nav>
          <div className="ld-header-actions">
            <Link to="/login" className="ld-link">Entrar</Link>
            <Link to="/register" className="btn btn-p">Começar grátis</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="ld-container" style={{ paddingTop: 80, paddingBottom: 96 }}>
        <div style={{ maxWidth: 720 }}>
          <div className="ld-badge-pill">
            <i className="ti ti-sparkles" style={{ color: 'var(--gold)' }}></i> Beta privado · Para escritórios
          </div>
          <h1 className="ld-hero-title">
            Análise financeira de uma empresa inteira, em <span className="ld-accent">90 segundos</span>.
          </h1>
          <p className="ld-hero-sub">
            Contadores e advogados sobem o balanço da empresa cliente em PDF. Nossa IA extrai os dados,
            calcula os indicadores e entrega um relatório de diagnóstico pronto para enviar.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 36 }}>
            <Link to="/register" className="btn btn-p" style={{ padding: '12px 20px' }}>
              Criar conta gratuita <i className="ti ti-arrow-right"></i>
            </Link>
            <Link to="/app/dashboard" className="btn" style={{ padding: '12px 20px' }}>
              Ver demonstração
            </Link>
          </div>
          <div className="ld-trust">
            <span><i className="ti ti-shield-check" style={{ color: 'var(--green-t)' }}></i> Dados isolados por escritório</span>
            <span><i className="ti ti-lock" style={{ color: 'var(--green-t)' }}></i> Conformidade LGPD</span>
          </div>
        </div>

        {/* Preview card */}
        <div className="ld-preview">
          <div className="ld-preview-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ld-dot" style={{ background: 'var(--red)', opacity: 0.6 }}></span>
              <span className="ld-dot" style={{ background: 'var(--yellow-t)', opacity: 0.7 }}></span>
              <span className="ld-dot" style={{ background: 'var(--green-t)', opacity: 0.7 }}></span>
              <span style={{ marginLeft: 12, fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--t2)' }}>synercoop.app/relatorio/cooperativa-agro-uniao</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--green-t)' }}>● ao vivo</span>
          </div>
          <div className="ld-preview-grid">
            {PREVIEW.map(k => (
              <div key={k.l} className="ld-preview-cell">
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t2)' }}>{k.l}</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 36, marginTop: 8 }}>{k.v}</div>
                <div style={{ fontSize: 12, color: k.c, marginTop: 8 }}>● {k.s}</div>
              </div>
            ))}
          </div>
        </div>
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
              capacidade operacional e capital de giro. Você revisa, ajusta e gera o PDF do relatório.
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
              <div key={p.name} className={`ld-plan${p.highlight ? ' ld-plan-hl' : ''}`}>
                {p.highlight && <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--gold)', marginBottom: 12 }}>Mais popular</div>}
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>{p.name}</div>
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
                <Link to="/register" className={`btn ${p.highlight ? 'btn-p' : ''}`} style={{ width: '100%', justifyContent: 'center', marginTop: 28 }}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="ld-footer">
        <div className="ld-container ld-footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ld-logo-badge" style={{ width: 24, height: 24, fontSize: 10 }}>S</div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16 }}>SynerCoop</span>
            <span style={{ color: 'var(--t3)' }}>© 2026</span>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 14, color: 'var(--t2)' }}>
            <a href="#" style={{ color: 'inherit' }}>Termos</a>
            <a href="#" style={{ color: 'inherit' }}>Privacidade</a>
            <a href="#" style={{ color: 'inherit' }}>Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
