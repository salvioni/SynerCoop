/**
 * Estado vazio — o que a tela mostra quando ainda não há dado nenhum.
 *
 * Uma conta recém-criada via quase todas as telas nesta condição, e uma tela
 * vazia sem texto nenhum não diz se está carregando, se deu erro ou se é assim
 * mesmo. Aqui ela passa a responder duas perguntas: para que serve esta tela e
 * qual é o próximo passo.
 *
 * Props:
 *   icon    — nome do ícone Tabler (ex.: 'ti-chart-bar')
 *   title   — frase curta do que falta
 *   children— explicação em uma ou duas linhas
 *   action  — { label, onClick, icon } da ação principal
 *   hint    — { label, onClick, icon } de uma saída secundária, discreta
 *   compact — versão de menor altura, para caber dentro de um cartão
 */
export default function EmptyState({ icon = 'ti-inbox', title, children, action, hint, compact = false }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: compact ? '32px 20px' : '64px 24px',
    }}>
      <div style={{
        width: compact ? 44 : 56, height: compact ? 44 : 56, borderRadius: 14,
        background: 'var(--bg2)', border: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: compact ? 20 : 26, color: 'var(--t3)' }} />
      </div>

      <h3 style={{
        fontFamily: 'var(--font-serif)', fontSize: compact ? 18 : 22, fontWeight: 400,
        color: 'var(--t0)', margin: '0 0 6px',
      }}>
        {title}
      </h3>

      {children && (
        <p style={{
          fontSize: 14, color: 'var(--t2)', lineHeight: 1.6, margin: 0,
          maxWidth: 420,
        }}>
          {children}
        </p>
      )}

      {action && (
        <button className="btn btn-p" onClick={action.onClick} style={{ marginTop: 20 }}>
          {action.icon && <i className={`ti ${action.icon}`} />} {action.label}
        </button>
      )}

      {hint && (
        <button
          onClick={hint.onClick}
          style={{
            marginTop: 12, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: 'var(--t2)', display: 'inline-flex', alignItems: 'center', gap: 6,
            textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          {hint.icon && <i className={`ti ${hint.icon}`} style={{ fontSize: 15 }} />}
          {hint.label}
        </button>
      )}
    </div>
  );
}
