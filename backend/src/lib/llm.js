import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

let _provider = null;

function getProvider() {
  if (_provider !== null) return _provider;
  if (process.env.LLM_PROVIDER === 'claude' && process.env.ANTHROPIC_API_KEY) _provider = 'claude';
  else if (process.env.LLM_PROVIDER === 'gemini' && process.env.GOOGLE_AI_API_KEY) _provider = 'gemini';
  else if (process.env.GOOGLE_AI_API_KEY) _provider = 'gemini';
  else if (process.env.ANTHROPIC_API_KEY) _provider = 'claude';
  else _provider = '';
  return _provider;
}

let claudeClient = null;
let geminiModel = null;

function getClaude() {
  if (!claudeClient) claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return claudeClient;
}

const GEMINI_MODEL = 'gemini-2.5-flash';

function getGemini() {
  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    // genAI.getGenerativeModel() só monta o cliente localmente — nunca valida
    // o nome do modelo contra a API, então um try/catch aqui nunca captura
    // nada (um modelo inválido só falha depois, em generateContent()).
    geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    console.log(`[llm] Usando modelo: ${GEMINI_MODEL}`);
  }
  return geminiModel;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function generateText(prompt, { maxTokens = 4000, retries = 2 } = {}) {
  const provider = getProvider();
  if (!provider) {
    throw new Error('Nenhuma API key de IA configurada. Configure GOOGLE_AI_API_KEY ou ANTHROPIC_API_KEY no arquivo .env do backend.');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (provider === 'gemini') {
        const model = getGemini();
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        });
        return result.response.text().trim();
      }

      const client = getClaude();
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      return response.content[0].text.trim();
    } catch (e) {
      const isRateLimit = e.status === 429 || e.status === 503 || e.message?.includes('429') || e.message?.includes('503') || e.message?.includes('quota') || e.message?.includes('Service Unavailable');
      if (isRateLimit && attempt < retries) {
        const wait = (attempt + 1) * 30000;
        console.warn(`[llm] Rate limit (${provider}), tentativa ${attempt + 1}/${retries + 1}. Aguardando ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (isRateLimit) {
        throw new Error(`Limite de requisições da IA atingido (${provider}). Tente novamente em alguns minutos.`);
      }
      throw e;
    }
  }
}

export function getProviderName() {
  return getProvider() || 'none';
}

// Extrai e faz o parse do JSON de uma resposta de LLM — cobre os problemas
// mais comuns: texto antes/depois do JSON, cercas de código markdown,
// vírgulas sobrando antes de `}`/`]` e o literal NaN (inválido em JSON).
export function parseJsonFromLLM(raw) {
  let text = raw;
  if (text.includes('```')) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) text = match[1];
  }
  text = text.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.substring(start, end + 1);
  text = text.replace(/,\s*([}\]])/g, '$1');
  text = text.replace(/:\s*NaN/g, ': 0');
  return JSON.parse(text);
}
