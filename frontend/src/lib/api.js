// Cliente HTTP para a API FinAnalyze.
// Lê o endereço da API de VITE_API_URL ou usa localhost:4000 como padrão.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Hospedagem gratuita (Render) "dorme" o backend após inatividade — a
// primeira requisição depois disso pode falhar (conexão recusada/resetada)
// ou voltar 502/503/504 enquanto a instância acorda, o que pode levar até
// ~1 minuto. Em vez de estourar um erro na primeira tentativa, insiste
// algumas vezes com espera crescente antes de desistir de verdade.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 6000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, options, onRetry) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e;
      onRetry?.(attempt + 1, MAX_RETRIES);
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
      onRetry?.(attempt + 1, MAX_RETRIES);
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    return res;
  }
}

function getToken() {
  return localStorage.getItem('finanalyze_token');
}

export function setToken(t) {
  if (t) localStorage.setItem('finanalyze_token', t);
  else localStorage.removeItem('finanalyze_token');
}

// Lança ApiError se a resposta não for 2xx. Único lugar que interpreta o
// corpo de erro da API — usado por apiCall, uploadFile e downloadFile para
// as três nunca tratarem uma falha de forma diferente uma da outra.
function throwIfError(res, data) {
  if (res.ok) return;
  // Plano foi revogado no meio da sessão (ex.: assinatura cancelada pelo
  // Stripe) — manda de volta pra seleção de plano em vez de deixar toda
  // chamada seguinte quebrar com um erro genérico de 402.
  if (res.status === 402 && data?.fields?.code === 'PLAN_REQUIRED' && location.pathname !== '/select-plan') {
    location.assign('/select-plan');
  }
  throw new ApiError(res.status, data?.error || `Erro ${res.status}`, data?.fields || null, null, data);
}

export async function apiCall(method, path, body, { onRetry } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchWithRetry(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    }, onRetry);
  } catch (e) {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente em instantes.', null, e);
  }

  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }

  throwIfError(res, data);
  return data;
}

/**
 * Upload de arquivo via multipart/form-data.
 * @param {string} path - rota da API
 * @param {File} file - objeto File do input
 * @param {object} [extra] - campos adicionais (chave: valor)
 */
export async function uploadFile(path, file, extra = {}, onRetry) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const form = new FormData();
  form.append('file', file);
  for (const [k, v] of Object.entries(extra)) {
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }

  let res;
  try {
    res = await fetchWithRetry(`${BASE}${path}`, { method: 'POST', headers, body: form }, onRetry);
  } catch (e) {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente em instantes.', null, e);
  }

  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }

  throwIfError(res, data);
  return data;
}

/**
 * Download de arquivo binário (Word, PDF etc.)
 * @returns {Promise<Blob>}
 */
export async function downloadFile(path, onRetry) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchWithRetry(`${BASE}${path}`, { headers }, onRetry);
  } catch (e) {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente em instantes.', null, e);
  }

  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* noop */ }
    throwIfError(res, data);
  }

  return res.blob();
}

export class ApiError extends Error {
  constructor(status, message, fields, cause, raw) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.cause = cause;
    this.raw = raw;
  }
}

export const api = {
  get: (p, opts) => apiCall('GET', p, null, opts),
  post: (p, b, opts) => apiCall('POST', p, b, opts),
  put: (p, b, opts) => apiCall('PUT', p, b, opts),
  patch: (p, b, opts) => apiCall('PATCH', p, b, opts),
  del: (p, opts) => apiCall('DELETE', p, null, opts)
};
