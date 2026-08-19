// lib/storage.js — Armazenamento de imagens (avatars, logos)
//
// Quando UPLOAD_DIR está configurado: salva em disco, retorna URL relativa
// servida via GET /uploads/* (com autenticação Bearer).
// Quando não está: converte o buffer para base64 data URL (desenvolvimento
// local e ambientes sem volume persistente).
//
// Estrutura no disco:
//   {UPLOAD_DIR}/{tenantId}/avatars/{hex}.{ext}
//   {UPLOAD_DIR}/{tenantId}/logos/{hex}.{ext}
//   {UPLOAD_DIR}/{tenantId}/client-logos/{hex}.{ext}

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || '';
export const useDiskStorage = Boolean(UPLOAD_DIR);

const MIME_TO_EXT = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/bmp':  'bmp',
};

/**
 * Persiste uma imagem (buffer) em disco ou como base64 data URL.
 *
 * @param {Buffer} buffer    Conteúdo binário da imagem
 * @param {string} mimetype  MIME type (ex: 'image/png')
 * @param {string} category  Sub-pasta: 'avatars' | 'logos' | 'client-logos'
 * @param {string} tenantId  Tenant owner (garante isolamento de pasta)
 * @returns {Promise<string>} URL '/uploads/...' ou data URL base64
 */
export async function saveImage(buffer, mimetype, category, tenantId) {
  const ext = MIME_TO_EXT[mimetype];
  if (!ext) throw new Error('Formato de imagem não suportado.');

  if (!useDiskStorage) {
    return `data:${mimetype};base64,${buffer.toString('base64')}`;
  }

  const dir = path.join(UPLOAD_DIR, tenantId, category);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/${tenantId}/${category}/${filename}`;
}

/**
 * Remove arquivo de upload anterior do disco.
 * No-op para base64 data URLs ou quando disco não está ativado.
 */
export async function deleteImage(urlOrBase64) {
  if (!useDiskStorage || !urlOrBase64 || urlOrBase64.startsWith('data:')) return;
  const rel = urlOrBase64.replace(/^\/uploads\//, '');
  try {
    await fs.unlink(path.join(UPLOAD_DIR, rel));
  } catch { /* já removido ou não encontrado */ }
}
