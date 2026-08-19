import { useState } from 'react';

/**
 * InfoTooltip — ícone ⓘ com popup de explicação em linguagem simples.
 * Basta passar a prop `text`. Compatível com temas claro e escuro.
 */
export default function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', marginLeft: 5, verticalAlign: 'middle' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
      aria-label={text}
    >
      <i className="ti ti-info-circle" style={{ fontSize: 13, color: 'var(--t3)', cursor: 'help', lineHeight: 1 }} />
      {show && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          width: 240, background: '#1a2a4a', color: '#dde4ef', fontSize: 12, lineHeight: 1.6,
          padding: '10px 14px', borderRadius: 8, zIndex: 400,
          boxShadow: '0 4px 20px rgba(0,0,0,.35)', whiteSpace: 'normal', pointerEvents: 'none',
          textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
          fontFamily: 'var(--font-sans)',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}
