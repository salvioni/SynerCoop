import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const SECRET         = process.env.JWT_SECRET         || 'dev-secret-change-me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (SECRET + '-refresh-v1');

/**
 * Assina um access token JWT.
 * O campo `tv` (token_version) permite invalidar tokens remotamente sem
 * revogar o secret inteiro — basta incrementar a versão no banco.
 *
 * @param {{ uid, cid, role, tv }} payload
 */
export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/**
 * Gera um refresh token seguro (96 hex chars = 384 bits de entropia).
 * O token em texto puro é retornado ao cliente; apenas o hash é armazenado
 * no banco — igual à abordagem de tokens de reset de senha.
 */
export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Gera o hash HMAC-SHA256 do refresh token para armazenamento no banco.
 * Usa REFRESH_SECRET como chave para evitar colisão com hashes de outros tokens.
 */
export function hashRefreshToken(token) {
  return crypto.createHmac('sha256', REFRESH_SECRET).update(token).digest('hex');
}
