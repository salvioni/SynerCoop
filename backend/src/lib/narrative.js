import { generateText, parseJsonFromLLM } from './llm.js';

// Prompt único de narrativa — compartilhado entre a geração via UI
// (routes/analyses.js → POST /narrative) e a geração inline no download do
// Word (report.js → generateReport quando narrative ainda é null).
// Manter aqui evita divergência de tom, estrutura e chaves JSON entre os dois
// caminhos. O buildDocx em report.js aceita tanto "sumario_executivo" quanto
// "sumario" para compatibilidade com narrativas salvas antes desta unificação.
export const NARRATIVE_PROMPT = `Você é um analista financeiro especializado em cooperativas brasileiras.
Com base nos indicadores financeiros abaixo, gere um relatório de análise detalhado e profissional.

Empresa: {company_name}
Tipo: {company_type}
Exercício: {year}

INDICADORES CALCULADOS:
{indicators_json}

VALORES DO BALANÇO PATRIMONIAL:
{bp_json}

VALORES DO DSP:
{dsp_json}

Retorne SOMENTE um JSON válido (sem texto antes ou depois) com esta estrutura:

{
  "sumario_executivo": "Parágrafo de 3-5 frases resumindo a situação financeira geral da empresa/cooperativa.",
  "liquidez": "Parágrafo analisando os índices de liquidez geral, liquidez corrente, liquidez seca e imobilização. Cite os valores exatos.",
  "rentabilidade": "Parágrafo analisando ROE, ROA, rentabilidade dos ingressos e EBITDA. Cite os valores exatos.",
  "endividamento": "Parágrafo analisando endividamento total, perfil, alavancagem e estrutura de capital. Cite os valores exatos.",
  "capacidade_operacional": "Parágrafo analisando PME, PMR, PMP, ciclo financeiro e giro do ativo. Cite os valores exatos.",
  "tesouraria": "Parágrafo analisando capital de giro, NCG, tesouraria e independência financeira. Cite os valores exatos.",
  "forcas": "1-2 frases sobre os pontos fortes identificados.",
  "fraquezas": "1-2 frases sobre os pontos de atenção críticos.",
  "riscos": "1-2 frases sobre os riscos identificados.",
  "recomendacoes": [
    "Recomendação 1 com título curto: descrição da ação necessária.",
    "Recomendação 2 com título curto: descrição da ação necessária.",
    "Recomendação 3 com título curto: descrição da ação necessária.",
    "Recomendação 4 com título curto: descrição da ação necessária."
  ]
}

Regras:
- Use linguagem profissional mas acessível para contadores e diretores de cooperativa
- Cooperativas usam "sobras/perdas" em vez de "lucro/prejuízo", "ingressos" em vez de "receita"
- Seja específico: cite os valores exatos dos indicadores
- Identifique claramente o que é positivo, o que é preocupante e o que é crítico
- As recomendações devem ser práticas e acionáveis
- Campos com valor null (nos INDICADORES/VALORES DO BALANÇO PATRIMONIAL/DSP acima)
  não foram encontrados no documento original — é diferente de valer zero. NUNCA
  afirme que esses campos valem zero ou que "não há" o que quer que seja com base
  neles (ex: não diga "a cooperativa não tem empréstimos" se o campo é null — diga
  que a informação não estava disponível no documento, ou simplesmente não cite esse valor)
- Se a maioria dos indicadores vier null, isso significa que o documento não tinha
  dados suficientes para a análise — NÃO invente uma narrativa (ex: "a cooperativa
  está inativa/foi dissolvida"). Nesse caso, o sumário executivo deve dizer
  objetivamente que os dados disponíveis são insuficientes para uma análise completa`;

export function buildNarrativePrompt({ companyName, companyType, year, indicators, bp, dsp }) {
  return NARRATIVE_PROMPT
    .replace('{company_name}', companyName)
    .replace('{company_type}', companyType || 'cooperativa')
    .replace('{year}', year)
    .replace('{indicators_json}', JSON.stringify(indicators, null, 2))
    .replace('{bp_json}', JSON.stringify(bp, null, 2))
    .replace('{dsp_json}', JSON.stringify(dsp, null, 2));
}

/**
 * Converte uma recomendação para o texto "Título: descrição".
 *
 * O prompt pede uma lista de strings, mas os modelos às vezes devolvem objetos
 * ({titulo, descricao}) — e aí todo consumidor que trata a recomendação como
 * texto quebra: a tela da análise fazia `rec.indexOf(':')` e derrubava a página
 * inteira, e o relatório Word fazia `rec.replace(...)` e derrubava o download.
 * Normalizar aqui, na fronteira com a IA, deixa o resto do sistema podendo
 * confiar que recomendação é string.
 */
export function normalizeRecomendacao(rec) {
  if (typeof rec === 'string') return rec;
  if (rec && typeof rec === 'object') {
    const titulo = rec.titulo ?? rec.title ?? rec.acao ?? rec.nome ?? '';
    const desc   = rec.descricao ?? rec.description ?? rec.detalhe ?? rec.texto ?? rec.acao_necessaria ?? '';
    if (titulo && desc) return `${titulo}: ${desc}`;
    const unico = titulo || desc;
    if (unico) return String(unico);
    // Formato inesperado: melhor mostrar algo legível do que quebrar.
    return Object.values(rec).filter(v => typeof v === 'string').join(': ') || JSON.stringify(rec);
  }
  return String(rec ?? '');
}

// Campos que o prompt define como parágrafo único de texto.
const CAMPOS_TEXTO = [
  'sumario_executivo', 'sumario', 'liquidez', 'rentabilidade', 'endividamento',
  'capacidade_operacional', 'tesouraria', 'forcas', 'fraquezas', 'riscos',
];

// Mesmo tratamento das recomendações, para os campos de texto: se vier uma
// lista ou um objeto onde o prompt pediu um parágrafo, vira texto legível em
// vez de "[object Object]" — ou de um crash, quando o valor é renderizado
// direto como filho de um elemento React.
function asTexto(v) {
  if (v == null || typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(normalizeRecomendacao).join(' ');
  if (typeof v === 'object') return normalizeRecomendacao(v);
  return String(v);
}

export function normalizeNarrative(n) {
  if (!n || typeof n !== 'object') return n;
  const out = { ...n };
  if (Array.isArray(out.recomendacoes)) {
    out.recomendacoes = out.recomendacoes.map(normalizeRecomendacao);
  }
  for (const campo of CAMPOS_TEXTO) {
    if (campo in out) out[campo] = asTexto(out[campo]);
  }
  return out;
}

export async function generateAnalysisNarrative({ companyName, companyType, year, indicators, bp, dsp }) {
  const prompt = buildNarrativePrompt({ companyName, companyType, year, indicators, bp, dsp });
  const raw = await generateText(prompt, { maxTokens: 8000 });
  return normalizeNarrative(parseJsonFromLLM(raw));
}
