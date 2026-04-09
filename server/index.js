require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Initialize SQLite (must be required before routes that use it)
require('./db');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const gamesRoutes = require('./routes/games');
const betsRoutes = require('./routes/bets');
const balanceRoutes = require('./routes/balance');
const logsRoutes = require('./routes/logs');
const promoRoutes = require('./routes/promo');
const statsRoutes = require('./routes/stats');
const settingsRoutes = require('./routes/settings');
const { initSocketHandlers } = require('./socket/handlers');
const authMiddleware = require('./middleware/auth');
const { get } = require('./db');

// Fail fast if required environment variables are missing
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Please set it before starting the server.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Restrict allowed origins via env var
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(express.static(path.join(__dirname, '../client')));

// Auth routes
app.use('/api/auth', authLimiter, authRoutes);

// Profile route (current user)
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const user = await get(
      'SELECT id, username, email, balance, status, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Resource routes
app.use('/api/users', apiLimiter, usersRoutes);
app.use('/api/games', apiLimiter, gamesRoutes);
app.use('/api/bets', apiLimiter, betsRoutes);
app.use('/api/balance', apiLimiter, balanceRoutes);
app.use('/api/logs', apiLimiter, logsRoutes);
app.use('/api/promo', apiLimiter, promoRoutes);
app.use('/api/stats', apiLimiter, statsRoutes);
app.use('/api/settings', apiLimiter, settingsRoutes);

// Fallback to index.html for SPA-like navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Socket.io
initSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

module.exports = { io };
