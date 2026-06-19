import { initDb } from '../lib/db.js';
import { seedDb } from '../lib/seed.js';

// Roda uma vez antes de todos os testes
export async function setupTestDb() {
  process.env.JWT_SECRET = 'test-secret-com-pelo-menos-32-caracteres-aqui';
  process.env.NODE_ENV = 'test';
  // Desabilita envio real de email em testes
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
  // Desabilita chamadas reais à API do Anthropic em testes
  delete process.env.ANTHROPIC_API_KEY;
  await initDb();
  await seedDb();
}
