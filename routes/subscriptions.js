const express = require('express');
const db = require('../db');
const { authMiddleware } = require('./auth');

const router = express.Router();

// ── Subscription helper ──
function applyExpiry(sub) {
  if (!sub) return sub;
  if (sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
    db.prepare('UPDATE subscriptions SET status = ? WHERE user_id = ? AND status = ?').run('expired', sub.userId, 'active');
    sub.status = 'expired';
  }
  return sub;
}

// GET /api/subscription — check current subscription status
router.get('/subscription', authMiddleware, (req, res) => {
  let sub = db.prepare('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = ?').get(req.user.id);
  if (!sub) {
    db.prepare(`INSERT INTO subscriptions (user_id, tier, status, current_period_end) VALUES (?, ?, ?, datetime('now', '+1 day'))`).run(req.user.id, 'trial', 'active');
    sub = db.prepare('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = ?').get(req.user.id);
  }
  applyExpiry({ ...sub, userId: req.user.id });
  sub = db.prepare('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = ?').get(req.user.id);

  let daysLeft = 0;
  let expired = false;
  if (sub.tier === 'premium') {
    expired = false;
  } else if (sub.current_period_end) {
    const end = new Date(sub.current_period_end + 'Z');
    const now = new Date();
    if (end <= now || sub.status === 'expired') {
      expired = true;
    } else {
      daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    }
  }

  // Check if user has a pending payment request
  const pending = db.prepare("SELECT COUNT(*) as count FROM payment_confirmations WHERE user_id = ? AND status = 'pending'").get(req.user.id);

  res.json({
    tier: sub.tier,
    status: expired ? 'expired' : sub.status,
    daysLeft,
    current_period_end: sub.current_period_end,
    hasPendingRequest: pending.count > 0,
  });
});

// POST /api/subscriptions/confirm-payment — user says they paid
router.post('/subscriptions/confirm-payment', authMiddleware, (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: '请输入付款备注' });
  }

  // Check if already has pending request
  const existing = db.prepare("SELECT id FROM payment_confirmations WHERE user_id = ? AND status = 'pending'").get(req.user.id);
  if (existing) {
    return res.status(400).json({ error: '已有待处理的付款申请，请等待管理员确认' });
  }

  db.prepare('INSERT INTO payment_confirmations (user_id, note) VALUES (?, ?)').run(req.user.id, note.trim());
  res.json({ ok: true });
});

// POST /api/subscriptions/webhook — Stripe webhook (kept for future use)
router.post('/subscriptions/webhook', (req, res) => {
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
        db.prepare(`UPDATE subscriptions SET tier = ?, status = ?, stripe_subscription_id = ?, current_period_end = datetime('now', '+30 days') WHERE user_id = ?`).run('premium', 'active', session.subscription, userId);
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
