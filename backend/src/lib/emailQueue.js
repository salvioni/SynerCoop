// lib/emailQueue.js — Fila leve de e-mail com retry e backoff exponencial.
//
// In-memory: e-mails enfileirados que ainda não foram enviados são perdidos
// em caso de restart. É uma troca consciente por simplicidade de deploy —
// todas as rotas que enviam e-mail expõem endpoints de reenvio (resend-code,
// forgot-password, invite) para que o usuário possa solicitar novamente.

import logger from './logger.js';

const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 2_000; // atrasos sequenciais: 2s → 4s → 8s

class EmailQueue {
  #pending = [];
  #running = false;

  /**
   * Enfileira uma tarefa de envio de e-mail.
   * A tarefa é executada de forma assíncrona — esta chamada retorna
   * imediatamente sem aguardar o envio.
   *
   * @param {() => Promise<void>} task   Função que efetua o envio
   * @param {string}             label   Descrição para logs (ex: 'verify:foo@bar.com')
   */
  enqueue(task, label = 'email') {
    this.#pending.push({ task, label, attempts: 0 });
    if (!this.#running) this.#drain();
  }

  async #drain() {
    this.#running = true;
    while (this.#pending.length > 0) {
      const item = this.#pending.shift();
      await this.#run(item);
    }
    this.#running = false;
  }

  async #run(item) {
    item.attempts++;
    try {
      await item.task();
      if (item.attempts > 1) {
        logger.info({ label: item.label, attempts: item.attempts }, 'email enviado após retry');
      }
    } catch (err) {
      logger.warn({ label: item.label, attempts: item.attempts, err: err.message }, 'falha ao enviar email');
      if (item.attempts < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * (2 ** (item.attempts - 1));
        await new Promise(r => setTimeout(r, delay));
        this.#pending.unshift(item); // recoloca na frente da fila
      } else {
        logger.error({ label: item.label }, `email abandonado após ${MAX_RETRIES} tentativas`);
      }
    }
  }
}

export const emailQueue = new EmailQueue();
