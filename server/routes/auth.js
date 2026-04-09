const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await get('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    if (email) {
      const emailExists = await get('SELECT id FROM users WHERE email = ?', [email.trim()]);
      if (emailExists) {
        return res.status(409).json({ error: 'Email already registered' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username.trim(), email ? email.trim() : null, hash]
    );

    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [result.lastID, 'register', `User ${username} registered`]
    );

    const token = jwt.sign(
      { id: result.lastID, username: username.trim(), isAdmin: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: result.lastID, username: username.trim(), balance: 1000 }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account is banned' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [user.id, 'login', `User ${username} logged in`]
    );

    const token = jwt.sign(
      { id: user.id, username: user.username, isAdmin: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, balance: user.balance }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/admin-login
router.post('/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const admin = await get('SELECT * FROM admin_users WHERE username = ?', [username.trim()]);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, isAdmin: true },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, admin: { id: admin.id, username: admin.username } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // JWT is stateless; client should discard the token
  res.json({ message: 'Logged out' });
});

module.exports = router;
