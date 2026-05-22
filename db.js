const pg = require('pg');
pg.defaults.parseInt8 = true;
const { Pool } = pg;
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/pomodoro',
});

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('work','break','long_break')),
    duration INTEGER NOT NULL,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'trial',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','cancelled')),
    stripe_subscription_id TEXT,
    current_period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payment_confirmations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    confirmed_by INTEGER REFERENCES users(id)
  );
`;

// Helper: db.get(sql, [...params]) → single row or null
async function get(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

// Helper: db.all(sql, [...params]) → array of rows
async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// Helper: db.run(sql, [...params]) → { rowCount, rows[0] if RETURNING }
async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return { rowCount: result.rowCount, rows: result.rows };
}

// Init: create tables and seed admin
async function initDB() {
  await pool.query(SCHEMA);
  const admin = await get('SELECT id FROM users WHERE username = $1', ['admin']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    await run('INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)', ['admin', hash, 'admin']);
    console.log('✓ Default admin account created (admin / admin123)');
  }
  console.log('✓ Database connected and schema ready');
}

module.exports = { pool, get, all, run, initDB };
