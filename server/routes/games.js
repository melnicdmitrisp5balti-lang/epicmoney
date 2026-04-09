const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { run, get, all } = require('../db');

// POST /api/games  - create a new game
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, amount } = req.body;
    const validTypes = ['1vs1', 'jackpot', 'battle', 'fast'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid game type' });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = await get('SELECT id, balance, status FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Account is banned' });
    if (user.balance < Number(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const amounts = JSON.stringify({ player1: Number(amount) });
    const { lastID: gameId } = await run(
      'INSERT INTO games (type, player1_id, amounts, total_pot) VALUES (?, ?, ?, ?)',
      [type, req.user.id, amounts, Number(amount)]
    );

    await run('UPDATE users SET balance = balance - ? WHERE id = ?', [Number(amount), req.user.id]);
    await run(
      'INSERT INTO bets (user_id, game_id, amount) VALUES (?, ?, ?)',
      [req.user.id, gameId, Number(amount)]
    );
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, 'loss', Number(amount), `Joined game #${gameId}`]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.user.id, 'create_game', `User created game #${gameId} (${type})`]
    );

    const game = await get('SELECT * FROM games WHERE id = ?', [gameId]);
    res.status(201).json(game);
  } catch (err) {
    console.error('Create game error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/games  - list active/waiting games
router.get('/', async (req, res) => {
  try {
    const games = await all(
      "SELECT * FROM games WHERE status IN ('waiting','active') ORDER BY created_at DESC LIMIT 50"
    );
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/games/:id
router.get('/:id', async (req, res) => {
  try {
    const game = await get('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:id/join
router.post('/:id/join', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const game = await get('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'waiting') {
      return res.status(400).json({ error: 'Game is not open for joining' });
    }

    const user = await get('SELECT id, balance, status FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Account is banned' });

    const betAmount = Number(amount) || JSON.parse(game.amounts).player1;
    if (user.balance < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Determine player slot
    let playerField = null;
    if (!game.player2_id) {
      playerField = 'player2_id';
    } else if (!game.player3_id && game.type === 'fast') {
      playerField = 'player3_id';
    } else {
      return res.status(400).json({ error: 'Game is full' });
    }

    const existingAmounts = JSON.parse(game.amounts || '{}');
    const playerKey = playerField.replace('_id', '');
    existingAmounts[playerKey] = betAmount;

    const newPot = game.total_pot + betAmount;
    const isActive = (game.type === '1vs1') ||
      (game.type === 'fast' && playerField === 'player3_id');

    await run(
      `UPDATE games SET ${playerField} = ?, amounts = ?, total_pot = ?, status = ? WHERE id = ?`,
      [req.user.id, JSON.stringify(existingAmounts), newPot, isActive ? 'active' : 'waiting', game.id]
    );

    await run('UPDATE users SET balance = balance - ? WHERE id = ?', [betAmount, req.user.id]);
    await run(
      'INSERT INTO bets (user_id, game_id, amount) VALUES (?, ?, ?)',
      [req.user.id, game.id, betAmount]
    );
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, 'loss', betAmount, `Joined game #${game.id}`]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.user.id, 'join_game', `User joined game #${game.id}`]
    );

    const updated = await get('SELECT * FROM games WHERE id = ?', [game.id]);
    res.json(updated);
  } catch (err) {
    console.error('Join game error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:id/finish  - finish a game and pick winner
router.post('/:id/finish', authMiddleware, async (req, res) => {
  try {
    const game = await get('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status !== 'active') {
      return res.status(400).json({ error: 'Game is not active' });
    }

    // Only players in the game or admins can finish
    const playerIds = [game.player1_id, game.player2_id, game.player3_id].filter(Boolean);
    if (!playerIds.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not a participant of this game' });
    }

    // Randomly pick winner from players
    const winnerId = playerIds[Math.floor(Math.random() * playerIds.length)];
    const prize = Math.floor(game.total_pot * 0.95); // 5% house edge

    await run(
      "UPDATE games SET status = 'completed', winner_id = ?, completed_at = datetime('now') WHERE id = ?",
      [winnerId, game.id]
    );
    await run('UPDATE users SET balance = balance + ? WHERE id = ?', [prize, winnerId]);
    await run(
      "UPDATE bets SET result = 'win', profit = ? WHERE user_id = ? AND game_id = ?",
      [prize - (JSON.parse(game.amounts || '{}')?.[`player${playerIds.indexOf(winnerId) + 1}`] || 0), winnerId, game.id]
    );
    await run(
      "UPDATE bets SET result = 'lose', profit = 0 WHERE user_id != ? AND game_id = ?",
      [winnerId, game.id]
    );
    await run(
      'INSERT INTO transactions (user_id, type, amount, reason) VALUES (?, ?, ?, ?)',
      [winnerId, 'bonus', prize, `Won game #${game.id}`]
    );
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.user.id, 'finish_game', `Game #${game.id} finished, winner: ${winnerId}`]
    );

    const winner = await get('SELECT id, username, balance FROM users WHERE id = ?', [winnerId]);
    res.json({ message: 'Game finished', winner, prize });
  } catch (err) {
    console.error('Finish game error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/games/:id/cancel  (admin)
router.post('/:id/cancel', adminMiddleware, async (req, res) => {
  try {
    const game = await get('SELECT * FROM games WHERE id = ?', [req.params.id]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (game.status === 'completed' || game.status === 'cancelled') {
      return res.status(400).json({ error: 'Game already completed or cancelled' });
    }

    // Refund all players
    const amounts = JSON.parse(game.amounts || '{}');
    const refunds = [
      { id: game.player1_id, amount: amounts.player1 },
      { id: game.player2_id, amount: amounts.player2 },
      { id: game.player3_id, amount: amounts.player3 }
    ].filter(r => r.id && r.amount);

    for (const r of refunds) {
      await run('UPDATE users SET balance = balance + ? WHERE id = ?', [r.amount, r.id]);
      await run(
        'INSERT INTO transactions (user_id, type, amount, reason, admin_id) VALUES (?, ?, ?, ?, ?)',
        [r.id, 'deposit', r.amount, `Refund for cancelled game #${game.id}`, req.admin.id]
      );
    }

    await run("UPDATE games SET status = 'cancelled' WHERE id = ?", [game.id]);
    await run(
      'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
      [req.admin.id, 'admin_cancel_game', `Admin cancelled game #${game.id}`]
    );

    res.json({ message: `Game #${game.id} cancelled and players refunded` });
  } catch (err) {
    console.error('Cancel game error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
