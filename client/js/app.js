/* ═══════════════════════════════════════════════════
   EpicMoney – Fully Local (localStorage) Version
   No server required — open index.html directly
   ═══════════════════════════════════════════════════ */

// ── Constants ──────────────────────────────────────
const COINS_PER_MDL = 10;
const PROMO_CODES = {
  'EPIC100': 100,
  'WELCOME50': 50,
  'BONUS200': 200,
  'DEMO500': 500
};
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
  return Number(n || 0).toLocaleString('ru-RU') + ' 🪙';
}

function formatTimer(ms) {
  const totalSecs = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const secs = (totalSecs % 60).toString().padStart(2, '0');
  return mins + ':' + secs;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function coinsToMdl(coins) { return coins / COINS_PER_MDL; }
function getColor(index) { return COLORS[index % COLORS.length]; }

// ── Pick winner proportional to coins staked ──────
function pickWinnerByTickets(bets) {
  const total = bets.reduce((s, b) => s + (b.amount || 0), 0);
  if (!total) return bets[Math.floor(Math.random() * bets.length)];
  let r = Math.random() * total;
  for (const b of bets) {
    r -= (b.amount || 0);
    if (r <= 0) return b;
  }
  return bets[bets.length - 1];
}

function calcChances(bets) {
  const total = bets.reduce((s, b) => s + (b.amount || 0), 0);
  return bets.map(b => ({
    ...b,
    chance: total > 0 ? ((b.amount / total) * 100).toFixed(1) : '0.0'
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
  const adminLink = document.getElementById('adminPanelLink');
  if (adminLink) adminLink.style.display = user.isAdmin ? '' : 'none';
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
  const coins = parseInt(document.getElementById('jpBetAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');

  const user = getUserById(currentUser.id);
  if (user.coins < coins) return showToast('Недостаточно монет', 'error');

  let game = getJackpot();
  if (!game || game.status === 'finished') game = initJackpot();
  if (game.status === 'finishing') return showToast('Игра завершается, ждите следующей', 'error');

  const existingIdx = game.bets.findIndex(b => b.userId === user.id);
  if (existingIdx >= 0) {
    game.bets[existingIdx].amount += coins;
  } else {
    const colorIdx = game.bets.length;
    game.bets.push({ userId: user.id, username: user.username, amount: coins, colorIdx, color: getColor(colorIdx) });
  }

  game.pot += coins;

  // Timer starts only when 2+ different players have placed bets
  const realPlayers = game.bets.length;
  if (!game.endsAt && realPlayers >= 2) {
    game.endsAt = Date.now() + 30000;
    game.status = 'active';
  } else if (realPlayers < 2) {
    game.status = 'waiting';
  }

  adjustCoins(user.id, -coins);
  ls.set(K.JACKPOT, game);
  document.getElementById('jpBetAmount').value = '';
  refreshSidebar();
  renderJackpot(game);
  showToast(`Ставка ${formatCoins(coins)} принята! 🎰`, 'success');
}

function renderJackpot(game) {
  if (!game) return;
  document.getElementById('jpGameId').textContent = 'GAME #' + game.gameId;
  document.getElementById('jpPot').textContent = game.pot.toLocaleString('ru-RU');
  setGameStatus('jpStatus', game.status);

  const timerEl = document.getElementById('jpTimer');
  if (game.status === 'active' && game.endsAt) {
    timerEl.textContent = formatTimer(game.endsAt - Date.now());
  } else if (game.status === 'waiting') {
    timerEl.textContent = game.bets.length > 0 ? 'Ждём игрока...' : '--:--';
  } else {
    timerEl.textContent = '--:--';
  }

  renderJackpotBar(game.bets, false);
  renderJackpotPlayers(calcChances(game.bets));
}

function renderJackpotBar(bets, animate) {
  const track = document.getElementById('jpTrack');
  const totalCoins = bets.reduce((s, b) => s + (b.amount || 0), 0);
  if (!totalCoins || !bets.length) {
    track.innerHTML = `<div style="flex:1;background:var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.8rem;">Ожидание ставок...</div>`;
    track.style.transform = 'translateX(0)';
    return;
  }
  const buildSegments = () => bets.map(b => {
    const pct = (b.amount / totalCoins) * 100;
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
      <div class="player-bet">${formatCoins(p.amount)}</div>
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
    recordGameResult(game.bets, winner.userId, game.pot);
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
  const coins = parseInt(document.getElementById('bgBetAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');
  if (!selectedBattleSide) return showToast('Выберите сторону (Синие/Красные)', 'error');

  const user = getUserById(currentUser.id);
  if (user.coins < coins) return showToast('Недостаточно монет', 'error');

  let game = getBattle();
  if (!game || game.status === 'finished') game = initBattle();
  if (game.status === 'finishing') return showToast('Игра завершается, ждите следующей', 'error');

  const color = selectedBattleSide === 'blue' ? '#4a9eff' : '#ff4a4a';
  game.bets.push({ userId: user.id, username: user.username, amount: coins, side: selectedBattleSide, color });
  game.pot += coins;
  if (selectedBattleSide === 'blue') game.bluePot += coins; else game.redPot += coins;

  // Timer starts only when both sides have at least one player
  const hasBluePlayers = game.bets.some(b => b.side === 'blue');
  const hasRedPlayers = game.bets.some(b => b.side === 'red');
  if (!game.endsAt && hasBluePlayers && hasRedPlayers) {
    game.endsAt = Date.now() + 30000;
    game.status = 'active';
  } else if (!(hasBluePlayers && hasRedPlayers)) {
    game.status = 'waiting';
  }

  adjustCoins(user.id, -coins);
  ls.set(K.BATTLE, game);
  document.getElementById('bgBetAmount').value = '';
  refreshSidebar();
  renderBattle(game);
  showToast(`Ставка ${formatCoins(coins)} на ${selectedBattleSide === 'blue' ? 'Синих' : 'Красных'} принята!`, 'success');
}

function renderBattle(game) {
  if (!game) return;
  document.getElementById('bgGameId').textContent = 'GAME #' + game.gameId;
  document.getElementById('bgPot').textContent = game.pot.toLocaleString('ru-RU');
  setGameStatus('bgStatus', game.status);

  const timerEl = document.getElementById('bgTimer');
  if (game.status === 'active' && game.endsAt) {
    timerEl.textContent = formatTimer(game.endsAt - Date.now());
  } else if (game.status === 'waiting') {
    timerEl.textContent = game.bets.length > 0 ? 'Ждём игрока...' : '--:--';
  } else {
    timerEl.textContent = '--:--';
  }

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
        <div class="player-bet">${formatCoins(p.amount)}</div>
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
    recordGameResult(game.bets, winner.userId, game.pot);
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
  const coins = parseInt(document.getElementById('fgCreateAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');
  const user = getUserById(currentUser.id);
  if (user.coins < coins) return showToast('Недостаточно монет', 'error');

  const game = {
    gameId: 'FG-' + genId(), status: 'waiting', maxPlayers: 3,
    minBet: Math.floor(coins * 0.9), maxBet: Math.ceil(coins * 1.1),
    bets: [{ userId: user.id, username: user.username, amount: coins, color: getColor(0) }],
    pot: coins, createdAt: Date.now(),
    abandonAt: Date.now() + 120000  // auto-cancel after 120s if no second player
  };

  adjustCoins(user.id, -coins);
  const games = getFastGames();
  games.push(game);
  ls.set(K.FAST, games);
  document.getElementById('fgCreateAmount').value = '';
  refreshSidebar();
  renderFastGames();
  showToast('Игра создана! Ожидаем игроков... (120с)', 'success');
}

function joinFastGame(gameId) {
  const games = getFastGames();
  const game = games.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting') return showToast('Игра недоступна', 'error');
  if (game.bets.find(b => b.userId === currentUser.id)) return showToast('Вы уже в этой игре', 'error');

  const minC = game.minBet;
  const maxC = game.maxBet;
  const amountStr = prompt(`Введите ставку (${minC}–${maxC} монет):`);
  if (!amountStr) return;

  const coins = parseInt(amountStr);
  if (!coins || coins < minC || coins > maxC) {
    return showToast(`Ставка должна быть от ${minC} до ${maxC} монет`, 'error');
  }

  const user = getUserById(currentUser.id);
  if (user.coins < coins) return showToast('Недостаточно монет', 'error');

  game.bets.push({ userId: user.id, username: user.username, amount: coins, color: getColor(game.bets.length) });
  game.pot += coins;
  adjustCoins(user.id, -coins);

  // When 2nd player joins, set a 30s countdown before drawing
  if (game.bets.length === 2) {
    game.endsAt = Date.now() + 30000;
    game.status = 'active';
    game.abandonAt = null;
  }
  if (game.bets.length >= game.maxPlayers) {
    game.status = 'finishing';
    setTimeout(() => finishFastGame(gameId), 1500);
  }

  const idx = games.findIndex(g => g.gameId === gameId);
  games[idx] = game;
  ls.set(K.FAST, games);
  refreshSidebar();
  renderFastGames();
  showToast('Вы вступили в игру!', 'success');
}

function finishFastGame(gameId) {
  const games = getFastGames();
  const game = games.find(g => g.gameId === gameId);
  if (!game) return;

  if (game.bets.length < 2) {
    // Abandon: refund the only player
    const b = game.bets[0];
    if (b) {
      adjustCoins(b.userId, b.amount);
      if (b.userId === currentUser.id) {
        refreshSidebar();
        showToast('Никто не присоединился. Ставка возвращена! 💸', 'info');
      }
    }
    ls.set(K.FAST, games.filter(g => g.gameId !== gameId));
    renderFastGames();
    return;
  }

  const winner = pickWinnerByTickets(game.bets);
  game.status = 'finished';
  game.winner = { ...winner, winAmount: game.pot };
  recordGameResult(game.bets, winner.userId, game.pot);
  addToHistory({ ...game, type: 'Fast Game' });
  showWinner(winner.username, game.pot);
  showToast(`Fast Game завершена! Победитель: ${winner.username} 🎉`, 'success');
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
    const waitLeft = g.abandonAt ? Math.max(0, Math.ceil((g.abandonAt - Date.now()) / 1000)) : null;
    const countLeft = g.endsAt ? formatTimer(g.endsAt - Date.now()) : null;
    return `<div class="room-card" ${canJoin ? `onclick="joinFastGame('${g.gameId}')"` : ''} style="${!canJoin ? 'opacity:0.7;cursor:default;' : ''}">
      <div class="room-card-id">${g.gameId}</div>
      <div class="room-card-pot">🏆 ${formatCoins(g.pot)}</div>
      <div class="room-card-info">Ставка: ${g.minBet}–${g.maxBet} 🪙</div>
      <div class="room-card-info">Игроков: ${g.bets.length} / ${g.maxPlayers}</div>
      ${waitLeft !== null ? `<div class="room-card-info" style="color:var(--accent);">⏳ Ожидание: ${waitLeft}с</div>` : ''}
      ${countLeft ? `<div class="room-card-info" style="color:var(--green);">▶ Старт через: ${countLeft}</div>` : ''}
      <div class="room-card-players">${players.map(p => `<div class="room-player-chip" style="border-color:${p.color}">${escHtml(p.username)}</div>`).join('')}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// ── 1VS1 ───────────────────────────────────────────
// ═══════════════════════════════════════════════════
function get1vs1Games() { return ls.get(K.OVS, []); }

// Currently active duel being animated
let activeDuelId = null;
let duelSpinInterval = null;

function create1vs1() {
  const coins = parseInt(document.getElementById('ovCreateAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');
  const user = getUserById(currentUser.id);
  if (user.coins < coins) return showToast('Недостаточно монет', 'error');

  const game = {
    gameId: 'OV-' + genId(), status: 'waiting',
    bets: [{ userId: user.id, username: user.username, amount: coins, color: getColor(0) }],
    pot: coins, createdAt: Date.now(),
    abandonAt: Date.now() + 120000
  };

  adjustCoins(user.id, -coins);
  const games = get1vs1Games();
  games.push(game);
  ls.set(K.OVS, games);
  document.getElementById('ovCreateAmount').value = '';
  refreshSidebar();
  render1vs1Games();
  showToast('Дуэль создана! Ожидаем соперника... (120с)', 'success');
}

function join1vs1(gameId) {
  if (!confirm('Принять вызов на дуэль?')) return;
  const games = get1vs1Games();
  const game = games.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting') return showToast('Дуэль недоступна', 'error');
  if (game.bets.find(b => b.userId === currentUser.id)) return showToast('Нельзя вступить в свою дуэль', 'error');

  const user = getUserById(currentUser.id);
  const cost = game.bets[0].amount;
  if (user.coins < cost) return showToast('Недостаточно монет', 'error');

  game.bets.push({ userId: user.id, username: user.username, amount: cost, color: getColor(1) });
  game.pot += cost;
  game.status = 'finishing';
  game.abandonAt = null;
  adjustCoins(user.id, -cost);

  const idx = games.findIndex(g => g.gameId === gameId);
  games[idx] = game;
  ls.set(K.OVS, games);
  refreshSidebar();
  activeDuelId = gameId;
  showDuelArena(game);
  showToast('Дуэль началась! 🥊', 'success');
  startDuelAnimation(game, () => finish1vs1(gameId));
}

function finish1vs1(gameId) {
  const games = get1vs1Games();
  const game = games.find(g => g.gameId === gameId);
  if (!game) return;

  if (game.bets.length < 2) {
    // Abandon: refund
    const b = game.bets[0];
    if (b) {
      adjustCoins(b.userId, b.amount);
      if (b.userId === currentUser.id) {
        refreshSidebar();
        showToast('Соперник не появился. Ставка возвращена! 💸', 'info');
      }
    }
    hideDuelArena();
    ls.set(K.OVS, games.filter(g => g.gameId !== gameId));
    render1vs1Games();
    return;
  }

  const winner = pickWinnerByTickets(game.bets);
  game.status = 'finished';
  game.winner = { ...winner, winAmount: game.pot };
  recordGameResult(game.bets, winner.userId, game.pot);
  addToHistory({ ...game, type: '1vs1' });

  // Show winner in duel arena
  finalizeDuelAnimation(game, winner);
  showWinner(winner.username, game.pot);
  showToast(`Дуэль завершена! Победитель: ${winner.username} 🎉`, 'success');

  ls.set(K.OVS, games.filter(g => g.gameId !== gameId));
  refreshSidebar();

  setTimeout(() => {
    hideDuelArena();
    activeDuelId = null;
    render1vs1Games();
  }, 6000);
}

// ── 1vs1 Duel Screen UI ────────────────────────────
function showDuelArena(game) {
  const screen = document.getElementById('duel-screen');
  if (!screen) return;
  const p1 = game.bets[0];
  const p2 = game.bets[1] || null;

  document.getElementById('duelLeftAvatar').textContent = p1.username[0].toUpperCase();
  document.getElementById('duelLeftAvatar').style.background = p1.color;
  document.getElementById('duelLeftName').textContent = p1.username;
  document.getElementById('duelLeftBet').textContent = formatCoins(p1.amount);
  document.getElementById('duelLeftChance').textContent = '50%';

  if (p2) {
    document.getElementById('duelRightAvatar').textContent = p2.username[0].toUpperCase();
    document.getElementById('duelRightAvatar').style.background = p2.color;
    document.getElementById('duelRightName').textContent = p2.username;
    document.getElementById('duelRightBet').textContent = formatCoins(p2.amount);
    document.getElementById('duelRightChance').textContent = '50%';
  } else {
    document.getElementById('duelRightAvatar').textContent = '?';
    document.getElementById('duelRightAvatar').style.background = '#444';
    document.getElementById('duelRightName').textContent = 'Ожидание...';
    document.getElementById('duelRightBet').textContent = '---';
    document.getElementById('duelRightChance').textContent = '--';
  }

  screen.style.display = 'block';
  document.getElementById('ovRoomsSection').style.display = 'none';
}

function hideDuelArena() {
  const screen = document.getElementById('duel-screen');
  if (screen) screen.style.display = 'none';
  const rooms = document.getElementById('ovRoomsSection');
  if (rooms) rooms.style.display = 'block';
  if (duelSpinInterval) { clearInterval(duelSpinInterval); duelSpinInterval = null; }
}

function exitDuelScreen() {
  hideDuelArena();
  activeDuelId = null;
  render1vs1Games();
}

const SPIN_CHARS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];

function startDuelAnimation(game, onComplete) {
  const leftEl = document.getElementById('duelLeftAvatar');
  const rightEl = document.getElementById('duelRightAvatar');
  const vsEl = document.getElementById('duelVsText');
  const p1 = game.bets[0];
  const p2 = game.bets[1];

  if (vsEl) vsEl.classList.add('vs-pulse');
  leftEl.classList.add('avatar-spin');
  rightEl.classList.add('avatar-spin');

  let frame = 0;
  const spinDuration = 3000;
  const startTime = Date.now();

  duelSpinInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / spinDuration, 1);

    // Slow down as we approach end
    const interval = progress < 0.7 ? 80 : progress < 0.9 ? 150 : 250;

    if (frame % Math.ceil(interval / 80) === 0) {
      const rndL = SPIN_CHARS[Math.floor(Math.random() * SPIN_CHARS.length)];
      const rndR = SPIN_CHARS[Math.floor(Math.random() * SPIN_CHARS.length)];
      const rndColor1 = COLORS[Math.floor(Math.random() * COLORS.length)];
      const rndColor2 = COLORS[Math.floor(Math.random() * COLORS.length)];
      leftEl.textContent = rndL;
      leftEl.style.background = rndColor1;
      rightEl.textContent = rndR;
      rightEl.style.background = rndColor2;
    }
    frame++;

    if (elapsed >= spinDuration) {
      clearInterval(duelSpinInterval);
      duelSpinInterval = null;
      leftEl.classList.remove('avatar-spin');
      rightEl.classList.remove('avatar-spin');
      if (vsEl) vsEl.classList.remove('vs-pulse');
      // Restore player avatars
      leftEl.textContent = p1.username[0].toUpperCase();
      leftEl.style.background = p1.color;
      rightEl.textContent = p2.username[0].toUpperCase();
      rightEl.style.background = p2.color;
      if (onComplete) onComplete();
    }
  }, 80);
}

function finalizeDuelAnimation(game, winner) {
  const screen = document.getElementById('duel-screen');
  if (!screen) return;
  const p1 = game.bets[0];
  const p2 = game.bets[1];
  const isP1Winner = winner.userId === p1.userId;

  const leftEl = document.getElementById('duelLeftAvatar');
  const rightEl = document.getElementById('duelRightAvatar');
  const leftChance = document.getElementById('duelLeftChance');
  const rightChance = document.getElementById('duelRightChance');

  if (isP1Winner) {
    leftEl.classList.add('avatar-winner');
    rightEl.classList.add('avatar-loser');
    if (leftChance) leftChance.textContent = '🏆 Победа!';
    if (rightChance) rightChance.textContent = '💔 Поражение';
  } else {
    rightEl.classList.add('avatar-winner');
    leftEl.classList.add('avatar-loser');
    if (rightChance) rightChance.textContent = '🏆 Победа!';
    if (leftChance) leftChance.textContent = '💔 Поражение';
  }
  document.getElementById('duelTimer').textContent = `+${formatCoins(game.pot)}`;
}

function render1vs1Games() {
  const games = get1vs1Games().filter(g => g.status !== 'finished');
  const el = document.getElementById('ovRooms');

  if (!games.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🥊</div>Нет активных дуэлей</div>';
  } else {
    el.innerHTML = games.map(renderOvs1vs1Card).join('');
  }

  renderOvs1vs1History();
}

function renderOvs1vs1Card(g) {
  const p1 = g.bets[0];
  const p2 = g.bets[1] || null;
  const isMyGame = g.bets.some(b => b.userId === currentUser.id);
  const isCreator = p1 && p1.userId === currentUser.id;
  const canJoin = !isMyGame && g.status === 'waiting';
  const bothIn = g.bets.length >= 2;
  const waitLeft = g.abandonAt ? Math.max(0, Math.ceil((g.abandonAt - Date.now()) / 1000)) : '--';

  const leftSlot = `<div class="ovs-player">
    <div class="ovs-avatar" style="background:${p1.color}">${escHtml(p1.username[0].toUpperCase())}</div>
    <div class="ovs-player-name">${escHtml(p1.username)}</div>
    <div class="ovs-player-chance">50%</div>
    <div class="ovs-player-bet">Поставил: ${formatCoins(p1.amount)}</div>
  </div>`;

  const rightSlot = p2
    ? `<div class="ovs-player">
        <div class="ovs-avatar" style="background:${p2.color}">${escHtml(p2.username[0].toUpperCase())}</div>
        <div class="ovs-player-name">${escHtml(p2.username)}</div>
        <div class="ovs-player-chance">50%</div>
        <div class="ovs-player-bet">Поставил: ${formatCoins(p2.amount)}</div>
      </div>`
    : `<div class="ovs-player">
        <div class="ovs-avatar ovs-avatar-empty">?</div>
        <div class="ovs-player-name">Ожидание...</div>
        <div class="ovs-player-chance">--</div>
        <div class="ovs-player-bet">Ставка: ${formatCoins(p1.amount)}</div>
      </div>`;

  let actionBtn = '';
  if (canJoin) {
    actionBtn = `<button class="btn btn-accent ovs-action-btn" onclick="join1vs1('${g.gameId}')">Присоединиться</button>`;
  } else if (bothIn) {
    actionBtn = `<button class="btn btn-accent ovs-action-btn" onclick="viewGame1vs1('${g.gameId}')">Посмотреть игру</button>`;
  } else if (isCreator && g.status === 'waiting') {
    actionBtn = `<div class="ovs-waiting-text">⏳ Ожидание соперника: ${waitLeft}с</div>`;
  }

  return `<div class="ovs-card">
    <div class="ovs-card-pot">🏆 Банк: ${formatCoins(g.pot)}</div>
    <div class="ovs-players">${leftSlot}<div class="ovs-vs-text">VS</div>${rightSlot}</div>
    ${actionBtn}
  </div>`;
}

function renderOvs1vs1History() {
  const el = document.getElementById('ovMyHistory');
  if (!el) return;
  const history = ls.get(K.HISTORY, [])
    .filter(g => g.type === '1vs1' && g.bets && g.bets.some(b => b.userId === currentUser.id))
    .reverse().slice(0, 5);
  if (!history.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>История пуста</div>';
    return;
  }
  el.innerHTML = history.map(g => {
    const myBet = g.bets.find(b => b.userId === currentUser.id);
    const isWon = g.winner && g.winner.userId === currentUser.id;
    const opponent = g.bets.find(b => b.userId !== currentUser.id);
    return `<div class="ovs-history-item">
      <div class="ovs-history-main">
        <div class="ovs-history-players">vs ${opponent ? escHtml(opponent.username) : '?'}</div>
        <div class="ovs-history-bet">Ставка: ${formatCoins(myBet ? myBet.amount : 0)}</div>
      </div>
      <div class="${isWon ? 'won-badge' : 'lost-badge'}">${isWon ? '+' + formatCoins(g.winner.winAmount) : 'Проигрыш'}</div>
    </div>`;
  }).join('');
}

function viewGame1vs1(gameId) {
  const game = get1vs1Games().find(g => g.gameId === gameId);
  if (!game) return;
  activeDuelId = gameId;
  showDuelArena(game);
  if (game.bets.length >= 2 && game.status === 'finishing') {
    document.getElementById('duelTimer').textContent = '⏳ Определяем победителя...';
  }
}


// ═══════════════════════════════════════════════════
// ── CHAT ───────────────────────────────────────────
// ═══════════════════════════════════════════════════
function getChat() { return ls.get(K.CHAT, []); }

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const raw = input.value.trim();
  if (!raw) return;
  // Sanitize message before storage using escHtml (prevents XSS if rendering context changes)
  const message = escHtml(raw).slice(0, 500);
  const chat = getChat();
  chat.push({ id: genId(), userId: currentUser.id, username: currentUser.username, message, createdAt: Date.now() });
  if (chat.length > 100) chat.splice(0, chat.length - 100);
  ls.set(K.CHAT, chat);
  input.value = '';
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
      <td>${myBet ? formatCoins(myBet.amount) : '-'}</td>
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
  const coins = Math.round(mdl * COINS_PER_MDL);
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
  const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
  document.getElementById('refLink').textContent = window.location.origin + basePath + '/register.html?ref=' + code;
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

  // ── Jackpot ──
  const jp = getJackpot();
  if (!jp) { initJackpot(); }
  else if (jp.status === 'active') {
    const el = document.getElementById('jpTimer');
    if (el) el.textContent = formatTimer(jp.endsAt - Date.now());
    if (Date.now() >= jp.endsAt) {
      const fresh = getJackpot();
      if (fresh && fresh.status === 'active') finishJackpot(fresh);
    }
  } else if (jp.status === 'waiting' && jp.bets.length === 1) {
    // Show waiting message in timer
    const el = document.getElementById('jpTimer');
    if (el) el.textContent = 'Ждём игрока...';
  }

  // ── Battle ──
  const bt = getBattle();
  if (!bt) { initBattle(); }
  else if (bt.status === 'active') {
    const el = document.getElementById('bgTimer');
    if (el) el.textContent = formatTimer(bt.endsAt - Date.now());
    if (Date.now() >= bt.endsAt) {
      const fresh = getBattle();
      if (fresh && fresh.status === 'active') finishBattle(fresh);
    }
  } else if (bt.status === 'waiting' && bt.bets.length > 0) {
    const hasBoth = bt.bets.some(b => b.side === 'blue') && bt.bets.some(b => b.side === 'red');
    const el = document.getElementById('bgTimer');
    if (el) el.textContent = hasBoth ? 'Ждём...' : 'Ждём игрока...';
  }

  // ── Fast Game: abandon single-player games on timeout ──
  if (tickCount % 5 === 0) {
    const fastGames = getFastGames();
    let changed = false;
    fastGames.forEach(g => {
      if (g.status === 'waiting' && g.abandonAt && Date.now() >= g.abandonAt && g.bets.length < 2) {
        finishFastGame(g.gameId);
        changed = true;
      } else if (g.status === 'active' && g.endsAt && Date.now() >= g.endsAt) {
        g.status = 'finishing';
        const idx = fastGames.findIndex(x => x.gameId === g.gameId);
        fastGames[idx] = g;
        ls.set(K.FAST, fastGames);
        setTimeout(() => finishFastGame(g.gameId), 1500);
        changed = true;
      }
    });
    if (changed) renderFastGames();
  }

  // ── 1vs1: abandon single-player duels on timeout ──
  if (tickCount % 5 === 0) {
    const ovGames = get1vs1Games();
    ovGames.forEach(g => {
      if (g.status === 'waiting' && g.abandonAt && Date.now() >= g.abandonAt && g.bets.length < 2) {
        finish1vs1(g.gameId);
      }
    });
    // Update waiting duel screen timer if active
    if (activeDuelId) {
      const activeG = get1vs1Games().find(g => g.gameId === activeDuelId);
      if (activeG && activeG.abandonAt) {
        const waitLeft = Math.max(0, Math.ceil((activeG.abandonAt - Date.now()) / 1000));
        const timerEl = document.getElementById('duelTimer');
        if (timerEl) timerEl.textContent = `⏳ Ожидание соперника: ${waitLeft}с`;
      }
    }
  }

  // ── Update Fast Game countdowns ──
  if (tickCount % 2 === 0) {
    const fgView = document.getElementById('game-fast');
    if (fgView && fgView.classList.contains('active')) renderFastGames();
  }

  // ── Update 1vs1 game cards (when list is visible) ──
  if (tickCount % 2 === 0) {
    const ovView = document.getElementById('game-1vs1');
    if (ovView && ovView.classList.contains('active')) {
      const duelScreen = document.getElementById('duel-screen');
      const isScreenVisible = duelScreen && duelScreen.style.display !== 'none';
      if (!isScreenVisible) {
        render1vs1Games();
      }
    }
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
