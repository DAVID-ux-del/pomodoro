const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscriptions');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Stripe webhook needs raw body — mount before express.json()
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }), subscriptionRoutes);

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', subscriptionRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Pomodoro server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
