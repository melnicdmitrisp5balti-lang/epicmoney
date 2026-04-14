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

// Generate a unique referral code for a user
function generateReferralCode(username) {
  const prefix = username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'USER';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return prefix + suffix;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, referral_code } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
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
    const refCode = generateReferralCode(username);
    let startBalance = 100;

    // Handle referral bonus: +100 for both new user and referrer
    let referrerId = null;
    if (referral_code) {
      const referrer = await get('SELECT id FROM users WHERE referral_code = ?', [referral_code.trim().toUpperCase()]);
      if (referrer) {
        referrerId = referrer.id;
        startBalance += 100;
      }
    }

    const result = await run(
      'INSERT INTO users (username, email, password, referral_code, balance) VALUES (?, ?, ?, ?, ?)',
      [username.trim(), email ? email.trim() : null, hash, refCode, startBalance]
    );

    // Give referral bonus to referrer
    if (referrerId) {
      await run('UPDATE users SET balance = balance + 100 WHERE id = ?', [referrerId]);
      await run(
        'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
        [referrerId, 'bonus', 100, `Referral bonus: ${username} registered`]
      );
    }

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
      user: { id: result.lastID, username: username.trim(), balance: startBalance, referral_code: refCode }
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
      user: { id: user.id, username: user.username, balance: user.balance, referral_code: user.referral_code }
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
