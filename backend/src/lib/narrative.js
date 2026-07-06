import { generateText, parseJsonFromLLM } from './llm.js';

// Prompt usado tanto na criação de uma análise (routes/clients.js) quanto na
// regeneração sob demanda (routes/analyses.js) — as duas rotas precisam do
// mesmo parágrafo por seção, então compartilham este template.
const NARRATIVE_PROMPT = `Você é um analista financeiro especializado em cooperativas brasileiras.
Com base nos indicadores financeiros abaixo, gere um relatório de análise detalhado e profissional.

Empresa: {company_name}
Tipo: {company_type}
Exercício: {year}

INDICADORES: {indicators_json}
BALANÇO PATRIMONIAL: {bp_json}
DSP: {dsp_json}

Retorne SOMENTE um JSON válido (sem texto antes ou depois) com esta estrutura:
{
  "sumario": "Parágrafo de 3-5 frases resumindo a situação financeira geral.",
  "liquidez": "Parágrafo analisando liquidez corrente, geral, seca e imobilização. Cite os valores exatos.",
  "rentabilidade": "Parágrafo analisando ROE, ROA, margem e EBITDA. Cite valores.",
  "endividamento": "Parágrafo analisando endividamento total, perfil, alavancagem. Cite valores.",
  "capacidade_operacional": "Parágrafo analisando PMR, PME, PMP, ciclo financeiro, giro. Cite valores.",
  "tesouraria": "Parágrafo analisando capital de giro, NCG, tesouraria, independência. Cite valores.",
  "forcas": "1-2 frases sobre pontos fortes.",
  "fraquezas": "1-2 frases sobre pontos de atenção.",
  "riscos": "1-2 frases sobre riscos identificados.",
  "recomendacoes": ["Recomendação 1: descrição.", "Recomendação 2: descrição.", "Recomendação 3: descrição.", "Recomendação 4: descrição."]
}

Regras:
- Linguagem profissional mas acessível para contadores e diretores
- Cooperativas usam "sobras/perdas" em vez de "lucro/prejuízo"
- Cite valores exatos dos indicadores
- Recomendações práticas e acionáveis`;

export async function generateAnalysisNarrative({ companyName, companyType, year, indicators, bp, dsp }) {
  const prompt = NARRATIVE_PROMPT
    .replace('{company_name}', companyName)
    .replace('{company_type}', companyType || 'cooperativa')
    .replace('{year}', year)
    .replace('{indicators_json}', JSON.stringify(indicators, null, 2))
    .replace('{bp_json}', JSON.stringify(bp, null, 2))
    .replace('{dsp_json}', JSON.stringify(dsp, null, 2));

  const raw = await generateText(prompt, { maxTokens: 8000 });
  return parseJsonFromLLM(raw);
}
