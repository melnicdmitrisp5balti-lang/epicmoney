const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { run, get, all } = require('../db');

// GET /api/users  (admin)
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const users = await all(
      'SELECT id, username, email, balance, status, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await get(
      'SELECT id, username, email, balance, status, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id  (admin)
router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const { username, email, balance, status } = req.body;
    const user = await get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const fields = [];
    const values = [];
    if (username !== undefined) { fields.push('username = ?'); values.push(username.trim()); }
    if (email !== undefined)    { fields.push('email = ?');    values.push(email ? email.trim() : null); }
    if (balance !== undefined)  { fields.push('balance = ?');  values.push(Number(balance)); }
    if (status !== undefined)   { fields.push('status = ?');   values.push(status); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_update_user', `Admin updated user ${req.params.id}`]
    );

    const updated = await get(
      'SELECT id, username, email, balance, status, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users/:id/ban  (admin)
router.post('/:id/ban', adminMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT id, username FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await run('UPDATE users SET status = ? WHERE id = ?', ['banned', req.params.id]);
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_ban_user', `Admin banned user ${user.username}`]
    );
    res.json({ message: `User ${user.username} banned` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users/:id/unban  (admin)
router.post('/:id/unban', adminMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT id, username FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    await run('UPDATE users SET status = ? WHERE id = ?', ['active', req.params.id]);
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_unban_user', `Admin unbanned user ${user.username}`]
    );
    res.json({ message: `User ${user.username} unbanned` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
