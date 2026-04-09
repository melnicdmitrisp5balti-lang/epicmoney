const express = require('express');
const router = express.Router();
const adminMiddleware = require('../middleware/admin');
const { run, get } = require('../db');

const SETTINGS_USER_ID = 0; // sentinel – settings are stored as a special "system" log entry

// In-memory defaults (persisted in SQLite logs table via action='settings')
const DEFAULT_SETTINGS = {
  minBet: 10,
  maxBet: 100000,
  commission: 5,
  withdrawCommission: 2,
  depositCommission: 0,
  mdlToCoins: 10,
  waitTime: 60,
  maxPlayersPerGame: 3,
  freeCoinsAmount: 50,
  freeCoinsIntervalHours: 24
};

async function loadSettings() {
  const row = await get(
    "SELECT details FROM logs WHERE action = 'settings' ORDER BY created_at DESC LIMIT 1"
  );
  if (!row || !row.details) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.details) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// GET /api/settings  (admin)
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings  (admin) - update settings
router.put('/', adminMiddleware, async (req, res) => {
  try {
    const current = await loadSettings();
    const updated = { ...current, ...req.body };

    // Basic validation
    if (updated.minBet < 0 || updated.maxBet < updated.minBet) {
      return res.status(400).json({ error: 'Invalid bet limits' });
    }
    if (updated.commission < 0 || updated.commission > 100) {
      return res.status(400).json({ error: 'Commission must be between 0 and 100' });
    }

    await run(
      "INSERT INTO logs (user_id, action, description, details) VALUES (?, 'settings', 'Settings updated', ?)",
      [req.admin.id, JSON.stringify(updated)]
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
