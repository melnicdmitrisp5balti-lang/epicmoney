const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { run, get } = require('../db');

// GET /api/balance  - get current user's balance
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT id, username, balance FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/balance/free  - claim hourly free coins (50 coins, max once per hour)
router.post('/free', authMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT id, balance, last_free_coins FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
    if (user.last_free_coins) {
      const elapsed = Date.now() - new Date(user.last_free_coins).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        return res.status(400).json({ error: `Следующие монеты через ${remaining} мин.` });
      }
    }

    await run(
      "UPDATE users SET balance = balance + 50, last_free_coins = datetime('now') WHERE id = ?",
      [user.id]
    );
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [user.id, 'bonus', 50, 'Hourly free coins']
    );

    const updated = await get('SELECT balance FROM users WHERE id = ?', [user.id]);
    res.json({ message: '+50 coins added!', balance: updated.balance });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/balance/transfer  - transfer coins to another user
router.post('/transfer', authMiddleware, async (req, res) => {
  try {
    const { to_username, amount } = req.body;
    if (!to_username || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'to_username and positive amount are required' });
    }

    const sender = await get('SELECT id, username, balance FROM users WHERE id = ?', [req.user.id]);
    if (!sender) return res.status(404).json({ error: 'User not found' });
    if (sender.balance < Number(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const recipient = await get("SELECT id, username FROM users WHERE username = ? AND status = 'active'", [to_username.trim()]);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
    if (recipient.id === sender.id) return res.status(400).json({ error: 'Cannot transfer to yourself' });

    await run('UPDATE users SET balance = balance - ? WHERE id = ?', [Number(amount), sender.id]);
    await run('UPDATE users SET balance = balance + ? WHERE id = ?', [Number(amount), recipient.id]);
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [sender.id, 'withdraw', Number(amount), `Transfer to ${recipient.username}`]
    );
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [recipient.id, 'deposit', Number(amount), `Transfer from ${sender.username}`]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [sender.id, 'transfer', `${sender.username} transferred ${amount} to ${recipient.username}`]
    );

    const updated = await get('SELECT balance FROM users WHERE id = ?', [sender.id]);
    res.json({ message: `Transferred ${amount} to ${recipient.username}`, balance: updated.balance });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/balance/add  (admin) - add balance to a user
router.post('/add', adminMiddleware, async (req, res) => {
  try {
    const { user_id, amount, reason } = req.body;
    if (!user_id || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'user_id and positive amount are required' });
    }

    const user = await get('SELECT id, username FROM users WHERE id = ?', [user_id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await run('UPDATE users SET balance = balance + ? WHERE id = ?', [Number(amount), user_id]);
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason, admin_id) VALUES (?, ?, ?, ?, ?)',
      [user_id, 'deposit', Number(amount), reason || 'Admin deposit', req.admin.id]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_add_balance', `Admin added ${amount} to user ${user.username}`]
    );

    const updated = await get('SELECT id, username, balance FROM users WHERE id = ?', [user_id]);
    res.json({ message: 'Balance updated', user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/balance/withdraw  (admin) - deduct balance from a user
router.post('/withdraw', adminMiddleware, async (req, res) => {
  try {
    const { user_id, amount, reason } = req.body;
    if (!user_id || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'user_id and positive amount are required' });
    }

    const user = await get('SELECT id, username, balance FROM users WHERE id = ?', [user_id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.balance < Number(amount)) {
      return res.status(400).json({ error: 'User has insufficient balance' });
    }

    await run('UPDATE users SET balance = balance - ? WHERE id = ?', [Number(amount), user_id]);
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason, admin_id) VALUES (?, ?, ?, ?, ?)',
      [user_id, 'withdraw', Number(amount), reason || 'Admin withdrawal', req.admin.id]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_withdraw_balance', `Admin deducted ${amount} from user ${user.username}`]
    );

    const updated = await get('SELECT id, username, balance FROM users WHERE id = ?', [user_id]);
    res.json({ message: 'Balance updated', user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
