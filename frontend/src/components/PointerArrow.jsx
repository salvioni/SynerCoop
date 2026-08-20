import { useEffect, useState } from 'react';

/**
 * Seta desenhada de um elemento até outro, por cima da página.
 *
 * Usada para ligar um estado vazio ao botão que resolve aquele vazio — quando
 * o botão está fora do bloco (na barra lateral, por exemplo) e uma frase do
 * tipo "clique em Nova análise" obrigaria a pessoa a procurar onde isso fica.
 *
 * Fica num SVG `position: fixed` cobrindo a viewport, sem capturar cliques. As
 * duas pontas são medidas em tela e recalculadas em resize/scroll, então a
 * curva acompanha o layout em vez de assumir posições fixas.
 *
 * Não desenha nada quando o alvo não está visível — em telas estreitas a barra
 * lateral dá lugar à navegação inferior, e uma seta apontando para o vazio
 * seria pior que seta nenhuma.
 *
 * Props:
 *   fromRef      — ref do elemento de origem (a ponta sai da borda esquerda dele)
 *   toSelector   — seletor CSS do alvo (ex.: '#s-cta-nova-analise')
 *   minViewport  — largura mínima da janela para desenhar (default 1024)
 */
export default function PointerArrow({ fromRef, toSelector, minViewport = 1024 }) {
  const [path, setPath] = useState(null);

  useEffect(() => {
    function medir() {
      const origem = fromRef?.current;
      const alvo = document.querySelector(toSelector);
      if (!origem || !alvo || window.innerWidth < minViewport) { setPath(null); return; }

      const o = origem.getBoundingClientRect();
      const a = alvo.getBoundingClientRect();
      if (!a.width || !a.height) { setPath(null); return; }

      // Sai da esquerda da origem e chega na borda direita do alvo.
      const x1 = o.left - 14;
      const y1 = o.top + o.height / 2;
      const x2 = a.right + 12;
      const y2 = a.top + a.height / 2;

      // Distância horizontal curta não comporta curva: viraria um rabisco
      // vertical. Nesse caso é melhor não desenhar nada.
      const dx = x2 - x1;
      if (Math.abs(dx) < 120) { setPath(null); return; }

      // Barriga para baixo, aproximando o alvo por baixo: contorna o conteúdo
      // em vez de cortá-lo em linha reta.
      const c1x = x1 + dx * 0.35;
      const c1y = y1 + 50;
      const c2x = x1 + dx * 0.82;
      const c2y = y2 + Math.min(90, Math.abs(y1 - y2) * 0.6 + 40);

      // Ponta da seta alinhada à tangente final da curva.
      const ang = Math.atan2(y2 - c2y, x2 - c2x);
      const L = 9;
      const ponta = [
        `M${x2},${y2}`,
        `L${x2 - L * Math.cos(ang - Math.PI / 7)},${y2 - L * Math.sin(ang - Math.PI / 7)}`,
        `M${x2},${y2}`,
        `L${x2 - L * Math.cos(ang + Math.PI / 7)},${y2 - L * Math.sin(ang + Math.PI / 7)}`,
      ].join(' ');

      setPath({ d: `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`, ponta });
    }

    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    // O alvo pode entrar em cena depois (fontes, layout assentando).
    const t = setTimeout(medir, 400);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
      clearTimeout(t);
    };
  }, [fromRef, toSelector, minViewport]);

  if (!path) return null;

  return (
    <svg
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 5 }}
    >
      <path d={path.d} fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      <path d={path.ponta} fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
    </svg>
  );
}
