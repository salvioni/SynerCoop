import { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../lib/db.js';
import { authRequired, managerOnly } from '../middleware/auth.js';
import { badRequest } from '../lib/validate.js';
import logger from '../lib/logger.js';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

// POST /stripe/create-checkout
router.post('/create-checkout', authRequired, managerOnly, async (req, res, next) => {
  try {
    if (!stripe) throw badRequest('Stripe não configurado.');
    const priceId = req.body?.priceId;
    if (!priceId) throw badRequest('priceId é obrigatório.');

    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.user.tenant_id);
    if (!tenant) throw badRequest('Tenant não encontrado.');

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/account?checkout=success`;
    const cancelUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/account?checkout=cancelled`;

    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
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
    logger.warn('Stripe webhook signature verification failed', { err: err.message });
    return res.sendStatus(400);
  }

  try {
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
      const sub = event.data.object;
      const customerId = sub.customer;
      const plan = sub.status === 'active' ? (sub.metadata?.plan || 'pro') : null;
      await db.prepare('UPDATE tenants SET plan = ? WHERE stripe_customer_id = ?').run(plan, customerId);
    }
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await db.prepare('UPDATE tenants SET plan = NULL WHERE stripe_customer_id = ?').run(sub.customer);
    }
  } catch (err) {
    logger.error('Stripe webhook handler error', { err });
  }

  res.sendStatus(200);
});

export default router;
