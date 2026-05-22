const express = require('express');
const { get, run, all } = require('../db');
const { authMiddleware } = require('./auth');

const router = express.Router();

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/sessions — record a completed session
router.post('/sessions', authMiddleware, asyncHandler(async (req, res) => {
  const { type, duration } = req.body;
  if (!type || !['work', 'break', 'long_break'].includes(type)) {
    return res.status(400).json({ error: '无效的会话类型' });
  }
  if (!duration || duration < 1) {
    return res.status(400).json({ error: '无效的时长' });
  }

  await run('INSERT INTO sessions (user_id, type, duration) VALUES ($1, $2, $3)', [req.user.id, type, duration]);
  res.json({ ok: true });
}));

// GET /api/sessions — list user's session history
router.get('/sessions', authMiddleware, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const total = (await get('SELECT COUNT(*) as count FROM sessions WHERE user_id = $1', [req.user.id])).count;
  const rows = await all('SELECT id, type, duration, completed_at FROM sessions WHERE user_id = $1 ORDER BY completed_at DESC LIMIT $2 OFFSET $3', [req.user.id, limit, offset]);

  res.json({ sessions: rows, total, page, limit });
}));

// GET /api/stats — user's aggregate stats
router.get('/stats', authMiddleware, asyncHandler(async (req, res) => {
  const stats = await get(`
    SELECT
      COUNT(*) as total_sessions,
      COUNT(CASE WHEN type = 'work' THEN 1 END) as work_sessions,
      COALESCE(SUM(CASE WHEN type = 'work' THEN duration ELSE 0 END), 0) as total_minutes
    FROM sessions WHERE user_id = $1
  `, [req.user.id]);

  res.json(stats);
}));

module.exports = router;
