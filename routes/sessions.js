const express = require('express');
const db = require('../db');
const { authMiddleware } = require('./auth');

const router = express.Router();

// POST /api/sessions — record a completed session
router.post('/sessions', authMiddleware, (req, res) => {
  const { type, duration } = req.body;
  if (!type || !['work', 'break', 'long_break'].includes(type)) {
    return res.status(400).json({ error: '无效的会话类型' });
  }
  if (!duration || duration < 1) {
    return res.status(400).json({ error: '无效的时长' });
  }

  db.prepare('INSERT INTO sessions (user_id, type, duration) VALUES (?, ?, ?)').run(req.user.id, type, duration);
  res.json({ ok: true });
});

// GET /api/sessions — list user's session history
router.get('/sessions', authMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?').get(req.user.id).count;
  const rows = db.prepare('SELECT id, type, duration, completed_at FROM sessions WHERE user_id = ? ORDER BY completed_at DESC LIMIT ? OFFSET ?').all(req.user.id, limit, offset);

  res.json({ sessions: rows, total, page, limit });
});

// GET /api/stats — user's aggregate stats
router.get('/stats', authMiddleware, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      COUNT(CASE WHEN type = 'work' THEN 1 END) as work_sessions,
      COALESCE(SUM(CASE WHEN type = 'work' THEN duration ELSE 0 END), 0) as total_minutes
    FROM sessions WHERE user_id = ?
  `).get(req.user.id);

  res.json(stats);
});

module.exports = router;
