// Cliente HTTP para a API FinAnalyze.
// Lê o endereço da API de VITE_API_URL ou usa localhost:4000 como padrão.

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function getToken() {
  return localStorage.getItem('finanalyze_token');
}

export function setToken(t) {
  if (t) localStorage.setItem('finanalyze_token', t);
  else localStorage.removeItem('finanalyze_token');
}

export async function apiCall(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    throw new ApiError(0, 'Não foi possível conectar ao servidor. Verifique se o backend está rodando.', null, e);
  }

  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Erro ${res.status}`, data?.fields || null, null, data);
  }
  return data;
}

/**
 * Upload de arquivo via multipart/form-data.
 * @param {string} path - rota da API
 * @param {File} file - objeto File do input
 * @param {object} [extra] - campos adicionais (chave: valor)
 */
export async function uploadFile(path, file, extra = {}) {
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
    res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: form });
  } catch (e) {
    throw new ApiError(0, 'Não foi possível conectar ao servidor.', null, e);
  }

  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Erro ${res.status}`, data?.fields || null, null, data);
  }
  return data;
}

/**
 * Download de arquivo binário (Word, PDF etc.)
 * @returns {Promise<Blob>}
 */
export async function downloadFile(path) {
  const token = getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, { headers });
  } catch (e) {
    throw new ApiError(0, 'Não foi possível conectar ao servidor.', null, e);
  }

  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* noop */ }
    throw new ApiError(res.status, data?.error || `Erro ${res.status}`, null, null, data);
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
  get: (p) => apiCall('GET', p),
  post: (p, b) => apiCall('POST', p, b),
  put: (p, b) => apiCall('PUT', p, b),
  patch: (p, b) => apiCall('PATCH', p, b),
  del: (p) => apiCall('DELETE', p)
};
