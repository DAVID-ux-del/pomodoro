const express = require('express');
const { get, all, run } = require('../db');
const { authMiddleware, adminMiddleware } = require('./auth');

const router = express.Router();

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(authMiddleware, adminMiddleware);

// GET /api/admin/users — list all users with stats
router.get('/users', asyncHandler(async (req, res) => {
  const users = await all(`
    SELECT
      u.id,
      u.username,
      u.role,
      u.created_at,
      COUNT(s.id) as total_sessions,
      COALESCE(SUM(CASE WHEN s.type = 'work' THEN s.duration ELSE 0 END), 0) as total_minutes
    FROM users u
    LEFT JOIN sessions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);

  res.json({ users });
}));

// GET /api/admin/stats — global statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await get(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM sessions) as total_sessions,
      (SELECT COUNT(*) FROM sessions WHERE type = 'work') as work_sessions,
      (SELECT COALESCE(SUM(CASE WHEN type = 'work' THEN duration ELSE 0 END), 0) FROM sessions) as total_minutes
  `);

  res.json(stats);
}));

// GET /api/admin/pending-payments — list pending payment confirmations
router.get('/pending-payments', asyncHandler(async (req, res) => {
  const payments = await all(`
    SELECT
      pc.id,
      pc.user_id,
      u.username,
      pc.note,
      pc.created_at
    FROM payment_confirmations pc
    JOIN users u ON u.id = pc.user_id
    WHERE pc.status = 'pending'
    ORDER BY pc.created_at ASC
  `);
  res.json({ payments });
}));

// POST /api/admin/confirm-payment/:id — confirm payment & activate subscription
router.post('/confirm-payment/:id', asyncHandler(async (req, res) => {
  const payment = await get("SELECT * FROM payment_confirmations WHERE id = $1 AND status = 'pending'", [req.params.id]);
  if (!payment) return res.status(404).json({ error: '申请不存在或已处理' });

  await run(`UPDATE subscriptions SET tier = $1, status = $2, current_period_end = CURRENT_TIMESTAMP + INTERVAL '30 days' WHERE user_id = $3`, ['premium', 'active', payment.user_id]);
  await run("UPDATE payment_confirmations SET status = $1, confirmed_at = CURRENT_TIMESTAMP, confirmed_by = $2 WHERE id = $3", ['confirmed', req.user.id, payment.id]);

  const username = payment.username || (await get('SELECT username FROM users WHERE id = $1', [payment.user_id])).username;
  res.json({ ok: true, username });
}));

// POST /api/admin/reject-payment/:id — reject payment
router.post('/reject-payment/:id', asyncHandler(async (req, res) => {
  const payment = await get("SELECT * FROM payment_confirmations WHERE id = $1 AND status = 'pending'", [req.params.id]);
  if (!payment) return res.status(404).json({ error: '申请不存在或已处理' });

  await run("UPDATE payment_confirmations SET status = $1, confirmed_at = CURRENT_TIMESTAMP, confirmed_by = $2 WHERE id = $3", ['rejected', req.user.id, payment.id]);
  res.json({ ok: true });
}));

module.exports = router;
