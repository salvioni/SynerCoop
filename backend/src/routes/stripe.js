import { Router } from 'express';
import { db } from '../lib/db.js';
import { authRequired, managerOnly, planExempt } from '../middleware/auth.js';
import { badRequest } from '../lib/validate.js';
import logger from '../lib/logger.js';
import { stripe } from '../lib/stripe.js';

const router = Router();

// Planos com assinatura self-serve via Stripe Checkout. Enterprise é sob
// consulta (fluxo comercial manual), por isso não tem price aqui.
const PLAN_PRICES = {
  pro: process.env.STRIPE_PRICE_PRO,
};

// POST /stripe/create-checkout
router.post('/create-checkout', planExempt, authRequired, managerOnly, async (req, res, next) => {
  try {
    if (!stripe) throw badRequest('Stripe não configurado.');
    const plan = req.body?.plan;
    const priceId = PLAN_PRICES[plan];
    if (!priceId) throw badRequest('Plano inválido.');

    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenant_id);
    if (!tenant) throw badRequest('Tenant não encontrado.');

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/select-plan?checkout=success`;
    const cancelUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/select-plan?checkout=cancelled`;

    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        // "E-mail de cobrança" (Ajustes > Escritório) é opcional e costuma
        // ser diferente do e-mail de login de quem faz o checkout (ex.:
        // financeiro da empresa vs. gerente que assina o plano) — quando
        // preenchido, é ele que deve receber faturas do Stripe.
        email: tenant.billing_email || req.user.email,
        name: tenant.name,
        metadata: { tenant_id: tenant.id },
      });
      customerId = customer.id;
      await db.prepare('UPDATE tenants SET stripe_customer_id = ? WHERE id = ?').run(customerId, tenant.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { plan, tenant_id: tenant.id } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ url: session.url });
  } catch (e) { next(e); }
});

// POST /stripe/portal
router.post('/portal', authRequired, managerOnly, async (req, res, next) => {
  try {
    if (!stripe) throw badRequest('Stripe não configurado.');
    const tenant = await db.prepare('SELECT stripe_customer_id FROM tenants WHERE id = ?').get(req.user.tenant_id);
    if (!tenant?.stripe_customer_id) throw badRequest('Nenhuma assinatura ativa encontrada.');

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/account`,
    });
    res.json({ url: session.url });
  } catch (e) { next(e); }
});

// POST /stripe/webhook
router.post('/webhook', async (req, res) => {
  if (!stripe) return res.sendStatus(200);

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn({ err: err.message }, 'Stripe webhook signature verification failed');
    return res.sendStatus(400);
  }

  try {
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
      const sub = event.data.object;
      const customerId = sub.customer;
      if (sub.status === 'active') {
        // Assinaturas criadas fora do checkout self-serve (ex: negociadas
        // manualmente no dashboard do Stripe para Enterprise) não têm
        // metadata.plan — tratamos como Enterprise nesse caso.
        const plan = sub.metadata?.plan || 'enterprise';
        // COALESCE preserva a data original de onboarding em renovações
        // subsequentes — só grava na primeira vez que o tenant fica ativo.
        await db.prepare(`
          UPDATE tenants SET plan = ?, onboarded_at = COALESCE(onboarded_at, CURRENT_TIMESTAMP)
          WHERE stripe_customer_id = ?
        `).run(plan, customerId);
      } else {
        await db.prepare('UPDATE tenants SET plan = NULL WHERE stripe_customer_id = ?').run(customerId);
      }
    }
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await db.prepare('UPDATE tenants SET plan = NULL WHERE stripe_customer_id = ?').run(sub.customer);
    }
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack?.split('\n').slice(0, 3) }, 'Stripe webhook handler error');
  }

  res.sendStatus(200);
});

export default router;
