import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseJsonFromLLM } from '../lib/llm.js';

const ORIGINAL_ENV = { ...process.env };

// getProviderName() memoiza a escolha de provider no módulo — vi.resetModules()
// + import dinâmico garante um estado limpo a cada cenário de env vars.
async function freshLlm() {
  vi.resetModules();
  return import('../lib/llm.js');
}

describe('getProviderName', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LLM_PROVIDER;
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('retorna "none" quando nenhuma chave está configurada', async () => {
    const { getProviderName } = await freshLlm();
    expect(getProviderName()).toBe('none');
  });

  it('usa gemini quando só GOOGLE_AI_API_KEY está definida', async () => {
    process.env.GOOGLE_AI_API_KEY = 'fake';
    const { getProviderName } = await freshLlm();
    expect(getProviderName()).toBe('gemini');
  });

  it('usa claude quando só ANTHROPIC_API_KEY está definida', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake';
    const { getProviderName } = await freshLlm();
    expect(getProviderName()).toBe('claude');
  });

  it('prefere gemini quando ambas as chaves estão presentes e LLM_PROVIDER não é definido', async () => {
    process.env.GOOGLE_AI_API_KEY = 'fake';
    process.env.ANTHROPIC_API_KEY = 'fake';
    const { getProviderName } = await freshLlm();
    expect(getProviderName()).toBe('gemini');
  });

  it('respeita LLM_PROVIDER=claude mesmo com GOOGLE_AI_API_KEY presente', async () => {
    process.env.GOOGLE_AI_API_KEY = 'fake';
    process.env.ANTHROPIC_API_KEY = 'fake';
    process.env.LLM_PROVIDER = 'claude';
    const { getProviderName } = await freshLlm();
    expect(getProviderName()).toBe('claude');
  });

  it('ignora LLM_PROVIDER=claude se ANTHROPIC_API_KEY não estiver definida (cai para gemini)', async () => {
    process.env.GOOGLE_AI_API_KEY = 'fake';
    process.env.LLM_PROVIDER = 'claude';
    const { getProviderName } = await freshLlm();
    expect(getProviderName()).toBe('gemini');
  });
});

describe('parseJsonFromLLM', () => {
  it('faz parse de JSON puro', () => {
    expect(parseJsonFromLLM('{"a": 1}')).toEqual({ a: 1 });
  });

  it('remove cercas de código markdown (```json ... ```)', () => {
    expect(parseJsonFromLLM('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('remove cercas de código sem a palavra "json"', () => {
    expect(parseJsonFromLLM('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('descarta texto antes e depois do JSON', () => {
    expect(parseJsonFromLLM('Aqui está o resultado:\n{"a": 1}\nEspero que ajude!')).toEqual({ a: 1 });
  });

  it('remove vírgulas sobrando antes de } ou ]', () => {
    expect(parseJsonFromLLM('{"a": 1, "b": [1, 2,], }')).toEqual({ a: 1, b: [1, 2] });
  });

  // NaN significa "a IA não conseguiu apurar este campo" — vira null (dado
  // ausente), nunca 0. Zerar produziria um indicador falso com cara de fato
  // real (ver a doc de `out()` em calculator.js); o `?? 0` do cálculo já
  // trata o null sem quebrar as contas.
  it('substitui o literal NaN por null (dado ausente, não zero)', () => {
    expect(parseJsonFromLLM('{"a": NaN}')).toEqual({ a: null });
  });

  it('lança erro em JSON genuinamente inválido', () => {
    expect(() => parseJsonFromLLM('não é json')).toThrow();
  });
});
