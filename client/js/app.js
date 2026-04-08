/* ═══════════════════════════════════════════════════
   EpicMoney – Fully Local (localStorage) Version
   No server required — open index.html directly
   ═══════════════════════════════════════════════════ */

// ── Constants ──────────────────────────────────────
const COINS_PER_MDL = 10;
const TICKETS_PER_MDL = 100;
const PROMO_CODES = {
  'EPIC100': 100,
  'WELCOME50': 50,
  'BONUS200': 200,
  'DEMO500': 500
};
const BOT_NAMES = ['Alex_Pro', 'DarkHorse', 'LuckyBot', 'GoldRush', 'StrikeX', 'NeonGhost', 'FlashBet', 'CryptoKing'];
const COLORS = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#e67e22','#1abc9c','#f39c12','#16a085','#c0392b','#2980b9'];

// ── Storage Keys ───────────────────────────────────
const K = {
  USERS:   'em_users',
  CUR_UID: 'em_current_uid',
  JACKPOT: 'em_jackpot',
  BATTLE:  'em_battle',
  FAST:    'em_fast_games',
  OVS:     'em_1vs1_games',
  CHAT:    'em_chat',
  HISTORY: 'em_history'
};

// ── Simple hash (demo only — NOT suitable for production) ─
// WARNING: This is a weak hash for local demo purposes only.
// Use bcrypt or a proper server-side solution for real authentication.
function hashPass(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// ── Generate unique IDs ────────────────────────────
function genId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// ── localStorage helpers ───────────────────────────
const ls = {
  get: (k, def = null) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};

// ── User CRUD ──────────────────────────────────────
function getUsers() { return ls.get(K.USERS, []); }
function saveUsers(u) { ls.set(K.USERS, u); }
function getUserById(id) { return getUsers().find(u => u.id === id) || null; }
function getCurrentUser() {
  const uid = localStorage.getItem(K.CUR_UID);
  return uid ? getUserById(uid) : null;
}
function updateUser(id, patch) {
  const users = getUsers();
  const i = users.findIndex(u => u.id === id);
  if (i < 0) return null;
  users[i] = { ...users[i], ...patch };
  saveUsers(users);
  return users[i];
}
function adjustCoins(id, delta) {
  const u = getUserById(id);
  if (!u) return null;
  return updateUser(id, { coins: Math.max(0, (u.coins || 0) + delta) });
}

// ── Auth guard ─────────────────────────────────────
let currentUser = getCurrentUser();
if (!currentUser) {
  window.location.href = 'login.html';
}

// ── UTILITY ───────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function formatCoins(n) {
  return Number(n || 0).toLocaleString('ru-RU') + ' монет';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdlToCoins(mdl) { return Math.round(parseFloat(mdl) * COINS_PER_MDL); }
function coinsToMdl(coins) { return coins / COINS_PER_MDL; }
function mdlToTickets(mdl) { return Math.round(parseFloat(mdl) * TICKETS_PER_MDL); }
function getColor(index) { return COLORS[index % COLORS.length]; }

// ── Pick winner proportional to tickets ───────────
function pickWinnerByTickets(bets) {
  const total = bets.reduce((s, b) => s + (b.tickets || 0), 0);
  if (!total) return bets[Math.floor(Math.random() * bets.length)];
  let r = Math.random() * total;
  for (const b of bets) {
    r -= (b.tickets || 0);
    if (r <= 0) return b;
  }
  return bets[bets.length - 1];
}

function calcChances(bets) {
  const total = bets.reduce((s, b) => s + (b.tickets || 0), 0);
  return bets.map(b => ({
    ...b,
    chance: total > 0 ? ((b.tickets / total) * 100).toFixed(1) : '0.0'
  }));
}

// ── Logout ─────────────────────────────────────────
function logout() {
  localStorage.removeItem(K.CUR_UID);
  window.location.href = 'login.html';
}

// ── Update sidebar ─────────────────────────────────
function updateSidebar(user) {
  currentUser = user;
  document.getElementById('sidebarAvatar').textContent = (user.username || '?')[0].toUpperCase();
  document.getElementById('sidebarUsername').textContent = user.username;
  document.getElementById('sidebarCoins').textContent = formatCoins(user.coins);
  document.getElementById('sidebarMdl').textContent = coinsToMdl(user.coins).toFixed(1) + ' MDL';
}

function refreshSidebar() {
  const u = getUserById(currentUser.id);
  if (u) updateSidebar(u);
}

// ── Section navigation ─────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + name)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');

  if (name === 'profile') loadProfile();
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'history') loadHistory();
  if (name === 'referral') loadReferral();
  if (name === 'payouts') loadPayouts();
}

// ── Game tab switching ─────────────────────────────
function switchGame(game) {
  document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.game-view').forEach(v => v.classList.remove('active'));
  document.querySelector(`[data-game="${game}"]`)?.classList.add('active');
  document.getElementById('game-' + game)?.classList.add('active');
}

// ── Game status helper ─────────────────────────────
function setGameStatus(elId, status) {
  const el = document.getElementById(elId);
  if (!el) return;
  const map = {
    waiting:   ['status-waiting',   'Ожидание'],
    active:    ['status-active',    'Активна'],
    finishing: ['status-finishing', 'Финал'],
    finished:  ['status-finishing', 'Завершена']
  };
  const [cls, text] = map[status] || ['status-waiting', status];
  el.className = 'game-status ' + cls;
  el.textContent = text;
}

// ── Winner display ─────────────────────────────────
function showWinner(username, amount) {
  document.getElementById('winnerName').textContent = username;
  document.getElementById('winnerAmount').textContent = '+' + formatCoins(amount);
  document.getElementById('winnerOverlay').classList.add('visible');
  setTimeout(() => document.getElementById('winnerOverlay').classList.remove('visible'), 6000);
}

// ── History helper ─────────────────────────────────
function addToHistory(game) {
  const history = ls.get(K.HISTORY, []);
  history.push(game);
  if (history.length > 200) history.splice(0, history.length - 200);
  ls.set(K.HISTORY, history);
}

// ── Update player stats ────────────────────────────
function recordGameResult(bets, winnerId, winAmount) {
  bets.forEach(b => {
    if (b.isBot) return;
    const u = getUserById(b.userId);
    if (!u) return;
    const patch = { gamesPlayed: (u.gamesPlayed || 0) + 1 };
    if (b.userId === winnerId) {
      patch.gamesWon = (u.gamesWon || 0) + 1;
      patch.totalWinnings = (u.totalWinnings || 0) + winAmount;
      adjustCoins(b.userId, winAmount);
    }
    updateUser(b.userId, patch);
  });
}

// ═══════════════════════════════════════════════════
// ── JACKPOT ────────────────────────────────────────
// ═══════════════════════════════════════════════════
function getJackpot() { return ls.get(K.JACKPOT, null); }

function initJackpot() {
  const game = { gameId: 'JP-' + genId(), status: 'waiting', bets: [], pot: 0, endsAt: null, createdAt: Date.now() };
  ls.set(K.JACKPOT, game);
  renderJackpot(game);
  return game;
}

function placeJackpotBet() {
  const amountMdl = parseFloat(document.getElementById('jpBetAmount').value);
  if (!amountMdl || amountMdl <= 0) return showToast('Введите сумму ставки', 'error');

  const user = getUserById(currentUser.id);
  const cost = mdlToCoins(amountMdl);
  if (user.coins < cost) return showToast('Недостаточно монет', 'error');

  let game = getJackpot();
  if (!game || game.status === 'finished') game = initJackpot();
  if (game.status === 'finishing') return showToast('Игра завершается, ждите следующей', 'error');

  const existingIdx = game.bets.findIndex(b => b.userId === user.id);
  const tickets = mdlToTickets(amountMdl);

  if (existingIdx >= 0) {
    game.bets[existingIdx].amount += cost;
    game.bets[existingIdx].tickets += tickets;
    game.bets[existingIdx].mdl = (game.bets[existingIdx].mdl || 0) + amountMdl;
  } else {
    const colorIdx = game.bets.length;
    game.bets.push({ userId: user.id, username: user.username, amount: cost, mdl: amountMdl, tickets, colorIdx, color: getColor(colorIdx), isBot: false });
  }

  game.pot += cost;
  if (!game.endsAt) { game.endsAt = Date.now() + 30000; game.status = 'active'; }

  adjustCoins(user.id, -cost);
  ls.set(K.JACKPOT, game);
  document.getElementById('jpBetAmount').value = '';
  refreshSidebar();
  renderJackpot(game);
  showToast(`Ставка ${amountMdl} MDL принята! 🎰`, 'success');
}

function addBotToJackpot() {
  let game = getJackpot();
  if (!game || game.status !== 'active' || game.bets.length >= 8) return;
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  if (game.bets.find(b => b.username === botName)) return;
  const amountMdl = parseFloat((Math.random() * 5 + 0.5).toFixed(1));
  const cost = mdlToCoins(amountMdl);
  const tickets = mdlToTickets(amountMdl);
  const colorIdx = game.bets.length;
  game.bets.push({ userId: 'bot_' + botName, username: botName, amount: cost, mdl: amountMdl, tickets, colorIdx, color: getColor(colorIdx), isBot: true });
  game.pot += cost;
  ls.set(K.JACKPOT, game);
  renderJackpot(game);
}

function renderJackpot(game) {
  if (!game) return;
  document.getElementById('jpGameId').textContent = 'ID: ' + game.gameId;
  document.getElementById('jpPot').textContent = (game.pot / 10).toFixed(0);
  setGameStatus('jpStatus', game.status);
  const secs = game.endsAt ? Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000)) : null;
  document.getElementById('jpTimer').textContent = secs !== null ? secs + 'с' : '--';
  renderJackpotBar(game.bets, false);
  renderJackpotPlayers(calcChances(game.bets));
}

function renderJackpotBar(bets, animate) {
  const track = document.getElementById('jpTrack');
  const totalTickets = bets.reduce((s, b) => s + (b.tickets || 0), 0);
  if (!totalTickets || !bets.length) {
    track.innerHTML = `<div style="flex:1;background:var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.8rem;">Ожидание ставок...</div>`;
    track.style.transform = 'translateX(0)';
    return;
  }
  const buildSegments = () => bets.map(b => {
    const pct = (b.tickets / totalTickets) * 100;
    return `<div class="jackpot-segment" style="width:${pct}%;background:${b.color};" title="${escHtml(b.username)}: ${pct.toFixed(1)}%">${pct > 8 ? escHtml(b.username) : ''}</div>`;
  }).join('');

  if (animate) {
    track.innerHTML = buildSegments() + buildSegments() + buildSegments();
    const totalWidth = track.scrollWidth / 3;
    let start = null;
    const duration = 4500;
    const endPos = totalWidth + Math.random() * totalWidth * 0.5;
    function step(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      track.style.transform = `translateX(-${(1 - Math.pow(1 - progress, 3)) * endPos}px)`;
      if (progress < 1) requestAnimationFrame(step);
    }
    track.style.transform = 'translateX(0)';
    requestAnimationFrame(step);
  } else {
    track.innerHTML = buildSegments();
    track.style.transform = 'translateX(0)';
  }
}

function renderJackpotPlayers(players) {
  const el = document.getElementById('jpPlayers');
  if (!players || !players.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🎰</div>Ещё нет ставок</div>';
    return;
  }
  el.innerHTML = players.map(p => `
    <div class="player-row">
      <div class="player-color" style="background:${p.color};"></div>
      <div class="player-name">${escHtml(p.username)}</div>
      <div class="player-bet">${p.mdl ? p.mdl + ' MDL' : formatCoins(p.amount)}</div>
      <div class="player-chance">${p.chance}%</div>
    </div>`).join('');
}

function finishJackpot(game) {
  if (!game || game.bets.length === 0) { initJackpot(); return; }
  game.status = 'finishing';
  ls.set(K.JACKPOT, game);
  renderJackpotBar(game.bets, true);
  setGameStatus('jpStatus', 'finishing');
  setTimeout(() => {
    const winner = pickWinnerByTickets(game.bets);
    game.status = 'finished';
    game.winner = { ...winner, winAmount: game.pot };
    ls.set(K.JACKPOT, game);
    recordGameResult(game.bets, winner.isBot ? null : winner.userId, game.pot);
    addToHistory({ ...game, type: 'Jackpot' });
    showWinner(winner.username, game.pot);
    showToast(`Победитель: ${winner.username}! 🎉`, 'success');
    refreshSidebar();
    setTimeout(() => initJackpot(), 5000);
  }, 4800);
}

// ═══════════════════════════════════════════════════
// ── BATTLE GAME ────────────────────────────────────
// ═══════════════════════════════════════════════════
function getBattle() { return ls.get(K.BATTLE, null); }

function initBattle() {
  const game = { gameId: 'BT-' + genId(), status: 'waiting', bets: [], bluePot: 0, redPot: 0, pot: 0, endsAt: null, createdAt: Date.now() };
  ls.set(K.BATTLE, game);
  renderBattle(game);
  return game;
}

let selectedBattleSide = null;

function selectSide(side) {
  selectedBattleSide = side;
  document.getElementById('sideBlue').className = 'side-btn' + (side === 'blue' ? ' selected-blue' : '');
  document.getElementById('sideRed').className = 'side-btn' + (side === 'red' ? ' selected-red' : '');
}

function placeBattleBet() {
  const amountMdl = parseFloat(document.getElementById('bgBetAmount').value);
  if (!amountMdl || amountMdl <= 0) return showToast('Введите сумму ставки', 'error');
  if (!selectedBattleSide) return showToast('Выберите сторону (Синие/Красные)', 'error');

  const user = getUserById(currentUser.id);
  const cost = mdlToCoins(amountMdl);
  if (user.coins < cost) return showToast('Недостаточно монет', 'error');

  let game = getBattle();
  if (!game || game.status === 'finished') game = initBattle();
  if (game.status === 'finishing') return showToast('Игра завершается, ждите следующей', 'error');

  const tickets = mdlToTickets(amountMdl);
  const color = selectedBattleSide === 'blue' ? '#4a9eff' : '#ff4a4a';
  game.bets.push({ userId: user.id, username: user.username, amount: cost, mdl: amountMdl, tickets, side: selectedBattleSide, color, isBot: false });
  game.pot += cost;
  if (selectedBattleSide === 'blue') game.bluePot += cost; else game.redPot += cost;
  if (!game.endsAt) { game.endsAt = Date.now() + 30000; game.status = 'active'; }

  adjustCoins(user.id, -cost);
  ls.set(K.BATTLE, game);
  document.getElementById('bgBetAmount').value = '';
  refreshSidebar();
  renderBattle(game);
  showToast(`Ставка ${amountMdl} MDL на ${selectedBattleSide === 'blue' ? 'Синих' : 'Красных'} принята!`, 'success');
}

function addBotToBattle() {
  let game = getBattle();
  if (!game || game.status !== 'active' || game.bets.length >= 10) return;
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  if (game.bets.find(b => b.username === botName)) return;
  const side = game.bluePot <= game.redPot ? 'blue' : 'red';
  const amountMdl = parseFloat((Math.random() * 4 + 0.5).toFixed(1));
  const cost = mdlToCoins(amountMdl);
  const tickets = mdlToTickets(amountMdl);
  const color = side === 'blue' ? '#4a9eff' : '#ff4a4a';
  game.bets.push({ userId: 'bot_' + botName, username: botName, amount: cost, mdl: amountMdl, tickets, side, color, isBot: true });
  game.pot += cost;
  if (side === 'blue') game.bluePot += cost; else game.redPot += cost;
  ls.set(K.BATTLE, game);
  renderBattle(game);
}

function renderBattle(game) {
  if (!game) return;
  document.getElementById('bgGameId').textContent = 'ID: ' + game.gameId;
  document.getElementById('bgPot').textContent = (game.pot / 10).toFixed(0);
  setGameStatus('bgStatus', game.status);
  const secs = game.endsAt ? Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000)) : null;
  document.getElementById('bgTimer').textContent = secs !== null ? secs + 'с' : '--';
  renderBattlePlayers(calcChances(game.bets), game.bluePot, game.redPot);
}

function renderBattlePlayers(players, bluePot, redPot) {
  const el = document.getElementById('bgPlayers');
  if (!players || !players.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚔️</div>Ещё нет игроков</div>';
  } else {
    el.innerHTML = players.map(p => `
      <div class="player-row">
        <div class="player-color" style="background:${p.color};"></div>
        <div class="player-name">${escHtml(p.username)}</div>
        <div class="player-bet">${p.mdl ? p.mdl + ' MDL' : formatCoins(p.amount)}</div>
        <span class="player-side-badge ${p.side === 'blue' ? 'side-blue' : 'side-red'}">${p.side === 'blue' ? 'Синие' : 'Красные'}</span>
        <div class="player-chance">${p.chance}%</div>
      </div>`).join('');
  }
  const total = (bluePot || 0) + (redPot || 0);
  const bluePct = total ? Math.round((bluePot || 0) / total * 100) : 50;
  const redPct = total ? Math.round((redPot || 0) / total * 100) : 50;
  document.getElementById('bgBlueBar').style.width = bluePct + '%';
  document.getElementById('bgBlueBar').textContent = `Синие ${bluePct}%`;
  document.getElementById('bgRedBar').textContent = `Красные ${redPct}%`;
}

function finishBattle(game) {
  if (!game || game.bets.length === 0) { initBattle(); return; }
  game.status = 'finishing';
  ls.set(K.BATTLE, game);
  setGameStatus('bgStatus', 'finishing');
  setTimeout(() => {
    const total = game.bluePot + game.redPot;
    const winningSide = Math.random() * total < game.bluePot ? 'blue' : 'red';
    const sideBets = game.bets.filter(b => b.side === winningSide);
    const winner = sideBets.length > 0 ? pickWinnerByTickets(sideBets) : game.bets[0];
    game.status = 'finished';
    game.winner = { ...winner, winAmount: game.pot, side: winningSide };
    ls.set(K.BATTLE, game);
    recordGameResult(game.bets, winner.isBot ? null : winner.userId, game.pot);
    addToHistory({ ...game, type: 'Battle' });
    showWinner(winner.username, game.pot);
    showToast(`Победили ${winningSide === 'blue' ? 'Синие' : 'Красные'}! Победитель: ${winner.username} 🎉`, 'success');
    refreshSidebar();
    setTimeout(() => initBattle(), 5000);
  }, 2000);
}

// ═══════════════════════════════════════════════════
// ── FAST GAME ──────────────────────────────────────
// ═══════════════════════════════════════════════════
function getFastGames() { return ls.get(K.FAST, []); }

function createFastGame() {
  const amountMdl = parseFloat(document.getElementById('fgCreateAmount').value);
  if (!amountMdl || amountMdl <= 0) return showToast('Введите сумму ставки', 'error');
  const user = getUserById(currentUser.id);
  const cost = mdlToCoins(amountMdl);
  if (user.coins < cost) return showToast('Недостаточно монет', 'error');

  const game = {
    gameId: 'FG-' + genId(), status: 'waiting', maxPlayers: 3,
    minBet: amountMdl * 0.9, maxBet: amountMdl * 1.1,
    bets: [{ userId: user.id, username: user.username, amount: cost, mdl: amountMdl, tickets: mdlToTickets(amountMdl), color: getColor(0), isBot: false }],
    pot: cost, createdAt: Date.now()
  };

  adjustCoins(user.id, -cost);
  const games = getFastGames();
  games.push(game);
  ls.set(K.FAST, games);
  document.getElementById('fgCreateAmount').value = '';
  refreshSidebar();
  renderFastGames();
  showToast('Игра создана! Ожидаем игроков...', 'success');
}

function joinFastGame(gameId) {
  const games = getFastGames();
  const game = games.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting') return showToast('Игра недоступна', 'error');
  if (game.bets.find(b => b.userId === currentUser.id)) return showToast('Вы уже в этой игре', 'error');

  const minMdl = game.minBet.toFixed(1);
  const maxMdl = game.maxBet.toFixed(1);
  const amountStr = prompt(`Введите ставку (${minMdl}–${maxMdl} MDL):`);
  if (!amountStr) return;

  const amountMdl = parseFloat(amountStr);
  // Allow a small float tolerance (1%) to accommodate decimal rounding in user input
  if (!amountMdl || amountMdl < game.minBet * 0.99 || amountMdl > game.maxBet * 1.01) {
    return showToast(`Ставка должна быть от ${minMdl} до ${maxMdl} MDL`, 'error');
  }

  const user = getUserById(currentUser.id);
  const cost = mdlToCoins(amountMdl);
  if (user.coins < cost) return showToast('Недостаточно монет', 'error');

  game.bets.push({ userId: user.id, username: user.username, amount: cost, mdl: amountMdl, tickets: mdlToTickets(amountMdl), color: getColor(game.bets.length), isBot: false });
  game.pot += cost;
  adjustCoins(user.id, -cost);

  if (game.bets.length >= game.maxPlayers) { game.status = 'finishing'; setTimeout(() => finishFastGame(gameId), 1500); }

  const idx = games.findIndex(g => g.gameId === gameId);
  games[idx] = game;
  ls.set(K.FAST, games);
  refreshSidebar();
  renderFastGames();
  showToast(`Вы вступили в игру!`, 'success');
}

function addBotToFastGame(gameId) {
  const games = getFastGames();
  const game = games.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting' || game.bets.length >= game.maxPlayers) return;
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  if (game.bets.find(b => b.username === botName)) return;
  const amountMdl = parseFloat((game.minBet + Math.random() * (game.maxBet - game.minBet)).toFixed(1));
  const cost = mdlToCoins(amountMdl);
  game.bets.push({ userId: 'bot_' + botName, username: botName, amount: cost, mdl: amountMdl, tickets: mdlToTickets(amountMdl), color: getColor(game.bets.length), isBot: true });
  game.pot += cost;
  if (game.bets.length >= game.maxPlayers) { game.status = 'finishing'; setTimeout(() => finishFastGame(gameId), 1500); }
  const idx = games.findIndex(g => g.gameId === gameId);
  games[idx] = game;
  ls.set(K.FAST, games);
  renderFastGames();
}

function finishFastGame(gameId) {
  const games = getFastGames();
  const game = games.find(g => g.gameId === gameId);
  if (!game) return;
  const winner = pickWinnerByTickets(game.bets);
  game.status = 'finished';
  game.winner = { ...winner, winAmount: game.pot };
  recordGameResult(game.bets, winner.isBot ? null : winner.userId, game.pot);
  addToHistory({ ...game, type: 'Fast Game' });
  if (!winner.isBot) { showWinner(winner.username, game.pot); showToast(`Fast Game завершена! Победитель: ${winner.username} 🎉`, 'success'); }
  else showToast(`Fast Game завершена! Победил: ${winner.username}`, 'info');
  ls.set(K.FAST, games.filter(g => g.gameId !== gameId));
  refreshSidebar();
  renderFastGames();
}

function renderFastGames() {
  const games = getFastGames().filter(g => g.status !== 'finished');
  const el = document.getElementById('fgRooms');
  if (!games.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚡</div>Нет активных игр</div>'; return; }
  el.innerHTML = games.map(g => {
    const players = calcChances(g.bets);
    const canJoin = g.status === 'waiting' && !g.bets.find(b => b.userId === currentUser.id) && g.bets.length < g.maxPlayers;
    return `<div class="room-card" ${canJoin ? `onclick="joinFastGame('${g.gameId}')"` : ''} style="${!canJoin ? 'opacity:0.7;cursor:default;' : ''}">
      <div class="room-card-id">${g.gameId}</div>
      <div class="room-card-pot">🏆 ${(g.pot / 10).toFixed(0)} MDL</div>
      <div class="room-card-info">Ставка: ${g.minBet.toFixed(1)}–${g.maxBet.toFixed(1)} MDL</div>
      <div class="room-card-info">Игроков: ${g.bets.length} / ${g.maxPlayers}</div>
      <div class="room-card-players">${players.map(p => `<div class="room-player-chip" style="border-color:${p.color}">${escHtml(p.username)}</div>`).join('')}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// ── 1VS1 ───────────────────────────────────────────
// ═══════════════════════════════════════════════════
function get1vs1Games() { return ls.get(K.OVS, []); }

function create1vs1() {
  const amountMdl = parseFloat(document.getElementById('ovCreateAmount').value);
  if (!amountMdl || amountMdl <= 0) return showToast('Введите сумму ставки', 'error');
  const user = getUserById(currentUser.id);
  const cost = mdlToCoins(amountMdl);
  if (user.coins < cost) return showToast('Недостаточно монет', 'error');

  const game = {
    gameId: 'OV-' + genId(), status: 'waiting', minBet: amountMdl, maxBet: amountMdl,
    bets: [{ userId: user.id, username: user.username, amount: cost, mdl: amountMdl, tickets: mdlToTickets(amountMdl), color: getColor(0), isBot: false }],
    pot: cost, createdAt: Date.now()
  };

  adjustCoins(user.id, -cost);
  const games = get1vs1Games();
  games.push(game);
  ls.set(K.OVS, games);
  document.getElementById('ovCreateAmount').value = '';
  refreshSidebar();
  render1vs1Games();
  showToast('Дуэль создана! Ожидаем соперника...', 'success');
}

function join1vs1(gameId) {
  if (!confirm('Принять вызов на дуэль?')) return;
  const games = get1vs1Games();
  const game = games.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting') return showToast('Дуэль недоступна', 'error');
  if (game.bets.find(b => b.userId === currentUser.id)) return showToast('Нельзя вступить в свою дуэль', 'error');

  const user = getUserById(currentUser.id);
  const cost = game.bets[0].amount;
  const amountMdl = game.bets[0].mdl;
  if (user.coins < cost) return showToast('Недостаточно монет', 'error');

  game.bets.push({ userId: user.id, username: user.username, amount: cost, mdl: amountMdl, tickets: mdlToTickets(amountMdl), color: getColor(1), isBot: false });
  game.pot += cost;
  game.status = 'finishing';
  adjustCoins(user.id, -cost);

  const idx = games.findIndex(g => g.gameId === gameId);
  games[idx] = game;
  ls.set(K.OVS, games);
  refreshSidebar();
  render1vs1Games();
  showToast('Вы приняли дуэль!', 'success');
  setTimeout(() => finish1vs1(gameId), 2000);
}

function botJoin1vs1(gameId) {
  const games = get1vs1Games();
  const game = games.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting' || game.bets.length >= 2) return;
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const cost = game.bets[0].amount;
  const amountMdl = game.bets[0].mdl;
  game.bets.push({ userId: 'bot_' + botName, username: botName, amount: cost, mdl: amountMdl, tickets: mdlToTickets(amountMdl), color: getColor(1), isBot: true });
  game.pot += cost;
  game.status = 'finishing';
  const idx = games.findIndex(g => g.gameId === gameId);
  games[idx] = game;
  ls.set(K.OVS, games);
  render1vs1Games();
  setTimeout(() => finish1vs1(gameId), 1500);
}

function finish1vs1(gameId) {
  const games = get1vs1Games();
  const game = games.find(g => g.gameId === gameId);
  if (!game || game.bets.length < 2) return;
  const winner = pickWinnerByTickets(game.bets);
  game.status = 'finished';
  game.winner = { ...winner, winAmount: game.pot };
  recordGameResult(game.bets, winner.isBot ? null : winner.userId, game.pot);
  addToHistory({ ...game, type: '1vs1' });
  if (!winner.isBot) { showWinner(winner.username, game.pot); showToast(`Дуэль завершена! Победитель: ${winner.username} 🎉`, 'success'); }
  else showToast(`Дуэль завершена! Победил: ${winner.username}`, 'info');
  ls.set(K.OVS, games.filter(g => g.gameId !== gameId));
  refreshSidebar();
  render1vs1Games();
}

function render1vs1Games() {
  const games = get1vs1Games().filter(g => g.status !== 'finished');
  const el = document.getElementById('ovRooms');
  if (!games.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">🥊</div>Нет активных дуэлей</div>'; return; }
  el.innerHTML = games.map(g => {
    const canJoin = g.status === 'waiting' && !g.bets.find(b => b.userId === currentUser.id);
    return `<div class="room-card" ${canJoin ? `onclick="join1vs1('${g.gameId}')"` : ''} style="${!canJoin ? 'opacity:0.7;cursor:default;' : ''}">
      <div class="room-card-id">${g.gameId}</div>
      <div class="room-card-pot">🏆 ${(g.pot / 10).toFixed(0)} MDL</div>
      <div class="room-card-info">Ставка: ${g.bets[0].mdl} MDL</div>
      <div class="room-card-info">${g.bets.length === 1 ? 'Ждёт соперника...' : 'Финал!'}</div>
      <div class="room-card-players">${g.bets.map(p => `<div class="room-player-chip" style="border-color:${p.color}">${escHtml(p.username)}</div>`).join('')}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// ── CHAT ───────────────────────────────────────────
// ═══════════════════════════════════════════════════
function getChat() { return ls.get(K.CHAT, []); }

const BOT_CHAT_MSGS = [
  'Удачи всем! 🍀', 'Ставлю на победу!', 'Кто со мной?', 'Сегодня мой день!',
  'Большой банк! 💰', 'Давайте сыграем!', 'Отличная игра! 🎮', '🎰 Вперёд!',
  'Шансы растут!', 'Главное — удача!', 'Победа близко! ⚡', 'Го в джекпот!'
];

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const raw = input.value.trim();
  if (!raw) return;
  // Sanitize message before storage to prevent XSS if rendering context changes
  const message = raw.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).slice(0, 500);
  const chat = getChat();
  chat.push({ id: genId(), userId: currentUser.id, username: currentUser.username, message, createdAt: Date.now() });
  if (chat.length > 100) chat.splice(0, chat.length - 100);
  ls.set(K.CHAT, chat);
  input.value = '';
  renderChat();
}

function addBotChatMessage() {
  const chat = getChat();
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const msg = BOT_CHAT_MSGS[Math.floor(Math.random() * BOT_CHAT_MSGS.length)];
  chat.push({ id: genId(), userId: 'bot_' + botName, username: botName, message: msg, createdAt: Date.now() });
  if (chat.length > 100) chat.splice(0, chat.length - 100);
  ls.set(K.CHAT, chat);
  renderChat();
}

function renderChat() {
  const container = document.getElementById('chatMessages');
  const chat = getChat().slice(-50);
  container.innerHTML = '';
  chat.forEach(msg => {
    const el = document.createElement('div');
    el.className = 'chat-msg';
    const time = new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `<div class="chat-msg-user">${escHtml(msg.username)}</div><div class="chat-msg-text">${escHtml(msg.message)}</div><div class="chat-msg-time">${time}</div>`;
    container.appendChild(el);
  });
  container.scrollTop = container.scrollHeight;
}

// ═══════════════════════════════════════════════════
// ── PROFILE / LEADERBOARD / HISTORY / PAYOUTS ──────
// ═══════════════════════════════════════════════════
function loadProfile() {
  const user = getUserById(currentUser.id);
  if (!user) return;
  document.getElementById('profUsername').textContent = user.username;
  document.getElementById('profCoins').textContent = formatCoins(user.coins);
  document.getElementById('profMdl').textContent = coinsToMdl(user.coins).toFixed(2) + ' MDL';
  document.getElementById('profGames').textContent = user.gamesPlayed || 0;
  document.getElementById('profWins').textContent = user.gamesWon || 0;
  document.getElementById('profWinnings').textContent = formatCoins(user.totalWinnings || 0);
}

function loadLeaderboard() {
  const users = getUsers().filter(u => !u.isBot).sort((a, b) => (b.totalWinnings || 0) - (a.totalWinnings || 0));
  const tbody = document.getElementById('leaderboardBody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Нет данных</td></tr>';
    return;
  }
  tbody.innerHTML = users.slice(0, 20).map((u, i) => {
    const rankClass = i < 3 ? `rank-${i + 1}` : '';
    const rankText = i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1;
    return `<tr><td><span class="rank-badge ${rankClass}">${rankText}</span></td><td>${escHtml(u.username)}</td><td class="text-accent">${formatCoins(u.coins)}</td><td>${u.gamesWon || 0}</td><td>${formatCoins(u.totalWinnings || 0)}</td></tr>`;
  }).join('');
}

function loadHistory() {
  const history = ls.get(K.HISTORY, []).filter(g => g.bets && g.bets.some(b => b.userId === currentUser.id)).reverse().slice(0, 50);
  const tbody = document.getElementById('historyBody');
  if (!history.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">История пуста</td></tr>';
    return;
  }
  tbody.innerHTML = history.map(g => {
    const myBet = g.bets.find(b => b.userId === currentUser.id);
    const isWon = g.winner && g.winner.userId === currentUser.id;
    const result = isWon ? `<span class="won-badge">+${formatCoins(g.winner.winAmount)}</span>` : `<span class="lost-badge">Проигрыш</span>`;
    return `<tr>
      <td style="font-size:0.75rem;color:var(--text-muted);">${g.gameId}</td>
      <td>${g.type || '-'}</td>
      <td>${myBet ? myBet.mdl + ' MDL' : '-'}</td>
      <td>${result}</td>
      <td style="color:var(--text-muted);font-size:0.78rem;">${new Date(g.createdAt).toLocaleDateString('ru-RU')}</td>
    </tr>`;
  }).join('');
}

function loadPayouts() {
  const wins = ls.get(K.HISTORY, []).filter(g => g.winner && g.winner.userId === currentUser.id).reverse().slice(0, 20);
  const el = document.getElementById('payoutsContent');
  if (!wins.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div>Нет данных о выплатах</div>'; return; }
  el.innerHTML = wins.map(g => `
    <div class="player-row" style="margin-bottom:8px;">
      <div class="player-name">${g.type || 'Игра'} #${g.gameId}</div>
      <div class="won-badge">+${formatCoins(g.winner.winAmount)}</div>
      <div style="color:var(--text-muted);font-size:0.78rem;margin-left:auto;">${new Date(g.createdAt).toLocaleDateString('ru-RU')}</div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════
// ── FREE COINS / PROMO / DEPOSIT / TRANSFER ─────────
// ═══════════════════════════════════════════════════
function getFreeCoins() {
  const tsKey = `em_free_ts_${currentUser.id}`;
  const lastTs = parseInt(localStorage.getItem(tsKey) || '0');
  const hourMs = 60 * 60 * 1000;
  if (Date.now() - lastTs < hourMs) {
    const remaining = Math.ceil((hourMs - (Date.now() - lastTs)) / 60000);
    return showToast(`Следующие монеты через ${remaining} мин.`, 'error');
  }
  adjustCoins(currentUser.id, 50);
  localStorage.setItem(tsKey, String(Date.now()));
  refreshSidebar();
  showToast('+50 монет получено! 🎁', 'success');
}

function applyPromo() {
  const code = document.getElementById('promoInput').value.trim().toUpperCase();
  if (!code) return showToast('Введите промокод', 'error');
  const usedKey = `em_promos_${currentUser.id}`;
  const usedCodes = ls.get(usedKey, []);
  if (usedCodes.includes(code)) return showToast('Вы уже использовали этот промокод', 'error');
  const amount = PROMO_CODES[code];
  if (!amount) return showToast('Неверный промокод', 'error');
  adjustCoins(currentUser.id, amount);
  usedCodes.push(code);
  ls.set(usedKey, usedCodes);
  document.getElementById('promoInput').value = '';
  refreshSidebar();
  showToast(`Промокод ${code} активирован! +${amount} монет 🎉`, 'success');
}

function depositCoins() {
  const mdl = parseFloat(document.getElementById('depositAmount').value);
  if (!mdl || mdl < 10) return showToast('Минимальная сумма: 10 MDL', 'error');
  const coins = mdlToCoins(mdl);
  adjustCoins(currentUser.id, coins);
  document.getElementById('depositAmount').value = '';
  refreshSidebar();
  showToast(`+${coins} монет зачислено (${mdl} MDL)! ✅`, 'success');
}

function transferCoins() {
  const toUsername = document.getElementById('transferTo').value.trim();
  const amount = parseInt(document.getElementById('transferAmount').value);
  if (!toUsername) return showToast('Введите ник получателя', 'error');
  if (!amount || amount <= 0) return showToast('Введите сумму перевода', 'error');
  const sender = getUserById(currentUser.id);
  if (sender.coins < amount) return showToast('Недостаточно монет', 'error');
  const users = getUsers();
  const recipient = users.find(u => u.username.toLowerCase() === toUsername.toLowerCase() && !u.isBot);
  if (!recipient) return showToast('Пользователь не найден', 'error');
  if (recipient.id === currentUser.id) return showToast('Нельзя переводить самому себе', 'error');
  adjustCoins(currentUser.id, -amount);
  adjustCoins(recipient.id, amount);
  document.getElementById('transferTo').value = '';
  document.getElementById('transferAmount').value = '';
  refreshSidebar();
  showToast(`Переведено ${formatCoins(amount)} → ${recipient.username}! ✅`, 'success');
}

// ═══════════════════════════════════════════════════
// ── REFERRAL ───────────────────────────────────────
// ═══════════════════════════════════════════════════
function loadReferral() {
  const user = getUserById(currentUser.id);
  const code = user?.referralCode || '-';
  document.getElementById('refCode').textContent = code;
  const base = window.location.href.replace(/\/index\.html.*$/, '');
  document.getElementById('refLink').textContent = base + '/register.html?ref=' + code;
}

function copyRefCode() {
  const code = document.getElementById('refCode').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => showToast('Код скопирован!', 'success'));
  } else {
    showToast('Ваш код: ' + code, 'info');
  }
}

// ═══════════════════════════════════════════════════
// ── GAME LOOP (1-second tick) ──────────────────────
// ═══════════════════════════════════════════════════
let tickCount = 0;

function gameTick() {
  tickCount++;

  // Jackpot
  const jp = getJackpot();
  if (!jp) { initJackpot(); }
  else if (jp.status === 'active') {
    const secs = Math.max(0, Math.ceil((jp.endsAt - Date.now()) / 1000));
    const el = document.getElementById('jpTimer');
    if (el) el.textContent = secs + 'с';
    if (tickCount % 5 === 0 && Math.random() < 0.4) addBotToJackpot();
    if (Date.now() >= jp.endsAt) {
      const fresh = getJackpot();
      if (fresh && fresh.status === 'active') finishJackpot(fresh);
    }
  }

  // Battle
  const bt = getBattle();
  if (!bt) { initBattle(); }
  else if (bt.status === 'active') {
    const secs = Math.max(0, Math.ceil((bt.endsAt - Date.now()) / 1000));
    const el = document.getElementById('bgTimer');
    if (el) el.textContent = secs + 'с';
    if (tickCount % 6 === 0 && Math.random() < 0.35) addBotToBattle();
    if (Date.now() >= bt.endsAt) {
      const fresh = getBattle();
      if (fresh && fresh.status === 'active') finishBattle(fresh);
    }
  }

  // Fast Game bots
  if (tickCount % 8 === 0) {
    getFastGames().forEach(g => {
      if (g.status === 'waiting' && g.bets.length < g.maxPlayers && Math.random() < 0.5) addBotToFastGame(g.gameId);
    });
  }

  // 1vs1 bots
  if (tickCount % 10 === 0) {
    get1vs1Games().forEach(g => {
      if (g.status === 'waiting' && g.bets.length < 2 && Math.random() < 0.6) botJoin1vs1(g.gameId);
    });
  }

  // Bot chat
  if (tickCount % 22 === 0 && Math.random() < 0.4) addBotChatMessage();
}

// ── Demo / initial data setup ──────────────────────
function ensureDemoData() {
  const chat = getChat();
  if (chat.length === 0) {
    const seed = [
      { username: 'Alex_Pro', message: 'Привет всем! 👋' },
      { username: 'LuckyBot', message: 'Удачи в играх! 🍀' },
      { username: 'GoldRush', message: 'Большой банк сегодня 💰' }
    ];
    seed.forEach((m, i) => chat.push({ id: genId(), userId: 'bot_' + m.username, username: m.username, message: m.message, createdAt: Date.now() - (seed.length - i) * 15000 }));
    ls.set(K.CHAT, chat);
  }
}

// ══════════════════════════════════════════════════
// ── INIT ──────────────────────────────────────────
// ══════════════════════════════════════════════════
(function init() {
  const user = getUserById(currentUser.id);
  if (!user) { localStorage.removeItem(K.CUR_UID); window.location.href = 'login.html'; return; }
  currentUser = user;

  updateSidebar(user);
  ensureDemoData();

  if (!getJackpot()) initJackpot();
  if (!getBattle()) initBattle();

  renderJackpot(getJackpot());
  renderBattle(getBattle());
  renderFastGames();
  render1vs1Games();
  renderChat();

  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if (urlRef) localStorage.setItem('pendingRef', urlRef);

  setInterval(gameTick, 1000);
})();
