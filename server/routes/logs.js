const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const { all } = require('../db');

// GET /api/logs  (admin) - all logs
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const logs = await all(
      'SELECT l.*, u.username FROM logs l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT ?',
      [limit]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/logs/user/:id  (admin) - logs for a specific user
router.get('/user/:id', adminMiddleware, async (req, res) => {
  try {
    const logs = await all(
      'SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200',
      [req.params.id]
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
