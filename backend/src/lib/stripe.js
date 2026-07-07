import Stripe from 'stripe';

// Cliente único do Stripe, compartilhado entre routes/stripe.js (checkout,
// portal, webhook) e routes/account.js (sincronizar e-mail de cobrança) —
// null quando a chave não está configurada (dev sem Stripe), pra cada rota
// decidir como degradar em vez de duplicar essa checagem.
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;
