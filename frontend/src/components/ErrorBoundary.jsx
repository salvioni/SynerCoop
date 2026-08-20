import { Component } from 'react';

/**
 * Captura erros de renderização e mostra uma tela explicativa.
 *
 * Sem isto, qualquer exceção durante o render desmonta a árvore inteira e o
 * usuário vê uma página em branco — sem mensagem, sem saber se é a conexão, a
 * sessão ou um defeito. E quem for investigar depende de o usuário ter aberto o
 * console no momento certo. Aqui o erro fica visível na tela e copiável.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    // Mantém o rastro no console para quem estiver com ele aberto.
    console.error('[ErrorBoundary]', err, info?.componentStack);
  }

  render() {
    const { err } = this.state;
    if (!err) return this.props.children;

    const detalhe = `${err.message || err}\n\n${err.stack || ''}`.trim();

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'var(--bg0)',
      }}>
        <div style={{
          maxWidth: 620, width: '100%', background: 'var(--bg1)', border: '1px solid var(--bd)',
          borderRadius: 14, padding: 32,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 32, color: 'var(--yellow-t)' }} />
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--t0)', margin: '12px 0 8px' }}>
            Algo quebrou nesta tela
          </h1>
          <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.6, margin: '0 0 20px' }}>
            Seus dados estão salvos — o problema é só na exibição. Recarregar costuma resolver;
            se continuar, envie o detalhe abaixo para o suporte.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <button className="btn btn-p" onClick={() => window.location.reload()}>
              <i className="ti ti-refresh"></i> Recarregar
            </button>
            <button className="btn" onClick={() => { window.location.href = '/app/dashboard'; }}>
              Ir para a visão geral
            </button>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(detalhe)}>
              <i className="ti ti-copy"></i> Copiar detalhe
            </button>
          </div>

          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--t2)' }}>Detalhe técnico</summary>
            <pre style={{
              marginTop: 10, padding: 14, background: 'var(--bg2)', border: '1px solid var(--bd)',
              borderRadius: 8, fontSize: 12, color: 'var(--t1)', whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', maxHeight: 260, overflow: 'auto',
            }}>{detalhe}</pre>
          </details>
        </div>
      </div>
    );
  }
}
