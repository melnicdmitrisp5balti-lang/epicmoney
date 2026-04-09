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
    res.json({ message: `Balance updated`, user: updated });
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
    res.json({ message: `Balance updated`, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
