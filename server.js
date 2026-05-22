const express = require('express');
const cors = require('cors');
const path = require('path');
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

// API routes (JSON body)
app.use('/api/auth', authRoutes);
app.use('/api', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', subscriptionRoutes);

app.listen(PORT, () => {
  console.log(`✓ Pomodoro server running at http://localhost:${PORT}`);
});
