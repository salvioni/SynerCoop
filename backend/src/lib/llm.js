import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const provider = detectProvider();

function detectProvider() {
  if (process.env.LLM_PROVIDER === 'claude' && process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.LLM_PROVIDER === 'gemini' && process.env.GOOGLE_AI_API_KEY) return 'gemini';
  if (process.env.GOOGLE_AI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return null;
}

let claudeClient = null;
let geminiModel = null;

function getClaude() {
  if (!claudeClient) claudeClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return claudeClient;
}

function getGemini() {
  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }
  return geminiModel;
}

export async function generateText(prompt, { maxTokens = 4000 } = {}) {
  if (!provider) {
    throw new Error('Nenhuma API key configurada. Defina GOOGLE_AI_API_KEY ou ANTHROPIC_API_KEY no .env');
  }

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
}

export function getProviderName() {
  return provider || 'none';
}
