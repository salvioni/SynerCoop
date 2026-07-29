// Formata o período de uma análise — usa o rótulo detectado (ex: "Julho de
// 2025", "1º Trimestre de 2025") quando disponível, senão cai no ano puro.
export function periodLabel(a) {
  return a?.period_label || `Exercício ${a?.year ?? ''}`;
}

// Igual periodLabel, mas sem o prefixo "Exercício" — pra compor frases como
// "Análise financeira de {periodShort(a)}".
export function periodShort(a) {
  return a?.period_label || String(a?.year ?? '');
}

// Versão segura pra nome de arquivo (sem acento/espaço).
export function periodSlug(a) {
  if (!a?.period_label) return String(a?.year ?? '');
  return a.period_label.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
