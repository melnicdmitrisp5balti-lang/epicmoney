const jwt = require('jsonwebtoken');
const { run, get, all } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// PLAYER COLORS
const PLAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#A9DFBF'
];

// In-memory game state (results persisted to DB on finish)
const gameState = {
  jackpot: null,
  battle: null,
  fast: [],
  '1vs1': []
};

let jackpotTimer = null;
let battleTimer = null;

// Track userId → socketId for targeted balance updates
const userSockets = new Map();

// Track game abandon timers: gameId → setTimeout handle
const abandonTimers = new Map();

function getColorForPlayer(index) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

function genId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
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

// ─── Send balance update to a specific user ───────────────────────────────────
async function sendBalanceUpdate(io, userId) {
  const socketId = userSockets.get(String(userId));
  if (!socketId) return;
  try {
    const user = await get('SELECT balance FROM users WHERE id = ?', [userId]);
    if (user) {
      io.to(socketId).emit('balanceUpdate', { balance: user.balance });
    }
  } catch (e) { console.error('sendBalanceUpdate error:', e); }
}

// ─── Save finished game to DB ─────────────────────────────────────────────────
async function saveGameToDB(game, winnerId) {
  try {
    const { lastID: gameId } = await run(
      "INSERT INTO games (type, total_pot, status, winner_id, completed_at) VALUES (?, ?, 'completed', ?, datetime('now'))",
      [game.type, game.pot, winnerId]
    );
    for (const bet of game.bets) {
      const isWinner = bet.userId === winnerId;
      await run(
        'INSERT INTO bets (user_id, game_id, amount, result, profit) VALUES (?, ?, ?, ?, ?)',
        [bet.userId, gameId, bet.amount, isWinner ? 'win' : 'lose',
         isWinner ? game.pot - bet.amount : -bet.amount]
      );
    }
  } catch (e) { console.error('saveGameToDB error:', e); }
}

// ─── Jackpot ──────────────────────────────────────────────────────────────────
function createJackpotGame() {
  return {
    gameId: 'JP-' + genId(),
    type: 'jackpot',
    status: 'waiting',
    bets: [],
    pot: 0,
    endsAt: null
  };
}

function sanitizeGame(game) {
  const g = { ...game };
  if (g.bets) {
    g.bets = g.bets.map(b => ({
      username: b.username,
      amount: b.amount,
      tickets: b.tickets,
      color: b.color,
      side: b.side || null
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
    side: b.side || null,
    chance: total > 0 ? ((b.tickets / total) * 100).toFixed(1) : '0.0'
  }));
}

function startJackpotTimer(io) {
  if (jackpotTimer) clearTimeout(jackpotTimer);
  const game = gameState.jackpot;
  if (!game || game.bets.length < 2) return;

  game.status = 'active';
  game.endsAt = Date.now() + 30000;
  io.emit('jackpotUpdate', { ...sanitizeGame(game), players: calculateChances(game.bets) });

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

  const prize = Math.floor(game.pot * 0.95);
  game.winner = { userId: winnerBet.userId, username: winnerBet.username, amount: prize };

  try {
    await run(
      'UPDATE users SET balance = balance + ?, games_won = games_won + 1, total_winnings = total_winnings + ? WHERE id = ?',
      [prize, prize, winnerBet.userId]
    );
    for (const bet of game.bets) {
      await run('UPDATE users SET games_played = games_played + 1 WHERE id = ?', [bet.userId]);
    }
    await saveGameToDB(game, winnerBet.userId);
  } catch (e) { console.error('DB error finishing jackpot:', e); }

  io.emit('jackpotFinished', { ...sanitizeGame(game), animationDuration: 5000 });

  // Send balance updates to all participants
  for (const bet of game.bets) {
    await sendBalanceUpdate(io, bet.userId);
  }

  setTimeout(() => {
    gameState.jackpot = createJackpotGame();
    io.emit('jackpotUpdate', sanitizeGame(gameState.jackpot));
  }, 6000);
}

// ─── Battle Game ──────────────────────────────────────────────────────────────
function createBattleGame() {
  return {
    gameId: 'BG-' + genId(),
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
  io.emit('battleUpdate', { ...sanitizeGame(game), players: calculateChances(game.bets) });

  battleTimer = setTimeout(() => finishBattle(io), 30000);
}

async function finishBattle(io) {
  const game = gameState.battle;
  if (!game || game.status !== 'active') return;

  game.status = 'finishing';

  const total = game.bluePot + game.redPot;
  const rand = Math.random() * total;
  const winningSide = rand < game.bluePot ? 'blue' : 'red';
  const winnersBets = game.bets.filter(b => b.side === winningSide);

  const prize = Math.floor(game.pot * 0.95);
  const winnerBet = pickWinner(winnersBets);
  if (!winnerBet) {
    gameState.battle = createBattleGame();
    io.emit('battleUpdate', sanitizeGame(gameState.battle));
    return;
  }

  game.winner = { userId: winnerBet.userId, username: winnerBet.username, amount: prize, side: winningSide };

  try {
    await run(
      'UPDATE users SET balance = balance + ?, games_won = games_won + 1, total_winnings = total_winnings + ? WHERE id = ?',
      [prize, prize, winnerBet.userId]
    );
    for (const bet of game.bets) {
      await run('UPDATE users SET games_played = games_played + 1 WHERE id = ?', [bet.userId]);
    }
    await saveGameToDB(game, winnerBet.userId);
  } catch (e) { console.error('DB error finishing battle:', e); }

  io.emit('battleFinished', sanitizeGame(game));

  for (const bet of game.bets) {
    await sendBalanceUpdate(io, bet.userId);
  }

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
    gameId: 'FG-' + genId(),
    type: 'fast',
    status: 'waiting',
    bets: [],
    pot: 0,
    maxPlayers: 3,
    minBet,
    maxBet,
    endsAt: null,
    abandonAt: Date.now() + 120000
  };
}

async function finishFastGame(io, game) {
  const timerId = abandonTimers.get(game.gameId);
  if (timerId) { clearTimeout(timerId); abandonTimers.delete(game.gameId); }

  game.status = 'finishing';

  if (game.bets.length < 2) {
    // Refund the solo player
    const bet = game.bets[0];
    if (bet) {
      try {
        await run('UPDATE users SET balance = balance + ? WHERE id = ?', [bet.amount, bet.userId]);
        await sendBalanceUpdate(io, bet.userId);
      } catch (e) { console.error(e); }
    }
    gameState.fast = gameState.fast.filter(g => g.gameId !== game.gameId);
    io.emit('fastGamesList', gameState.fast.map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
    if (bet) {
      const socketId = userSockets.get(String(bet.userId));
      if (socketId) io.to(socketId).emit('gameMessage', 'Никто не присоединился. Ставка возвращена! 💸');
    }
    return;
  }

  const winnerBet = pickWinner(game.bets);
  const prize = Math.floor(game.pot * 0.95);
  game.winner = { userId: winnerBet.userId, username: winnerBet.username, amount: prize };

  try {
    await run(
      'UPDATE users SET balance = balance + ?, games_won = games_won + 1, total_winnings = total_winnings + ? WHERE id = ?',
      [prize, prize, winnerBet.userId]
    );
    for (const bet of game.bets) {
      await run('UPDATE users SET games_played = games_played + 1 WHERE id = ?', [bet.userId]);
    }
    await saveGameToDB(game, winnerBet.userId);
  } catch (e) { console.error(e); }

  io.emit('fastGameFinished', sanitizeGame(game));

  for (const bet of game.bets) {
    await sendBalanceUpdate(io, bet.userId);
  }

  setTimeout(() => {
    gameState.fast = gameState.fast.filter(g => g.gameId !== game.gameId);
    io.emit('fastGamesList', gameState.fast.map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
  }, 6000);
}

// ─── 1vs1 ─────────────────────────────────────────────────────────────────────
function create1vs1Game(creatorBet) {
  return {
    gameId: '1V1-' + genId(),
    type: '1vs1',
    status: 'waiting',
    bets: [],
    pot: 0,
    maxPlayers: 2,
    minBet: creatorBet,
    maxBet: creatorBet,
    endsAt: null,
    abandonAt: Date.now() + 120000
  };
}

async function finish1vs1Game(io, game) {
  const timerId = abandonTimers.get(game.gameId);
  if (timerId) { clearTimeout(timerId); abandonTimers.delete(game.gameId); }

  game.status = 'finishing';

  if (game.bets.length < 2) {
    const bet = game.bets[0];
    if (bet) {
      try {
        await run('UPDATE users SET balance = balance + ? WHERE id = ?', [bet.amount, bet.userId]);
        await sendBalanceUpdate(io, bet.userId);
      } catch (e) { console.error(e); }
    }
    gameState['1vs1'] = gameState['1vs1'].filter(g => g.gameId !== game.gameId);
    io.emit('1vs1List', gameState['1vs1'].map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
    if (bet) {
      const socketId = userSockets.get(String(bet.userId));
      if (socketId) io.to(socketId).emit('gameMessage', 'Соперник не появился. Ставка возвращена! 💸');
    }
    return;
  }

  const winnerBet = pickWinner(game.bets);
  const prize = Math.floor(game.pot * 0.95);
  game.winner = { userId: winnerBet.userId, username: winnerBet.username, amount: prize };

  try {
    await run(
      'UPDATE users SET balance = balance + ?, games_won = games_won + 1, total_winnings = total_winnings + ? WHERE id = ?',
      [prize, prize, winnerBet.userId]
    );
    for (const bet of game.bets) {
      await run('UPDATE users SET games_played = games_played + 1 WHERE id = ?', [bet.userId]);
    }
    await saveGameToDB(game, winnerBet.userId);
  } catch (e) { console.error(e); }

  io.emit('1vs1Finished', sanitizeGame(game));

  for (const bet of game.bets) {
    await sendBalanceUpdate(io, bet.userId);
  }

  setTimeout(() => {
    gameState['1vs1'] = gameState['1vs1'].filter(g => g.gameId !== game.gameId);
    io.emit('1vs1List', gameState['1vs1'].map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
  }, 6000);
}

// ─── Socket.io main handler ───────────────────────────────────────────────────
function initSocketHandlers(io) {
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

    if (socket.user) {
      userSockets.set(String(socket.user.id), socket.id);
    }

    // Send current game state to newly connected client
    socket.emit('jackpotUpdate', { ...sanitizeGame(gameState.jackpot), players: calculateChances(gameState.jackpot.bets) });
    socket.emit('battleUpdate', { ...sanitizeGame(gameState.battle), players: calculateChances(gameState.battle.bets) });
    socket.emit('fastGamesList', gameState.fast.map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
    socket.emit('1vs1List', gameState['1vs1'].map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));

    // ── JACKPOT ──────────────────────────────────────────────────────────────
    socket.on('jackpotBet', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { amount } = data;
      if (!amount || amount <= 0 || !Number.isInteger(amount)) return socket.emit('error', 'Invalid bet amount');

      try {
        const user = await get('SELECT id, username, balance, status FROM users WHERE id = ?', [socket.user.id]);
        if (!user) return socket.emit('error', 'User not found');
        if (user.status === 'banned') return socket.emit('error', 'Account is banned');
        if (user.balance < amount) return socket.emit('error', 'Insufficient balance');

        const game = gameState.jackpot;
        if (game.status === 'finishing' || game.status === 'finished') {
          return socket.emit('error', 'Game is finishing, wait for next round');
        }

        await run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, user.id]);

        const existingBetIdx = game.bets.findIndex(b => b.userId === String(user.id));
        if (existingBetIdx >= 0) {
          game.bets[existingBetIdx].amount += amount;
          game.bets[existingBetIdx].tickets += amount;
        } else {
          game.bets.push({
            userId: String(user.id),
            username: user.username,
            amount,
            tickets: amount,
            color: getColorForPlayer(game.bets.length)
          });
        }
        game.pot += amount;

        await sendBalanceUpdate(io, user.id);
        io.emit('jackpotUpdate', { ...sanitizeGame(game), players: calculateChances(game.bets) });

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
      if (!amount || amount <= 0 || !Number.isInteger(amount)) return socket.emit('error', 'Invalid bet amount');
      if (!['blue', 'red'].includes(side)) return socket.emit('error', 'Choose blue or red');

      try {
        const user = await get('SELECT id, username, balance, status FROM users WHERE id = ?', [socket.user.id]);
        if (!user) return socket.emit('error', 'User not found');
        if (user.status === 'banned') return socket.emit('error', 'Account is banned');
        if (user.balance < amount) return socket.emit('error', 'Insufficient balance');

        const game = gameState.battle;
        if (game.status === 'finishing') return socket.emit('error', 'Game is finishing');

        if (game.bets.find(b => b.userId === String(user.id))) {
          return socket.emit('error', 'You already placed a bet');
        }

        await run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, user.id]);

        game.bets.push({
          userId: String(user.id),
          username: user.username,
          amount,
          tickets: amount,
          color: side === 'blue' ? '#4A9EFF' : '#FF4A4A',
          side
        });
        game.pot += amount;
        if (side === 'blue') game.bluePot += amount;
        else game.redPot += amount;

        await sendBalanceUpdate(io, user.id);
        io.emit('battleUpdate', { ...sanitizeGame(game), players: calculateChances(game.bets) });

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
      if (!amount || amount <= 0 || !Number.isInteger(amount)) return socket.emit('error', 'Invalid bet amount');

      try {
        const user = await get('SELECT id, username, balance, status FROM users WHERE id = ?', [socket.user.id]);
        if (!user) return socket.emit('error', 'User not found');
        if (user.status === 'banned') return socket.emit('error', 'Account is banned');
        if (user.balance < amount) return socket.emit('error', 'Insufficient balance');

        await run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, user.id]);

        const game = createFastGame(amount);
        game.bets.push({
          userId: String(user.id),
          username: user.username,
          amount,
          tickets: amount,
          color: getColorForPlayer(0)
        });
        game.pot = amount;
        gameState.fast.push(game);

        // Auto-cancel if no second player joins in 2 minutes
        const timer = setTimeout(() => {
          const idx = gameState.fast.findIndex(g => g.gameId === game.gameId);
          if (idx < 0) return;
          const g = gameState.fast[idx];
          if (g.status === 'waiting' && g.bets.length < 2) {
            finishFastGame(io, g);
          }
        }, 120000);
        abandonTimers.set(game.gameId, timer);

        await sendBalanceUpdate(io, user.id);
        io.emit('fastGamesList', gameState.fast.map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
      } catch (e) {
        console.error('Fast game create error:', e);
        socket.emit('error', 'Server error');
      }
    });

    socket.on('fastGameJoin', async (data) => {
      if (!socket.user) return socket.emit('error', 'Not authenticated');
      const { gameId, amount } = data;
      if (!amount || amount <= 0 || !Number.isInteger(amount)) return socket.emit('error', 'Invalid bet amount');

      try {
        const game = gameState.fast.find(g => g.gameId === gameId);
        if (!game) return socket.emit('error', 'Game not found');
        if (game.status !== 'waiting') return socket.emit('error', 'Game already started');
        if (game.bets.length >= game.maxPlayers) return socket.emit('error', 'Game is full');
        if (amount < game.minBet || amount > game.maxBet) {
          return socket.emit('error', `Bet must be between ${game.minBet} and ${game.maxBet} coins`);
        }
        if (game.bets.find(b => b.userId === String(socket.user.id))) {
          return socket.emit('error', 'Already in this game');
        }

        const user = await get('SELECT id, username, balance, status FROM users WHERE id = ?', [socket.user.id]);
        if (!user) return socket.emit('error', 'User not found');
        if (user.status === 'banned') return socket.emit('error', 'Account is banned');
        if (user.balance < amount) return socket.emit('error', 'Insufficient balance');

        await run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, user.id]);

        game.bets.push({
          userId: String(user.id),
          username: user.username,
          amount,
          tickets: amount,
          color: getColorForPlayer(game.bets.length)
        });
        game.pot += amount;

        await sendBalanceUpdate(io, user.id);
        io.emit('fastGamesList', gameState.fast.map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));

        if (game.bets.length >= game.maxPlayers) {
          // Trigger finish with short delay for 3rd player
          game.status = 'active';
          game.endsAt = Date.now() + 5000;
          io.emit('fastGamesList', gameState.fast.map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
          setTimeout(() => finishFastGame(io, game), 5000);
        } else if (game.bets.length === 2) {
          // Start a 30s countdown
          game.status = 'active';
          game.endsAt = Date.now() + 30000;
          io.emit('fastGamesList', gameState.fast.map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
          setTimeout(() => {
            const g = gameState.fast.find(x => x.gameId === gameId);
            if (g && g.status === 'active') finishFastGame(io, g);
          }, 30000);
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
      if (!amount || amount <= 0 || !Number.isInteger(amount)) return socket.emit('error', 'Invalid bet amount');

      try {
        const user = await get('SELECT id, username, balance, status FROM users WHERE id = ?', [socket.user.id]);
        if (!user) return socket.emit('error', 'User not found');
        if (user.status === 'banned') return socket.emit('error', 'Account is banned');
        if (user.balance < amount) return socket.emit('error', 'Insufficient balance');

        await run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, user.id]);

        const game = create1vs1Game(amount);
        game.bets.push({
          userId: String(user.id),
          username: user.username,
          amount,
          tickets: amount,
          color: getColorForPlayer(0)
        });
        game.pot = amount;
        gameState['1vs1'].push(game);

        // Auto-cancel if no opponent joins in 2 minutes
        const timer = setTimeout(() => {
          const idx = gameState['1vs1'].findIndex(g => g.gameId === game.gameId);
          if (idx < 0) return;
          const g = gameState['1vs1'][idx];
          if (g.status === 'waiting' && g.bets.length < 2) {
            finish1vs1Game(io, g);
          }
        }, 120000);
        abandonTimers.set(game.gameId, timer);

        await sendBalanceUpdate(io, user.id);
        io.emit('1vs1List', gameState['1vs1'].map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));
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
        if (game.bets.find(b => b.userId === String(socket.user.id))) {
          return socket.emit('error', 'Already in this game');
        }

        const user = await get('SELECT id, username, balance, status FROM users WHERE id = ?', [socket.user.id]);
        if (!user) return socket.emit('error', 'User not found');
        if (user.status === 'banned') return socket.emit('error', 'Account is banned');

        const coinsNeeded = game.minBet;
        if (user.balance < coinsNeeded) return socket.emit('error', 'Insufficient balance');

        await run('UPDATE users SET balance = balance - ? WHERE id = ?', [coinsNeeded, user.id]);

        game.bets.push({
          userId: String(user.id),
          username: user.username,
          amount: coinsNeeded,
          tickets: coinsNeeded,
          color: getColorForPlayer(1)
        });
        game.pot += coinsNeeded;
        game.status = 'active';
        game.endsAt = Date.now() + 5000;

        await sendBalanceUpdate(io, user.id);
        io.emit('1vs1List', gameState['1vs1'].map(g => ({ ...sanitizeGame(g), players: calculateChances(g.bets) })));

        setTimeout(() => finish1vs1Game(io, game), 5000);
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
      const text = String(message.trim()).slice(0, 500);

      try {
        await run(
          'INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)',
          [socket.user.id, 'chat', text]
        );
        io.emit('chatMessage', {
          username: socket.user.username,
          message: text,
          createdAt: Date.now()
        });
      } catch (e) {
        console.error('Chat error:', e);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      if (socket.user) {
        userSockets.delete(String(socket.user.id));
      }
    });
  });
}

module.exports = { initSocketHandlers };
