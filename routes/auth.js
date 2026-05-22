const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pomodoro-secret-key-2024';

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Auth middleware
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await get('SELECT id, username, role, created_at FROM users WHERE id = $1', [payload.userId]);
    if (!user) return res.status(401).json({ error: '用户不存在' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// Admin middleware
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权限' });
  }
  next();
}

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名长度 2-20 个字符' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少 4 个字符' });

  const existing = await get('SELECT id FROM users WHERE username = $1', [username]);
  if (existing) return res.status(409).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await run('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id', [username, hash]);
  const userId = result.rows[0].id;

  await run(`INSERT INTO subscriptions (user_id, tier, status, current_period_end) VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '1 day')`, [userId, 'trial', 'active']);

  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
  const newSub = await get('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = $1', [userId]);

  res.json({ token, user: { id: userId, username, role: 'user', subscription: newSub } });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

  const user = await get('SELECT * FROM users WHERE username = $1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const sub = await get('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = $1', [user.id]);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, subscription: sub || { tier: 'trial', status: 'active', current_period_end: null } } });
}));

// GET /api/auth/me
router.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const sub = await get('SELECT tier, status, current_period_end FROM subscriptions WHERE user_id = $1', [req.user.id]);
  res.json({ user: { ...req.user, subscription: sub || { tier: 'trial', status: 'active', current_period_end: null } } });
}));

module.exports = router;
module.exports.authMiddleware = authMiddleware;
module.exports.adminMiddleware = adminMiddleware;
