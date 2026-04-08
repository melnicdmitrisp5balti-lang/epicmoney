const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Game = require('../models/Game');
const ChatMessage = require('../models/ChatMessage');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// PLAYER COLORS for Jackpot
const PLAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#A9DFBF'
];

// In-memory game state (persisted to DB on finish)
const gameState = {
  jackpot: null,
  battle: null,
  fast: [],    // list of fast game rooms
  '1vs1': []   // list of 1vs1 rooms
};

let jackpotTimer = null;
let battleTimer = null;

function getColorForPlayer(index) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// ─── Helper: pick winner by tickets ──────────────────────────────────────────
function pickWinner(bets) {
  const totalTickets = bets.reduce((sum, b) => sum + b.tickets, 0);
  if (totalTickets === 0) return null;
  let rand = Math.floor(Math.random() * totalTickets);
  for (const bet of bets) {
    if (rand < bet.tickets) return bet;
    rand -= bet.tickets;
  }
  return bets[bets.length - 1];
}

// ─── Jackpot ─────────────────────────────────────────────────────────────────
function createJackpotGame() {
  return {
    gameId: 'JP-' + uuidv4().substring(0, 8).toUpperCase(),
    type: 'jackpot',
    status: 'waiting',
    bets: [],
    pot: 0,
    endsAt: null
  };
}

function startJackpotTimer(io) {
  if (jackpotTimer) clearTimeout(jackpotTimer);
  const game = gameState.jackpot;
  if (!game || game.bets.length < 2) return;

  game.status = 'active';
  game.endsAt = Date.now() + 30000; // 30 seconds
  io.emit('jackpotUpdate', sanitizeGame(game));

  jackpotTimer = setTimeout(() => finishJackpot(io), 30000);
}

async function finishJackpot(io) {
  const game = gameState.jackpot;
  if (!game || game.status !== 'active') return;

  game.status = 'finishing';
  const winnerBet = pickWinner(game.bets);
  if (!winnerBet) {
    gameState.jackpot = createJackpotGame();
    io.emit('jackpotUpdate', sanitizeGame(gameState.jackpot));
    return;
  }

  const prize = Math.floor(game.pot * 0.95); // 5% house edge
  game.winner = { userId: winnerBet.userId, username: winnerBet.username, amount: prize };

  // Pay winner
  try {
    await User.findByIdAndUpdate(winnerBet.userId, {
      $inc: { coins: prize, gamesWon: 1, totalWinnings: prize }
    });
    await User.updateMany(
      { _id: { $in: game.bets.map(b => b.userId) } },
      { $inc: { gamesPlayed: 1 } }
    );
  } catch (e) { console.error('DB error finishing jackpot:', e); }

  io.emit('jackpotFinished', { ...sanitizeGame(game), animationDuration: 5000 });

  // Save to DB
  try {
    const dbGame = new Game({ ...game, status: 'finished' });
    await dbGame.save();
  } catch (e) { /* ignore */ }

  // Reset after animation
  setTimeout(() => {
    gameState.jackpot = createJackpotGame();
    io.emit('jackpotUpdate', sanitizeGame(gameState.jackpot));
  }, 6000);
}

// ─── Battle Game ─────────────────────────────────────────────────────────────
function createBattleGame() {
  return {
    gameId: 'BG-' + uuidv4().substring(0, 8).toUpperCase(),
    type: 'battle',
    status: 'waiting',
    bets: [],
    pot: 0,
    bluePot: 0,
    redPot: 0,
    endsAt: null
  };
}

function startBattleTimer(io) {
  if (battleTimer) clearTimeout(battleTimer);
  const game = gameState.battle;
  if (!game) return;
  const blueBets = game.bets.filter(b => b.side === 'blue');
  const redBets = game.bets.filter(b => b.side === 'red');
  if (blueBets.length === 0 || redBets.length === 0) return;

  game.status = 'active';
  game.endsAt = Date.now() + 30000;
  io.emit('battleUpdate', sanitizeGame(game));

  battleTimer = setTimeout(() => finishBattle(io), 30000);
}

async function finishBattle(io) {
  const game = gameState.battle;
  if (!game || game.status !== 'active') return;

  game.status = 'finishing';

  // Pick winning side weighted by pot
  const total = game.bluePot + game.redPot;
  const rand = Math.random() * total;
  const winningSide = rand < game.bluePot ? 'blue' : 'red';
  const winnersBets = game.bets.filter(b => b.side === winningSide);
  const losersBets = game.bets.filter(b => b.side !== winningSide);

  const prize = Math.floor(game.pot * 0.95);
  const winnerBet = pickWinner(winnersBets);
  if (!winnerBet) {
    gameState.battle = createBattleGame();
    io.emit('battleUpdate', sanitizeGame(gameState.battle));
    return;
  }

  game.winner = {
    userId: winnerBet.userId,
    username: winnerBet.username,
    amount: prize,
    side: winningSide
  };

  try {
    await User.findByIdAndUpdate(winnerBet.userId, {
      $inc: { coins: prize, gamesWon: 1, totalWinnings: prize }
    });
    const allIds = game.bets.map(b => b.userId);
    await User.updateMany({ _id: { $in: allIds } }, { $inc: { gamesPlayed: 1 } });
  } catch (e) { console.error('DB error finishing battle:', e); }

  io.emit('battleFinished', sanitizeGame(game));

  try {
    await new Game({ ...game, status: 'finished' }).save();
  } catch (e) { /* ignore */ }

  setTimeout(() => {
    gameState.battle = createBattleGame();
    io.emit('battleUpdate', sanitizeGame(gameState.battle));
  }, 6000);
}

// ─── Fast Game ────────────────────────────────────────────────────────────────
function createFastGame(creatorBet) {
  const minBet = Math.floor(creatorBet * 0.9);
  const maxBet = Math.ceil(creatorBet * 1.1);
  return {
    gameId: 'FG-' + uuidv4().substring(0, 8).toUpperCase(),
    type: 'fast',
    status: 'waiting',
    bets: [],
    pot: 0,
    maxPlayers: 3,
    minBet,
    maxBet,
    endsAt: null
  };
}

async function finishFastGame(io, game) {
  game.status = 'finishing';
  const winnerBet = pickWinner(game.bets);
  if (!winnerBet) return;

  const prize = Math.floor(game.pot * 0.95);
  game.winner = { userId: winnerBet.userId, username: winnerBet.username, amount: prize };

  try {
    await User.findByIdAndUpdate(winnerBet.userId, {
      $inc: { coins: prize, gamesWon: 1, totalWinnings: prize }
    });
    await User.updateMany(
      { _id: { $in: game.bets.map(b => b.userId) } },
      { $inc: { gamesPlayed: 1 } }
    );
  } catch (e) { console.error(e); }

  io.emit('fastGameFinished', sanitizeGame(game));

  try {
    await new Game({ ...game, status: 'finished' }).save();
  } catch (e) { /* ignore */ }

  // Remove from state
  setTimeout(() => {
    gameState.fast = gameState.fast.filter(g => g.gameId !== game.gameId);
    io.emit('fastGamesList', gameState.fast.map(sanitizeGame));
  }, 6000);
}

// ─── 1vs1 ─────────────────────────────────────────────────────────────────────
function create1vs1Game(creatorBet) {
  return {
    gameId: '1V1-' + uuidv4().substring(0, 8).toUpperCase(),
    type: '1vs1',
    status: 'waiting',
    bets: [],
    pot: 0,
    maxPlayers: 2,
    minBet: creatorBet,
    maxBet: creatorBet,
    endsAt: null
  };
}

async function finish1vs1Game(io, game) {
  game.status = 'finishing';
  const winnerBet = pickWinner(game.bets);
  if (!winnerBet) return;

  const prize = Math.floor(game.pot * 0.95);
  game.winner = { userId: winnerBet.userId, username: winnerBet.username, amount: prize };

  try {
    await User.findByIdAndUpdate(winnerBet.userId, {
      $inc: { coins: prize, gamesWon: 1, totalWinnings: prize }
    });
    await User.updateMany(
      { _id: { $in: game.bets.map(b => b.userId) } },
      { $inc: { gamesPlayed: 1 } }
    );
  } catch (e) { console.error(e); }

  io.emit('1vs1Finished', sanitizeGame(game));

  try {
    await new Game({ ...game, status: 'finished' }).save();
  } catch (e) { /* ignore */ }

  setTimeout(() => {
    gameState['1vs1'] = gameState['1vs1'].filter(g => g.gameId !== game.gameId);
    io.emit('1vs1List', gameState['1vs1'].map(sanitizeGame));
  }, 6000);
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function sanitizeGame(game) {
  const g = { ...game };
  if (g.bets) {
    g.bets = g.bets.map(b => ({
      username: b.username,
      amount: b.amount,
      tickets: b.tickets,
      color: b.color,
      side: b.side
    }));
  }
  return g;
}

function calculateChances(bets) {
  const total = bets.reduce((s, b) => s + b.tickets, 0);
  return bets.map(b => ({
    username: b.username,
    amount: b.amount,
    tickets: b.tickets,
    color: b.color,
    side: b.side,
    chance: total > 0 ? ((b.tickets / total) * 100).toFixed(1) : 0
  }));
}

// ─── Socket.io main handler ───────────────────────────────────────────────────
function initSocketHandlers(io) {
  // Initialize default games
  gameState.jackpot = createJackpotGame();
  gameState.battle = createBattleGame();

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
      } catch {
        socket.user = null;
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id, socket.user?.username || 'guest');

    // Send current state
    socket.emit('jackpotUpdate', sanitizeGame(gameState.jackpot));
    socket.emit('battleUpdate', sanitizeGame(gameState.battle));
    socket.emit('fastGamesList', gameState.fast.map(sanitizeGame));
    socket.emit('1vs1List', gameState['1vs1'].map(sanitizeGame));

    // ── JACKPOT ──────────────────────────────────────────────────────────────
    socket.on('jackpotBet', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { amount } = data; // amount in MDL
      if (!amount || amount <= 0) return socket.emit('error', 'Invalid bet amount');

      const coinsNeeded = Math.round(amount * 10);
      const tickets = Math.round(amount * 100);

      try {
        const user = await User.findById(socket.user.id);
        if (!user) return socket.emit('error', 'User not found');
        if (user.coins < coinsNeeded) return socket.emit('error', 'Insufficient balance');

        const game = gameState.jackpot;
        if (game.status === 'finishing' || game.status === 'finished') {
          return socket.emit('error', 'Game is finishing, wait for next round');
        }

        // Deduct coins
        user.coins -= coinsNeeded;
        await user.save();

        const colorIndex = game.bets.length;
        const bet = {
          userId: user._id.toString(),
          username: user.username,
          amount: coinsNeeded,
          tickets,
          color: getColorForPlayer(colorIndex)
        };
        game.bets.push(bet);
        game.pot += coinsNeeded;

        socket.emit('balanceUpdate', { coins: user.coins, mdl: user.coins / 10 });
        io.emit('jackpotUpdate', {
          ...sanitizeGame(game),
          players: calculateChances(game.bets)
        });

        // Start timer when 2+ players
        if (game.bets.length >= 2 && game.status === 'waiting') {
          startJackpotTimer(io);
        }
      } catch (e) {
        console.error('Jackpot bet error:', e);
        socket.emit('error', 'Server error');
      }
    });

    // ── BATTLE GAME ──────────────────────────────────────────────────────────
    socket.on('battleBet', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { amount, side } = data;
      if (!amount || amount <= 0) return socket.emit('error', 'Invalid bet amount');
      if (!['blue', 'red'].includes(side)) return socket.emit('error', 'Choose blue or red');

      const coinsNeeded = Math.round(amount * 10);
      const tickets = Math.round(amount * 100);

      try {
        const user = await User.findById(socket.user.id);
        if (!user) return socket.emit('error', 'User not found');
        if (user.coins < coinsNeeded) return socket.emit('error', 'Insufficient balance');

        const game = gameState.battle;
        if (game.status === 'finishing') return socket.emit('error', 'Game is finishing');

        // Check not already bet
        if (game.bets.find(b => b.userId === user._id.toString())) {
          return socket.emit('error', 'You already placed a bet');
        }

        user.coins -= coinsNeeded;
        await user.save();

        const bet = {
          userId: user._id.toString(),
          username: user.username,
          amount: coinsNeeded,
          tickets,
          color: side === 'blue' ? '#4A9EFF' : '#FF4A4A',
          side
        };
        game.bets.push(bet);
        game.pot += coinsNeeded;
        if (side === 'blue') game.bluePot += coinsNeeded;
        else game.redPot += coinsNeeded;

        socket.emit('balanceUpdate', { coins: user.coins, mdl: user.coins / 10 });
        io.emit('battleUpdate', {
          ...sanitizeGame(game),
          players: calculateChances(game.bets)
        });

        const blueBets = game.bets.filter(b => b.side === 'blue');
        const redBets = game.bets.filter(b => b.side === 'red');
        if (blueBets.length >= 1 && redBets.length >= 1 && game.status === 'waiting') {
          startBattleTimer(io);
        }
      } catch (e) {
        console.error('Battle bet error:', e);
        socket.emit('error', 'Server error');
      }
    });

    // ── FAST GAME ────────────────────────────────────────────────────────────
    socket.on('fastGameCreate', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { amount } = data;
      if (!amount || amount <= 0) return socket.emit('error', 'Invalid bet amount');

      const coinsNeeded = Math.round(amount * 10);
      const tickets = Math.round(amount * 100);

      try {
        const user = await User.findById(socket.user.id);
        if (!user) return socket.emit('error', 'User not found');
        if (user.coins < coinsNeeded) return socket.emit('error', 'Insufficient balance');

        user.coins -= coinsNeeded;
        await user.save();

        const game = createFastGame(coinsNeeded);
        const bet = {
          userId: user._id.toString(),
          username: user.username,
          amount: coinsNeeded,
          tickets,
          color: getColorForPlayer(0)
        };
        game.bets.push(bet);
        game.pot = coinsNeeded;
        gameState.fast.push(game);

        socket.emit('balanceUpdate', { coins: user.coins, mdl: user.coins / 10 });
        io.emit('fastGamesList', gameState.fast.map(g => ({
          ...sanitizeGame(g),
          players: calculateChances(g.bets)
        })));
      } catch (e) {
        console.error('Fast game create error:', e);
        socket.emit('error', 'Server error');
      }
    });

    socket.on('fastGameJoin', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { gameId, amount } = data;
      if (!amount || amount <= 0) return socket.emit('error', 'Invalid bet amount');

      const coinsNeeded = Math.round(amount * 10);
      const tickets = Math.round(amount * 100);

      try {
        const game = gameState.fast.find(g => g.gameId === gameId);
        if (!game) return socket.emit('error', 'Game not found');
        if (game.status !== 'waiting') return socket.emit('error', 'Game already started');
        if (game.bets.length >= game.maxPlayers) return socket.emit('error', 'Game is full');
        if (coinsNeeded < game.minBet || coinsNeeded > game.maxBet) {
          return socket.emit('error', `Bet must be between ${game.minBet / 10} and ${game.maxBet / 10} MDL`);
        }
        if (game.bets.find(b => b.userId === socket.user.id)) {
          return socket.emit('error', 'Already in this game');
        }

        const user = await User.findById(socket.user.id);
        if (!user) return socket.emit('error', 'User not found');
        if (user.coins < coinsNeeded) return socket.emit('error', 'Insufficient balance');

        user.coins -= coinsNeeded;
        await user.save();

        const bet = {
          userId: user._id.toString(),
          username: user.username,
          amount: coinsNeeded,
          tickets,
          color: getColorForPlayer(game.bets.length)
        };
        game.bets.push(bet);
        game.pot += coinsNeeded;

        socket.emit('balanceUpdate', { coins: user.coins, mdl: user.coins / 10 });
        io.emit('fastGamesList', gameState.fast.map(g => ({
          ...sanitizeGame(g),
          players: calculateChances(g.bets)
        })));

        if (game.bets.length >= game.maxPlayers) {
          await finishFastGame(io, game);
        }
      } catch (e) {
        console.error('Fast game join error:', e);
        socket.emit('error', 'Server error');
      }
    });

    // ── 1vs1 ─────────────────────────────────────────────────────────────────
    socket.on('1vs1Create', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { amount } = data;
      if (!amount || amount <= 0) return socket.emit('error', 'Invalid bet amount');

      const coinsNeeded = Math.round(amount * 10);
      const tickets = Math.round(amount * 100);

      try {
        const user = await User.findById(socket.user.id);
        if (!user) return socket.emit('error', 'User not found');
        if (user.coins < coinsNeeded) return socket.emit('error', 'Insufficient balance');

        user.coins -= coinsNeeded;
        await user.save();

        const game = create1vs1Game(coinsNeeded);
        const bet = {
          userId: user._id.toString(),
          username: user.username,
          amount: coinsNeeded,
          tickets,
          color: getColorForPlayer(0)
        };
        game.bets.push(bet);
        game.pot = coinsNeeded;
        gameState['1vs1'].push(game);

        socket.emit('balanceUpdate', { coins: user.coins, mdl: user.coins / 10 });
        io.emit('1vs1List', gameState['1vs1'].map(g => ({
          ...sanitizeGame(g),
          players: calculateChances(g.bets)
        })));
      } catch (e) {
        console.error('1vs1 create error:', e);
        socket.emit('error', 'Server error');
      }
    });

    socket.on('1vs1Join', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { gameId } = data;

      try {
        const game = gameState['1vs1'].find(g => g.gameId === gameId);
        if (!game) return socket.emit('error', 'Game not found');
        if (game.status !== 'waiting') return socket.emit('error', 'Game already started');
        if (game.bets.length >= 2) return socket.emit('error', 'Game is full');
        if (game.bets.find(b => b.userId === socket.user.id)) {
          return socket.emit('error', 'Already in this game');
        }

        const user = await User.findById(socket.user.id);
        if (!user) return socket.emit('error', 'User not found');
        const coinsNeeded = game.minBet;
        const tickets = Math.round((coinsNeeded / 10) * 100);
        if (user.coins < coinsNeeded) return socket.emit('error', 'Insufficient balance');

        user.coins -= coinsNeeded;
        await user.save();

        const bet = {
          userId: user._id.toString(),
          username: user.username,
          amount: coinsNeeded,
          tickets,
          color: getColorForPlayer(1)
        };
        game.bets.push(bet);
        game.pot += coinsNeeded;

        socket.emit('balanceUpdate', { coins: user.coins, mdl: user.coins / 10 });
        io.emit('1vs1List', gameState['1vs1'].map(g => ({
          ...sanitizeGame(g),
          players: calculateChances(g.bets)
        })));

        await finish1vs1Game(io, game);
      } catch (e) {
        console.error('1vs1 join error:', e);
        socket.emit('error', 'Server error');
      }
    });

    // ── CHAT ─────────────────────────────────────────────────────────────────
    socket.on('sendMessage', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { message } = data;
      if (!message || !message.trim()) return;
      if (message.trim().length > 500) return socket.emit('error', 'Message too long');

      try {
        const msg = new ChatMessage({
          userId: socket.user.id,
          username: socket.user.username,
          message: message.trim()
        });
        await msg.save();
        io.emit('chatMessage', {
          username: msg.username,
          message: msg.message,
          createdAt: msg.createdAt
        });
      } catch (e) {
        console.error('Chat error:', e);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

module.exports = { initSocketHandlers };
