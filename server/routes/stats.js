const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const { get, all } = require('../db');

// GET /api/stats/dashboard  (admin)
router.get('/dashboard', adminMiddleware, async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      totalGames,
      completedGames,
      activeGames,
      totalBets,
      totalPot,
      totalPaid,
      totalPromo
    ] = await Promise.all([
      get('SELECT COUNT(*) AS count FROM users'),
      get("SELECT COUNT(*) AS count FROM users WHERE status = 'active'"),
      get("SELECT COUNT(*) AS count FROM users WHERE status = 'banned'"),
      get('SELECT COUNT(*) AS count FROM games'),
      get("SELECT COUNT(*) AS count FROM games WHERE status = 'completed'"),
      get("SELECT COUNT(*) AS count FROM games WHERE status IN ('waiting','active')"),
      get('SELECT COUNT(*) AS count FROM bets'),
      get('SELECT COALESCE(SUM(total_pot), 0) AS total FROM games'),
      get("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE type = 'bonus'"),
      get('SELECT COUNT(*) AS count FROM promo_codes')
    ]);

    res.json({
      users: {
        total: totalUsers.count,
        active: activeUsers.count,
        banned: bannedUsers.count
      },
      games: {
        total: totalGames.count,
        completed: completedGames.count,
        active: activeGames.count
      },
      bets: { total: totalBets.count },
      finances: {
        totalPot: totalPot.total,
        totalPaid: totalPaid.total,
        houseEdge: Number((totalPot.total - totalPaid.total).toFixed(2))
      },
      promoCodes: { total: totalPromo.count }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/stats/users  (admin)
router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const byDay = await all(
      "SELECT date(created_at) AS day, COUNT(*) AS registrations FROM users GROUP BY date(created_at) ORDER BY day DESC LIMIT 30"
    );
    const topBalances = await all(
      'SELECT id, username, balance FROM users ORDER BY balance DESC LIMIT 10'
    );
    const topWinners = await all(
      "SELECT u.id, u.username, SUM(t.amount) AS total_won FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.type = 'bonus' GROUP BY t.user_id ORDER BY total_won DESC LIMIT 10"
    );
    res.json({ byDay, topBalances, topWinners });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/stats/revenue  (admin)
router.get('/revenue', adminMiddleware, async (req, res) => {
  try {
    const byDay = await all(
      "SELECT date(created_at) AS day, SUM(total_pot) AS pot FROM games WHERE status = 'completed' GROUP BY date(created_at) ORDER BY day DESC LIMIT 30"
    );
    const byType = await all(
      "SELECT type, COUNT(*) AS count, SUM(total_pot) AS pot FROM games WHERE status = 'completed' GROUP BY type"
    );
    const transactions = await all(
      "SELECT date(created_at) AS day, type, SUM(amount) AS total FROM transactions GROUP BY date(created_at), type ORDER BY day DESC LIMIT 60"
    );
    res.json({ byDay, byType, transactions });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
