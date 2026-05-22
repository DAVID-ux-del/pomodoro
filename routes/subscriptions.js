const express = require('express');
const { get, run } = require('../db');
const { authMiddleware } = require('./auth');

const router = express.Router();

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Subscription helper ──
async function applyExpiry(sub) {
  if (!sub) return sub;
  if (sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
    await run('UPDATE subscriptions SET status = $1 WHERE user_id = $2 AND status = $3', ['expired', sub.userId, 'active']);
    sub.status = 'expired';
  }
  return sub;
}

// GET /api/subscription — check current subscription status
router.get('/subscription', authMiddleware, asyncHandler(async (req, res) => {
  let sub = await get('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = $1', [req.user.id]);
  if (!sub) {
    await run(`INSERT INTO subscriptions (user_id, tier, status, current_period_end) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day')`, [req.user.id, 'trial', 'active']);
    sub = await get('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = $1', [req.user.id]);
  }
  await applyExpiry({ ...sub, userId: req.user.id });
  sub = await get('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = $1', [req.user.id]);

  let daysLeft = 0;
  let expired = false;
  if (sub.tier === 'premium') {
    expired = false;
  } else if (sub.current_period_end) {
    const end = new Date(sub.current_period_end);
    const now = new Date();
    if (end <= now || sub.status === 'expired') {
      expired = true;
    } else {
      daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    }
  }

  const pending = await get("SELECT COUNT(*) as count FROM payment_confirmations WHERE user_id = $1 AND status = 'pending'", [req.user.id]);

  res.json({
    tier: sub.tier,
    status: expired ? 'expired' : sub.status,
    daysLeft,
    current_period_end: sub.current_period_end,
    hasPendingRequest: pending.count > 0,
  });
}));

// POST /api/subscriptions/confirm-payment — user says they paid
router.post('/subscriptions/confirm-payment', authMiddleware, asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: '请输入付款备注' });
  }

  const existing = await get("SELECT id FROM payment_confirmations WHERE user_id = $1 AND status = 'pending'", [req.user.id]);
  if (existing) {
    return res.status(400).json({ error: '已有待处理的付款申请，请等待管理员确认' });
  }

  await run('INSERT INTO payment_confirmations (user_id, note) VALUES ($1, $2)', [req.user.id, note.trim()]);
  res.json({ ok: true });
}));

// POST /api/subscriptions/webhook — Stripe webhook (kept for future use)
router.post('/subscriptions/webhook', asyncHandler(async (req, res) => {
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!STRIPE_WEBHOOK_SECRET) return res.status(200).json({ received: true });

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = parseInt(session.client_reference_id);
      if (userId) {
        await run(`UPDATE subscriptions SET tier = $1, status = $2, stripe_subscription_id = $3, current_period_end = CURRENT_TIMESTAMP + INTERVAL '30 days' WHERE user_id = $4`, ['premium', 'active', session.subscription, userId]);
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
}));

module.exports = router;
