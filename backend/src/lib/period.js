// Detecta o período de referência (mês, trimestre, bimestre, semestre ou só
// ano) a partir do nome do arquivo enviado. Priorizado sobre o que a IA infere
// de dentro do documento porque o próprio arquivo costuma ter no título o
// período pretendido (ex: "balanco_julho_2025.pdf"), enquanto o conteúdo pode
// trazer colunas de anos anteriores só para efeito de comparação — o que
// confundiria uma extração baseada só no texto.

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function normalizeYear(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return n < 100 ? 2000 + n : n;
}

function cap(word) { return word.charAt(0).toUpperCase() + word.slice(1); }

export function detectPeriodFromFilename(filename) {
  if (!filename) return null;
  // "_" conta como caractere de palavra pro \b das regexes abaixo — não
  // haveria fronteira entre "_" e "1" em "relatorio_1_trimestre_2025", por
  // exemplo. Troca todo separador comum por espaço antes de casar qualquer
  // padrão, e trata "-2025"/".pdf" etc. da mesma forma.
  const name = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_.\-]+/g, ' ');

  for (let i = 0; i < MONTHS.length; i++) {
    const full = MONTHS[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const abbr = MONTH_ABBR[i];
    const re = new RegExp(`\\b(?:${full}|${abbr})[a-z]*(?:\\s*de)?\\s*(\\d{4}|\\d{2})\\b`, 'i');
    const m = name.match(re);
    if (m) {
      const year = normalizeYear(m[1]);
      if (year) return { year, label: `${cap(MONTHS[i])} de ${year}` };
    }
  }

  let m = name.match(/\b([1-4])\s*[oº°]?\s*(?:trimestre|tri)\s*(?:de)?\s*(\d{4}|\d{2})\b/i)
    || name.match(/\bt\s*([1-4])\s*(\d{4}|\d{2})\b/i)
    || name.match(/\b([1-4])\s*t\s*(\d{4}|\d{2})\b/i);
  if (m) {
    const year = normalizeYear(m[2]);
    if (year) return { year, label: `${m[1]}º Trimestre de ${year}` };
  }

  m = name.match(/\b([1-6])\s*[oº°]?\s*(?:bimestre|bim)\s*(?:de)?\s*(\d{4}|\d{2})\b/i);
  if (m) {
    const year = normalizeYear(m[2]);
    if (year) return { year, label: `${m[1]}º Bimestre de ${year}` };
  }

  m = name.match(/\b([1-2])\s*[oº°]?\s*(?:semestre|sem)\s*(?:de)?\s*(\d{4}|\d{2})\b/i);
  if (m) {
    const year = normalizeYear(m[2]);
    if (year) return { year, label: `${m[1]}º Semestre de ${year}` };
  }

  m = name.match(/\b(20\d{2})\b/);
  if (m) return { year: parseInt(m[1], 10), label: null };

  return null;
}

// Versão segura pra nome de arquivo (sem acento/espaço) — usada nos relatórios
// e planilhas baixáveis (ver routes/analyses.js).
export function periodSlug(year, periodLabel) {
  if (!periodLabel) return String(year ?? '');
  return periodLabel.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Combina o período detectado no nome do arquivo com o que foi extraído do
// conteúdo do documento. Só aplicamos o rótulo do nome do arquivo (mais
// específico, ex: "Julho de 2025") quando o ano bate com o que veio do
// documento — se divergem, o documento é a fonte mais confiável do ano em si,
// e não arriscamos rotular um período que pode estar errado.
export function mergePeriod(extractedYear, extractedLabel, filenamePeriod) {
  if (filenamePeriod) {
    const yearsMatch = !extractedYear || filenamePeriod.year === extractedYear;
    // Quando o nome do arquivo indica um ano MENOR que o extraído pela IA,
    // priorizamos o arquivo — a IA tende a capturar o ano de impressão/
    // assinatura do documento em vez do exercício fiscal real
    // (ex: balanço de 2024 assinado e enviado em 2025 → IA retorna 2025).
    const filenameMoreLikely = extractedYear && filenamePeriod.year < extractedYear;
    if (yearsMatch || filenameMoreLikely) {
      return { year: filenamePeriod.year || extractedYear, period_label: filenamePeriod.label || extractedLabel || null };
    }
  }
  return { year: extractedYear, period_label: extractedLabel || null };
}

// Quantos meses o período cobre — usado para anualizar os fluxos da DSP.
//
// Indicadores que dividem um saldo do balanço (uma foto, tirada numa data) por
// um valor da DSP (um filme, acumulado ao longo do período) só fazem sentido se
// o filme cobrir um ano: é o que as fórmulas do modelo assumem ao multiplicar
// por 360. Com um mês no denominador, o PMR sai 12× maior. Daqui sai o fator
// que recoloca o fluxo na escala anual.
//
// Retorna 12 quando não há rótulo (exercício anual) ou quando o formato não é
// reconhecido — na dúvida, não mexe no número.
export function monthsInPeriod(periodLabel) {
  if (!periodLabel) return 12;
  const t = String(periodLabel).toLowerCase();
  if (/\bbimestre\b/.test(t)) return 2;
  if (/\btrimestre\b/.test(t)) return 3;
  if (/\bquadrimestre\b/.test(t)) return 4;
  if (/\bsemestre\b/.test(t)) return 6;
  if (/\bexerc[íi]cio\b|\banual\b/.test(t)) return 12;
  // "Janeiro de 2025" e afins — mês isolado.
  const meses = ['janeiro','fevereiro','mar','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  if (meses.some(m => t.includes(m))) return 1;
  return 12;
}

// Nome do tipo de período, para mensagens ao usuário. Guarda o plural porque
// o português não o forma por sufixo simples aqui ("anual" → "anuais").
const NOME_PERIODO = {
  1:  { sing: 'mensal',         plur: 'mensais' },
  2:  { sing: 'bimestral',      plur: 'bimestrais' },
  3:  { sing: 'trimestral',     plur: 'trimestrais' },
  4:  { sing: 'quadrimestral',  plur: 'quadrimestrais' },
  6:  { sing: 'semestral',      plur: 'semestrais' },
  12: { sing: 'anual',          plur: 'anuais' },
};

export function periodKindLabel(periodLabel, plural = false) {
  const n = NOME_PERIODO[monthsInPeriod(periodLabel)] || NOME_PERIODO[12];
  return plural ? n.plur : n.sing;
}

// Dois períodos são do mesmo tipo quando cobrem a mesma quantidade de meses.
// "Janeiro de 2025" e "Março de 2025" são compatíveis; "Janeiro de 2025" e
// "Exercício 2025" não são.
export function samePeriodKind(a, b) {
  return monthsInPeriod(a) === monthsInPeriod(b);
}
