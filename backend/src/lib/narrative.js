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

export async function generateAnalysisNarrative({ companyName, companyType, year, indicators, bp, dsp }) {
  const prompt = buildNarrativePrompt({ companyName, companyType, year, indicators, bp, dsp });
  const raw = await generateText(prompt, { maxTokens: 8000 });
  return parseJsonFromLLM(raw);
}
