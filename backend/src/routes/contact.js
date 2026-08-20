import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { badRequest, trim, isValidEmail } from '../lib/validate.js';
import { sendContactEmail } from '../lib/email.js';
import logger from '../lib/logger.js';

const router = Router();

// Formulário público: sem autenticação, então o limite é por IP e apertado.
// 3/min é folgado para quem escreve de verdade e inviável para um script.
const contactLimit = rateLimit({
  windowMs: 60_000, max: 3,
  message: { error: 'Muitas mensagens em sequência. Aguarde 1 minuto.' },
  standardHeaders: true, legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const MAX = { nome: 120, email: 160, empresa: 160, telefone: 40, mensagem: 4000 };

// POST /contact — mensagem do formulário de contato do site
router.post('/', contactLimit, async (req, res, next) => {
  try {
    const nome     = trim(req.body?.nome);
    const email    = trim(req.body?.email)?.toLowerCase();
    const empresa  = trim(req.body?.empresa)  || null;
    const telefone = trim(req.body?.telefone) || null;
    const mensagem = trim(req.body?.mensagem);
    // Campo isca: invisível para quem usa o site, irresistível para robôs que
    // preenchem tudo. Responde 200 para o robô não descobrir que foi barrado.
    const isca = trim(req.body?.website);

    const erros = {};
    if (!nome) erros.nome = 'Informe seu nome.';
    if (!email || !isValidEmail(email)) erros.email = 'Informe um e-mail válido.';
    if (!mensagem) erros.mensagem = 'Escreva sua mensagem.';
    const valores = { nome, email, empresa, telefone, mensagem };
    for (const [campo, max] of Object.entries(MAX)) {
      const v = valores[campo];
      if (v && v.length > max) erros[campo] = `Máximo de ${max} caracteres.`;
    }
    if (Object.keys(erros).length) throw badRequest('Revise os campos destacados.', erros);

    if (isca) return res.json({ ok: true });

    const r = await sendContactEmail({ nome, email, empresa, telefone, mensagem });
    if (!r.sent) {
      // A mensagem não pode simplesmente evaporar: fica no log, com tudo o que
      // é preciso para responder à mão enquanto o envio não volta.
      logger.error({ erro: r.error, nome, email, empresa, telefone, mensagem }, 'contato não enviado');
      throw badRequest(
        'Não conseguimos enviar sua mensagem agora. Tente novamente em alguns minutos '
        + 'ou escreva direto para contato@synercoop.com.br.'
      );
    }
    logger.info({ email }, 'contato enviado');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
