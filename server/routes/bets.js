const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { run, get, all } = require('../db');

// POST /api/bets  - create a standalone bet (direct bet outside of game flow)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { game_id, amount } = req.body;
    if (!game_id || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'game_id and positive amount are required' });
    }

    const user = await get('SELECT id, balance, status FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Account is banned' });
    if (user.balance < Number(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const game = await get('SELECT id, status FROM games WHERE id = ?', [game_id]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!['waiting', 'active'].includes(game.status)) {
      return res.status(400).json({ error: 'Game is not accepting bets' });
    }

    await run('UPDATE users SET balance = balance - ? WHERE id = ?', [Number(amount), req.user.id]);
    const { lastID } = await run(
      'INSERT INTO bets (user_id, game_id, amount) VALUES (?, ?, ?)',
      [req.user.id, game_id, Number(amount)]
    );
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, 'loss', Number(amount), `Bet #${lastID} on game #${game_id}`]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.user.id, 'place_bet', `User placed bet of ${amount} on game #${game_id}`]
    );

    const bet = await get('SELECT * FROM bets WHERE id = ?', [lastID]);
    res.status(201).json(bet);
  } catch (err) {
    console.error('Create bet error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bets/user/:id  - bets for a specific user
router.get('/user/:id', authMiddleware, async (req, res) => {
  try {
    const bets = await all(
      'SELECT b.*, g.type AS game_type FROM bets b LEFT JOIN games g ON b.game_id = g.id WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 100',
      [req.params.id]
    );
    res.json(bets);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bets  (admin) - all bets
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const bets = await all(
      'SELECT b.*, u.username, g.type AS game_type FROM bets b LEFT JOIN users u ON b.user_id = u.id LEFT JOIN games g ON b.game_id = g.id ORDER BY b.created_at DESC LIMIT 200'
    );
    res.json(bets);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
