const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const ChatMessage = require('../models/ChatMessage');

// Get current user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id,
      username: user.username,
      coins: user.coins,
      mdl: user.coins / 10,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      totalWinnings: user.totalWinnings
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get leaderboard (top players)
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find()
      .select('username coins gamesWon totalWinnings')
      .sort({ totalWinnings: -1 })
      .limit(20);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get recent chat messages
router.get('/chat', async (req, res) => {
  try {
    const messages = await ChatMessage.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get game history for current user
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const games = await Game.find({
      'bets.userId': req.user.id,
      status: 'finished'
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Apply promo code (single use per user)
router.post('/promo', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    const PROMO_CODES = { EPIC100: 100, WELCOME50: 50, BONUS200: 200 };
    const upperCode = code?.toUpperCase();
    const bonus = PROMO_CODES[upperCode];
    if (!bonus) return res.status(400).json({ error: 'Invalid promo code' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.usedPromoCodes.includes(upperCode)) {
      return res.status(400).json({ error: 'Promo code already used' });
    }

    user.usedPromoCodes.push(upperCode);
    user.coins += bonus;
    await user.save();
    res.json({ message: `+${bonus} coins added!`, coins: user.coins });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Free coins (once per 24 hours)
const FREE_COINS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

router.post('/free-coins', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    if (user.lastFreeCoins && now - user.lastFreeCoins.getTime() < FREE_COINS_COOLDOWN_MS) {
      const remaining = Math.ceil((FREE_COINS_COOLDOWN_MS - (now - user.lastFreeCoins.getTime())) / 3600000);
      return res.status(429).json({ error: `Free coins available in ${remaining} hour(s)` });
    }

    const bonus = 50;
    user.coins += bonus;
    user.lastFreeCoins = new Date();
    await user.save();
    res.json({ message: `+${bonus} free coins!`, coins: user.coins });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
