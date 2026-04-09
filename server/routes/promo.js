const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { run, get, all } = require('../db');

// GET /api/promo  (admin) - list all promo codes
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const codes = await all('SELECT * FROM promo_codes ORDER BY created_at DESC');
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/promo  (admin) - create a promo code
router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { code, type, value, limit_uses, expires_at } = req.body;
    if (!code || !type || value === undefined) {
      return res.status(400).json({ error: 'code, type, and value are required' });
    }
    if (!['coins', 'percent'].includes(type)) {
      return res.status(400).json({ error: 'type must be coins or percent' });
    }
    if (isNaN(value) || Number(value) <= 0) {
      return res.status(400).json({ error: 'value must be a positive number' });
    }

    const { lastID } = await run(
      'INSERT INTO promo_codes (code, type, value, limit_uses, expires_at) VALUES (?, ?, ?, ?, ?)',
      [
        code.trim().toUpperCase(),
        type,
        Number(value),
        Number(limit_uses) || 1,
        expires_at || null
      ]
    );

    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_create_promo', `Admin created promo code ${code}`]
    );

    const created = await get('SELECT * FROM promo_codes WHERE id = ?', [lastID]);
    res.status(201).json(created);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Promo code already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/promo/:id  (admin) - update a promo code
router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const promo = await get('SELECT id FROM promo_codes WHERE id = ?', [req.params.id]);
    if (!promo) return res.status(404).json({ error: 'Promo code not found' });

    const { code, type, value, limit_uses, expires_at } = req.body;
    const fields = [];
    const values = [];
    if (code !== undefined)       { fields.push('code = ?');       values.push(code.trim().toUpperCase()); }
    if (type !== undefined)       { fields.push('type = ?');       values.push(type); }
    if (value !== undefined)      { fields.push('value = ?');      values.push(Number(value)); }
    if (limit_uses !== undefined) { fields.push('limit_uses = ?'); values.push(Number(limit_uses)); }
    if (expires_at !== undefined) { fields.push('expires_at = ?'); values.push(expires_at); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await run(`UPDATE promo_codes SET ${fields.join(', ')} WHERE id = ?`, values);

    const updated = await get('SELECT * FROM promo_codes WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/promo/:id  (admin) - delete a promo code
router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const promo = await get('SELECT id, code FROM promo_codes WHERE id = ?', [req.params.id]);
    if (!promo) return res.status(404).json({ error: 'Promo code not found' });

    await run('DELETE FROM promo_codes WHERE id = ?', [req.params.id]);
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_delete_promo', `Admin deleted promo code ${promo.code}`]
    );
    res.json({ message: 'Promo code deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/promo/:code/use  - use a promo code (authenticated user)
router.post('/:code/use', authMiddleware, async (req, res) => {
  try {
    const code = req.params.code.trim().toUpperCase();
    const promo = await get('SELECT * FROM promo_codes WHERE code = ?', [code]);
    if (!promo) return res.status(404).json({ error: 'Invalid promo code' });

    // Check expiry
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Promo code has expired' });
    }

    // Check usage limit
    if (promo.used_count >= promo.limit_uses) {
      return res.status(400).json({ error: 'Promo code usage limit reached' });
    }

    const user = await get('SELECT id, username, balance FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Calculate bonus
    let bonus;
    if (promo.type === 'coins') {
      bonus = promo.value;
    } else {
      bonus = Math.floor(user.balance * (promo.value / 100));
    }

    await run('UPDATE users SET balance = balance + ? WHERE id = ?', [bonus, req.user.id]);
    await run('UPDATE promo_codes SET used_count = used_count + 1 WHERE id = ?', [promo.id]);
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, 'bonus', bonus, `Promo code ${code}`]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.user.id, 'use_promo', `User used promo code ${code}, got ${bonus}`]
    );

    const updated = await get('SELECT id, username, balance FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: `+${bonus} coins added!`, balance: updated.balance });
  } catch (err) {
    console.error('Use promo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
