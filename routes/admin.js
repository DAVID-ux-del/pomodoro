const express = require('express');
const db = require('../db');
const { authMiddleware, adminMiddleware } = require('./auth');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/users — list all users with stats
router.get('/users', (req, res) => {
  const users = db.prepare(`
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
  `).all();

  res.json({ users });
});

// GET /api/admin/stats — global statistics
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM sessions) as total_sessions,
      (SELECT COUNT(*) FROM sessions WHERE type = 'work') as work_sessions,
      (SELECT COALESCE(SUM(CASE WHEN type = 'work' THEN duration ELSE 0 END), 0) FROM sessions) as total_minutes
  `).get();

  res.json(stats);
});

// GET /api/admin/pending-payments — list pending payment confirmations
router.get('/pending-payments', (req, res) => {
  const payments = db.prepare(`
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
  `).all();
  res.json({ payments });
});

// POST /api/admin/confirm-payment/:id — confirm payment & activate subscription
router.post('/confirm-payment/:id', (req, res) => {
  const payment = db.prepare("SELECT * FROM payment_confirmations WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!payment) return res.status(404).json({ error: '申请不存在或已处理' });

  db.prepare(`UPDATE subscriptions SET tier = ?, status = ?, current_period_end = datetime('now', '+30 days') WHERE user_id = ?`).run('premium', 'active', payment.user_id);
  db.prepare("UPDATE payment_confirmations SET status = ?, confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ?").run('confirmed', req.user.id, payment.id);

  res.json({ ok: true, username: payment.username || db.prepare('SELECT username FROM users WHERE id = ?').get(payment.user_id).username });
});

// POST /api/admin/reject-payment/:id — reject payment
router.post('/reject-payment/:id', (req, res) => {
  const payment = db.prepare("SELECT * FROM payment_confirmations WHERE id = ? AND status = 'pending'").get(req.params.id);
  if (!payment) return res.status(404).json({ error: '申请不存在或已处理' });

  db.prepare("UPDATE payment_confirmations SET status = ?, confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ?").run('rejected', req.user.id, payment.id);
  res.json({ ok: true });
});

module.exports = router;
