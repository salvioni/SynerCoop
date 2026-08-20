/**
 * Aviso de "não há nada aqui" — uma linha de texto centrada.
 *
 * Mesma aparência do vazio da lista de Análises (cinza, 14px, centrado), para
 * que a ausência de dados se pareça em todo o sistema em vez de virar um
 * cartão ilustrado numa tela e uma frase discreta na outra.
 */
export default function EmptyNote({ children }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t3)', fontSize: 14 }}>
      {children}
    </div>
  );
}
