/* ═══════════════════════════════════════════════════
   EpicMoney – Main App (client/js/app.js)
   ═══════════════════════════════════════════════════ */

// ── Auth guard ─────────────────────────────────────
const token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !currentUser) {
  window.location.href = 'login.html';
}

// ── Socket.io ──────────────────────────────────────
const socket = io({ auth: { token } });

// ── State ──────────────────────────────────────────
let jackpotState = null;
let battleState = null;
let fastGames = [];
let oneVsOneGames = [];
let selectedBattleSide = null;
let jackpotTimerInterval = null;
let battleTimerInterval = null;

// ══════════════════════════════════════════════════
// ── UTILITY ───────────────────────────────────────
// ══════════════════════════════════════════════════

function apiHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...apiHeaders(), ...(opts.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

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

function formatMdl(n) {
  return (Number(n || 0) / 10).toFixed(1) + ' MDL';
}

function logout() {
  localStorage.clear();
  window.location.href = 'login.html';
}

// ── Update sidebar balance ─────────────────────────
function updateSidebar(user) {
  currentUser = { ...currentUser, ...user };
  localStorage.setItem('user', JSON.stringify(currentUser));
  const initial = (currentUser.username || '?')[0].toUpperCase();
  document.getElementById('sidebarAvatar').textContent = initial;
  document.getElementById('sidebarUsername').textContent = currentUser.username;
  document.getElementById('sidebarCoins').textContent = formatCoins(currentUser.coins);
  document.getElementById('sidebarMdl').textContent = (currentUser.coins / 10).toFixed(1) + ' MDL';
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
}

// ── Game tab switching ─────────────────────────────
function switchGame(game) {
  document.querySelectorAll('.game-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.game-view').forEach(v => v.classList.remove('active'));
  document.querySelector(`[data-game="${game}"]`)?.classList.add('active');
  document.getElementById('game-' + game)?.classList.add('active');
}

// ══════════════════════════════════════════════════
// ── PROFILE ───────────────────────────────────────
// ══════════════════════════════════════════════════
async function loadProfile() {
  try {
    const user = await apiFetch('/api/profile');
    document.getElementById('profUsername').textContent = user.username;
    document.getElementById('profCoins').textContent = formatCoins(user.coins);
    document.getElementById('profMdl').textContent = (user.coins / 10).toFixed(2) + ' MDL';
    document.getElementById('profGames').textContent = user.gamesPlayed;
    document.getElementById('profWins').textContent = user.gamesWon;
    document.getElementById('profWinnings').textContent = formatCoins(user.totalWinnings);
    updateSidebar(user);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ══════════════════════════════════════════════════
// ── LEADERBOARD ───────────────────────────────────
// ══════════════════════════════════════════════════
async function loadLeaderboard() {
  try {
    const users = await apiFetch('/api/leaderboard');
    const tbody = document.getElementById('leaderboardBody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Нет данных</td></tr>';
      return;
    }
    tbody.innerHTML = users.map((u, i) => {
      const rankClass = i < 3 ? `rank-${i + 1}` : '';
      const rankText = i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1;
      return `<tr>
        <td><span class="rank-badge ${rankClass}">${rankText}</span></td>
        <td>${escHtml(u.username)}</td>
        <td class="text-accent">${formatCoins(u.coins)}</td>
        <td>${u.gamesWon}</td>
        <td>${formatCoins(u.totalWinnings)}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ══════════════════════════════════════════════════
// ── HISTORY ───────────────────────────────────────
// ══════════════════════════════════════════════════
async function loadHistory() {
  try {
    const games = await apiFetch('/api/history');
    const tbody = document.getElementById('historyBody');
    if (!games.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">История пуста</td></tr>';
      return;
    }
    tbody.innerHTML = games.map(g => {
      const myBet = g.bets.find(b => b.userId === currentUser.id || b.userId === currentUser._id);
      const isWon = g.winner && (g.winner.userId === currentUser.id || g.winner.userId === currentUser._id);
      const result = isWon
        ? `<span class="won-badge">+${formatCoins(g.winner.amount)}</span>`
        : `<span class="lost-badge">Проигрыш</span>`;
      return `<tr>
        <td style="font-size:0.75rem;color:var(--text-muted);">${g.gameId}</td>
        <td>${g.type}</td>
        <td>${myBet ? formatCoins(myBet.amount) : '-'}</td>
        <td>${result}</td>
        <td style="color:var(--text-muted);font-size:0.78rem;">${new Date(g.createdAt).toLocaleDateString('ru-RU')}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ══════════════════════════════════════════════════
// ── REFERRAL ──────────────────────────────────────
// ══════════════════════════════════════════════════
function loadReferral() {
  const code = currentUser.referralCode || '-';
  document.getElementById('refCode').textContent = code;
  document.getElementById('refLink').textContent = window.location.origin + '/register.html?ref=' + code;
}

function copyRefCode() {
  const code = document.getElementById('refCode').textContent;
  navigator.clipboard.writeText(code).then(() => showToast('Код скопирован!', 'success'));
}

// ══════════════════════════════════════════════════
// ── FREE COINS ────────────────────────────────────
// ══════════════════════════════════════════════════
async function getFreeCoins() {
  try {
    const data = await apiFetch('/api/free-coins', { method: 'POST' });
    showToast(data.message, 'success');
    updateSidebar({ coins: data.coins });
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ══════════════════════════════════════════════════
// ── PROMO CODE ────────────────────────────────────
// ══════════════════════════════════════════════════
async function applyPromo() {
  const code = document.getElementById('promoInput').value.trim();
  if (!code) return showToast('Введите промокод', 'error');
  try {
    const data = await apiFetch('/api/promo', { method: 'POST', body: JSON.stringify({ code }) });
    showToast(data.message, 'success');
    updateSidebar({ coins: data.coins });
    document.getElementById('promoInput').value = '';
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ══════════════════════════════════════════════════
// ── DEPOSIT (demo) ────────────────────────────────
// ══════════════════════════════════════════════════
async function depositCoins() {
  const mdl = parseFloat(document.getElementById('depositAmount').value);
  if (!mdl || mdl < 10) return showToast('Минимальная сумма: 10 MDL', 'error');
  // In demo mode, inform user to use promo codes or free coins
  showToast('Демо: для получения монет воспользуйтесь промокодами или бесплатными монетами', 'info');
  document.getElementById('depositAmount').value = '';
}

// ══════════════════════════════════════════════════
// ── WINNER DISPLAY ────────────────────────────────
// ══════════════════════════════════════════════════
function showWinner(username, amount, gameType) {
  document.getElementById('winnerName').textContent = username;
  document.getElementById('winnerAmount').textContent = '+' + formatCoins(amount);
  document.getElementById('winnerOverlay').classList.add('visible');
  setTimeout(() => document.getElementById('winnerOverlay').classList.remove('visible'), 6000);
}

// ══════════════════════════════════════════════════
// ── JACKPOT ───────────────────────────────────────
// ══════════════════════════════════════════════════
function renderJackpotBar(bets, animate = false, winnerIndex = -1) {
  const track = document.getElementById('jpTrack');
  const totalTickets = bets.reduce((s, b) => s + (b.tickets || 0), 0);
  if (!totalTickets || !bets.length) {
    track.innerHTML = `<div style="flex:1;background:var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.8rem;">Ожидание ставок...</div>`;
    return;
  }

  // Build segments (repeat 3 times for spin illusion)
  const buildSegments = () => bets.map(b => {
    const pct = (b.tickets / totalTickets) * 100;
    return `<div class="jackpot-segment" style="width:${pct}%;background:${b.color};" title="${b.username}: ${pct.toFixed(1)}%">
      ${pct > 8 ? b.username : ''}
    </div>`;
  }).join('');

  if (animate) {
    track.innerHTML = buildSegments() + buildSegments() + buildSegments();
    const totalWidth = track.scrollWidth / 3;

    let start = null;
    const duration = 4500;
    const endPos = totalWidth + Math.random() * totalWidth * 0.5;

    function step(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      track.style.transform = `translateX(-${eased * endPos}px)`;
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
    </div>
  `).join('');
}

function updateJackpotTimer(endsAt) {
  if (jackpotTimerInterval) clearInterval(jackpotTimerInterval);
  const el = document.getElementById('jpTimer');
  if (!endsAt) { el.textContent = '--'; return; }
  jackpotTimerInterval = setInterval(() => {
    const secs = Math.max(0, Math.ceil((new Date(endsAt) - Date.now()) / 1000));
    el.textContent = secs + 'с';
    if (secs <= 0) clearInterval(jackpotTimerInterval);
  }, 500);
}

function setGameStatus(elId, status) {
  const el = document.getElementById(elId);
  if (!el) return;
  const map = { waiting: ['status-waiting', 'Ожидание'], active: ['status-active', 'Активна'], finishing: ['status-finishing', 'Финал'], finished: ['status-finishing', 'Завершена'] };
  const [cls, text] = map[status] || ['status-waiting', status];
  el.className = 'game-status ' + cls;
  el.textContent = text;
}

function placeJackpotBet() {
  const amount = parseFloat(document.getElementById('jpBetAmount').value);
  if (!amount || amount <= 0) return showToast('Введите сумму ставки', 'error');
  socket.emit('jackpotBet', { amount });
  document.getElementById('jpBetAmount').value = '';
}

// ── JACKPOT socket events ──────────────────────────
socket.on('jackpotUpdate', (game) => {
  jackpotState = game;
  document.getElementById('jpGameId').textContent = 'ID: ' + game.gameId;
  document.getElementById('jpPot').textContent = formatCoins(game.pot).replace(' монет', '');
  setGameStatus('jpStatus', game.status);
  updateJackpotTimer(game.endsAt);
  const players = game.players || (game.bets ? calcChances(game.bets) : []);
  renderJackpotBar(game.bets || []);
  renderJackpotPlayers(players);
});

socket.on('jackpotFinished', (game) => {
  renderJackpotBar(game.bets || [], true);
  setTimeout(() => {
    if (game.winner) {
      showWinner(game.winner.username, game.winner.amount, 'jackpot');
      showToast(`Победитель: ${game.winner.username}! 🎉`, 'success');
    }
  }, 4800);
  setGameStatus('jpStatus', 'finishing');
});

// ══════════════════════════════════════════════════
// ── BATTLE GAME ───────────────────────────────────
// ══════════════════════════════════════════════════
function selectSide(side) {
  selectedBattleSide = side;
  document.getElementById('sideBlue').className = 'side-btn' + (side === 'blue' ? ' selected-blue' : '');
  document.getElementById('sideRed').className = 'side-btn' + (side === 'red' ? ' selected-red' : '');
}

function placeBattleBet() {
  const amount = parseFloat(document.getElementById('bgBetAmount').value);
  if (!amount || amount <= 0) return showToast('Введите сумму ставки', 'error');
  if (!selectedBattleSide) return showToast('Выберите сторону (Синие/Красные)', 'error');
  socket.emit('battleBet', { amount, side: selectedBattleSide });
  document.getElementById('bgBetAmount').value = '';
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
      </div>
    `).join('');
  }

  const total = (bluePot || 0) + (redPot || 0);
  const bluePct = total ? ((bluePot || 0) / total * 100).toFixed(0) : 50;
  const redPct = total ? ((redPot || 0) / total * 100).toFixed(0) : 50;
  document.getElementById('bgBlueBar').style.width = bluePct + '%';
  document.getElementById('bgBlueBar').textContent = `Синие ${bluePct}%`;
  document.getElementById('bgRedBar').textContent = `Красные ${redPct}%`;
}

socket.on('battleUpdate', (game) => {
  battleState = game;
  document.getElementById('bgGameId').textContent = 'ID: ' + game.gameId;
  document.getElementById('bgPot').textContent = formatCoins(game.pot).replace(' монет', '');
  setGameStatus('bgStatus', game.status);
  updateBattleTimer(game.endsAt);
  const players = game.players || calcChances(game.bets || []);
  renderBattlePlayers(players, game.bluePot, game.redPot);
});

socket.on('battleFinished', (game) => {
  if (game.winner) {
    showWinner(game.winner.username, game.winner.amount, 'battle');
    showToast(`Победили ${game.winner.side === 'blue' ? 'Синие' : 'Красные'}! Победитель: ${game.winner.username} 🎉`, 'success');
  }
  setGameStatus('bgStatus', 'finishing');
});

function updateBattleTimer(endsAt) {
  if (battleTimerInterval) clearInterval(battleTimerInterval);
  const el = document.getElementById('bgTimer');
  if (!endsAt) { el.textContent = '--'; return; }
  battleTimerInterval = setInterval(() => {
    const secs = Math.max(0, Math.ceil((new Date(endsAt) - Date.now()) / 1000));
    el.textContent = secs + 'с';
    if (secs <= 0) clearInterval(battleTimerInterval);
  }, 500);
}

// ══════════════════════════════════════════════════
// ── FAST GAME ─────────────────────────────────────
// ══════════════════════════════════════════════════
function createFastGame() {
  const amount = parseFloat(document.getElementById('fgCreateAmount').value);
  if (!amount || amount <= 0) return showToast('Введите сумму ставки', 'error');
  socket.emit('fastGameCreate', { amount });
  document.getElementById('fgCreateAmount').value = '';
}

function joinFastGame(gameId) {
  const game = fastGames.find(g => g.gameId === gameId);
  if (!game) return;
  const minMdl = (game.minBet / 10).toFixed(1);
  const maxMdl = (game.maxBet / 10).toFixed(1);
  const amount = parseFloat(prompt(`Введите ставку (${minMdl}–${maxMdl} MDL):`));
  if (!amount) return;
  socket.emit('fastGameJoin', { gameId, amount });
}

function renderFastGames(games) {
  fastGames = games;
  const el = document.getElementById('fgRooms');
  if (!games.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚡</div>Нет активных игр</div>';
    return;
  }
  el.innerHTML = games.map(g => {
    const players = g.players || calcChances(g.bets || []);
    const minMdl = (g.minBet / 10).toFixed(1);
    const maxMdl = (g.maxBet / 10).toFixed(1);
    return `<div class="room-card" onclick="joinFastGame('${g.gameId}')">
      <div class="room-card-id">${g.gameId}</div>
      <div class="room-card-pot">🏆 ${formatCoins(g.pot)}</div>
      <div class="room-card-info">Ставка: ${minMdl}–${maxMdl} MDL</div>
      <div class="room-card-info">Игроков: ${g.bets?.length || 0} / ${g.maxPlayers}</div>
      <div class="room-card-players">
        ${players.map(p => `<div class="room-player-chip" style="border-color:${p.color}">${escHtml(p.username)}</div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

socket.on('fastGamesList', (games) => renderFastGames(games));
socket.on('fastGameFinished', (game) => {
  if (game.winner) {
    showWinner(game.winner.username, game.winner.amount, 'fast');
    showToast(`Fast Game завершена! Победитель: ${game.winner.username} 🎉`, 'success');
  }
});

// ══════════════════════════════════════════════════
// ── 1VS1 ──────────────────────────────────────────
// ══════════════════════════════════════════════════
function create1vs1() {
  const amount = parseFloat(document.getElementById('ovCreateAmount').value);
  if (!amount || amount <= 0) return showToast('Введите сумму ставки', 'error');
  socket.emit('1vs1Create', { amount });
  document.getElementById('ovCreateAmount').value = '';
}

function join1vs1(gameId) {
  if (!confirm('Принять вызов на дуэль?')) return;
  socket.emit('1vs1Join', { gameId });
}

function render1vs1Games(games) {
  oneVsOneGames = games;
  const el = document.getElementById('ovRooms');
  if (!games.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🥊</div>Нет активных дуэлей</div>';
    return;
  }
  el.innerHTML = games.map(g => {
    const players = g.players || calcChances(g.bets || []);
    const betMdl = (g.minBet / 10).toFixed(1);
    return `<div class="room-card" onclick="join1vs1('${g.gameId}')">
      <div class="room-card-id">${g.gameId}</div>
      <div class="room-card-pot">🏆 ${formatCoins(g.pot)}</div>
      <div class="room-card-info">Ставка: ${betMdl} MDL</div>
      <div class="room-card-info">Ждёт соперника...</div>
      <div class="room-card-players">
        ${players.map(p => `<div class="room-player-chip" style="border-color:${p.color}">${escHtml(p.username)}</div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

socket.on('1vs1List', (games) => render1vs1Games(games));
socket.on('1vs1Finished', (game) => {
  if (game.winner) {
    showWinner(game.winner.username, game.winner.amount, '1vs1');
    showToast(`Дуэль завершена! Победитель: ${game.winner.username} 🎉`, 'success');
  }
});

// ══════════════════════════════════════════════════
// ── CHAT ──────────────────────────────────────────
// ══════════════════════════════════════════════════
async function loadChatHistory() {
  try {
    const messages = await apiFetch('/api/chat');
    messages.forEach(addChatMessage);
  } catch { /* ignore */ }
}

function addChatMessage(msg) {
  const container = document.getElementById('chatMessages');
  const el = document.createElement('div');
  el.className = 'chat-msg';
  const time = new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `
    <div class="chat-msg-user">${escHtml(msg.username)}</div>
    <div class="chat-msg-text">${escHtml(msg.message)}</div>
    <div class="chat-msg-time">${time}</div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;
  socket.emit('sendMessage', { message });
  input.value = '';
}

socket.on('chatMessage', addChatMessage);

// ══════════════════════════════════════════════════
// ── BALANCE UPDATE from socket ─────────────────────
// ══════════════════════════════════════════════════
socket.on('balanceUpdate', (data) => {
  updateSidebar({ coins: data.coins });
});

// ── Socket error handler ───────────────────────────
socket.on('error', (msg) => showToast(msg, 'error'));

socket.on('connect_error', () => showToast('Ошибка подключения к серверу', 'error'));

// ══════════════════════════════════════════════════
// ── HELPERS ───────────────────────────────────────
// ══════════════════════════════════════════════════
function calcChances(bets) {
  const total = bets.reduce((s, b) => s + (b.tickets || 0), 0);
  return bets.map(b => ({
    ...b,
    chance: total > 0 ? ((b.tickets / total) * 100).toFixed(1) : 0
  }));
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════
// ── INIT ──────────────────────────────────────────
// ══════════════════════════════════════════════════
(function init() {
  updateSidebar(currentUser);
  loadChatHistory();

  // Pre-fill referral code from URL
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  if (ref) localStorage.setItem('pendingRef', ref);
})();
