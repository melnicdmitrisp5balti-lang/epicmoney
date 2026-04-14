/* ═══════════════════════════════════════════════════
   EpicMoney – Server-Backed Version
   Uses JWT authentication + Socket.io for real-time game state
   ═══════════════════════════════════════════════════ */

// ── Constants ──────────────────────────────────────
const COINS_PER_MDL = 10;
const COLORS = ['#e74c3c','#3498db','#2ecc71','#9b59b6','#e67e22','#1abc9c','#f39c12','#16a085','#c0392b','#2980b9'];

// ── Auth token ─────────────────────────────────────
const token = localStorage.getItem('em_token');
if (!token) {
  window.location.href = 'login.html';
}

// ── API helper ─────────────────────────────────────
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('em_token');
    localStorage.removeItem('em_user');
    window.location.href = 'login.html';
    throw new Error('Unauthorized');
  }
  return res;
}

// ── Current user state ─────────────────────────────
let currentUser = null;

// ── Socket.io connection ───────────────────────────
const socket = io({ auth: { token } });

socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('Socket connection error:', err.message);
});

socket.on('error', (msg) => {
  showToast(msg, 'error');
});

socket.on('gameMessage', (msg) => {
  showToast(msg, 'info');
  // Balance was already updated by server; refresh from server
  refreshBalance();
});

socket.on('balanceUpdate', (data) => {
  if (currentUser) {
    currentUser.balance = data.balance;
    updateSidebar(currentUser);
  }
});

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

// ── Logout ─────────────────────────────────────────
function logout() {
  fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } })
    .catch(() => {});
  localStorage.removeItem('em_token');
  localStorage.removeItem('em_user');
  window.location.href = 'login.html';
}

// ── Refresh balance from server ────────────────────
async function refreshBalance() {
  try {
    const res = await apiFetch('/api/balance');
    if (res.ok) {
      const data = await res.json();
      if (currentUser) {
        currentUser.balance = data.balance;
        updateSidebar(currentUser);
      }
    }
  } catch (e) { /* ignore */ }
}

// ── Update sidebar ─────────────────────────────────
function updateSidebar(user) {
  currentUser = user;
  const avatar = document.getElementById('sidebarAvatar');
  if (avatar) avatar.textContent = (user.username || '?')[0].toUpperCase();
  const nameEl = document.getElementById('sidebarUsername');
  if (nameEl) nameEl.textContent = user.username;
  const coinsEl = document.getElementById('sidebarCoins');
  if (coinsEl) coinsEl.textContent = formatCoins(user.balance);
  const mdlEl = document.getElementById('sidebarMdl');
  if (mdlEl) mdlEl.textContent = coinsToMdl(user.balance).toFixed(1) + ' MDL';
  const adminLink = document.getElementById('adminPanelLink');
  if (adminLink) adminLink.style.display = 'none'; // admin panel is separate
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
  const el = document.getElementById('winnerName');
  if (el) el.textContent = username;
  const amtEl = document.getElementById('winnerAmount');
  if (amtEl) amtEl.textContent = '+' + formatCoins(amount);
  const overlay = document.getElementById('winnerOverlay');
  if (overlay) {
    overlay.classList.add('visible');
    setTimeout(() => overlay.classList.remove('visible'), 6000);
  }
}

// ── Pick winner proportional to tickets ───────────
function pickWinnerByTickets(bets) {
  const total = bets.reduce((s, b) => s + (b.tickets || b.amount || 0), 0);
  if (!total) return bets[Math.floor(Math.random() * bets.length)];
  let r = Math.random() * total;
  for (const b of bets) {
    r -= (b.tickets || b.amount || 0);
    if (r <= 0) return b;
  }
  return bets[bets.length - 1];
}

function calcChances(bets) {
  const total = bets.reduce((s, b) => s + (b.tickets || b.amount || 0), 0);
  return bets.map(b => ({
    ...b,
    chance: total > 0 ? (((b.tickets || b.amount || 0) / total) * 100).toFixed(1) : '0.0'
  }));
}

// ═══════════════════════════════════════════════════
// ── JACKPOT ────────────────────────────────────────
// ═══════════════════════════════════════════════════
let jackpotGame = null;

socket.on('jackpotUpdate', (game) => {
  jackpotGame = game;
  renderJackpot(game);
});

socket.on('jackpotFinished', (game) => {
  jackpotGame = game;
  if (game.bets && game.bets.length > 0) {
    renderJackpotBar(game.bets, true);
  }
  setGameStatus('jpStatus', 'finishing');
  if (game.winner) {
    setTimeout(() => {
      showWinner(game.winner.username, game.winner.amount);
      showToast(`Победитель: ${game.winner.username}! 🎉`, 'success');
    }, 4800);
  }
});

function placeJackpotBet() {
  const coins = parseInt(document.getElementById('jpBetAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');
  if (!currentUser || currentUser.balance < coins) return showToast('Недостаточно монет', 'error');

  socket.emit('jackpotBet', { amount: coins });
  document.getElementById('jpBetAmount').value = '';
  showToast(`Ставка ${formatCoins(coins)} принята! 🎰`, 'success');
}

function renderJackpot(game) {
  if (!game) return;
  const idEl = document.getElementById('jpGameId');
  if (idEl) idEl.textContent = 'GAME #' + game.gameId;
  const potEl = document.getElementById('jpPot');
  if (potEl) potEl.textContent = (game.pot || 0).toLocaleString('ru-RU');
  setGameStatus('jpStatus', game.status);

  const timerEl = document.getElementById('jpTimer');
  if (timerEl) {
    if (game.status === 'active' && game.endsAt) {
      timerEl.textContent = formatTimer(game.endsAt - Date.now());
    } else if (game.status === 'waiting') {
      timerEl.textContent = (game.bets && game.bets.length > 0) ? 'Ждём игрока...' : '--:--';
    } else {
      timerEl.textContent = '--:--';
    }
  }

  const players = game.players || calcChances(game.bets || []);
  renderJackpotBar(game.bets || [], false);
  renderJackpotPlayers(players);
}

function renderJackpotBar(bets, animate) {
  const track = document.getElementById('jpTrack');
  if (!track) return;
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
  if (!el) return;
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

// ═══════════════════════════════════════════════════
// ── BATTLE GAME ────────────────────────────────────
// ═══════════════════════════════════════════════════
let battleGame = null;
let selectedBattleSide = null;

socket.on('battleUpdate', (game) => {
  battleGame = game;
  renderBattle(game);
});

socket.on('battleFinished', (game) => {
  battleGame = game;
  setGameStatus('bgStatus', 'finishing');
  if (game.winner) {
    setTimeout(() => {
      showWinner(game.winner.username, game.winner.amount);
      showToast(`Победили ${game.winner.side === 'blue' ? 'Синие' : 'Красные'}! Победитель: ${game.winner.username} 🎉`, 'success');
    }, 2000);
  }
});

function selectSide(side) {
  selectedBattleSide = side;
  document.getElementById('sideBlue').className = 'side-btn' + (side === 'blue' ? ' selected-blue' : '');
  document.getElementById('sideRed').className = 'side-btn' + (side === 'red' ? ' selected-red' : '');
}

function placeBattleBet() {
  const coins = parseInt(document.getElementById('bgBetAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');
  if (!selectedBattleSide) return showToast('Выберите сторону (Синие/Красные)', 'error');
  if (!currentUser || currentUser.balance < coins) return showToast('Недостаточно монет', 'error');

  socket.emit('battleBet', { amount: coins, side: selectedBattleSide });
  document.getElementById('bgBetAmount').value = '';
  showToast(`Ставка ${formatCoins(coins)} на ${selectedBattleSide === 'blue' ? 'Синих' : 'Красных'} принята!`, 'success');
}

function renderBattle(game) {
  if (!game) return;
  const idEl = document.getElementById('bgGameId');
  if (idEl) idEl.textContent = 'GAME #' + game.gameId;
  const potEl = document.getElementById('bgPot');
  if (potEl) potEl.textContent = (game.pot || 0).toLocaleString('ru-RU');
  setGameStatus('bgStatus', game.status);

  const timerEl = document.getElementById('bgTimer');
  if (timerEl) {
    if (game.status === 'active' && game.endsAt) {
      timerEl.textContent = formatTimer(game.endsAt - Date.now());
    } else if (game.status === 'waiting') {
      timerEl.textContent = (game.bets && game.bets.length > 0) ? 'Ждём игрока...' : '--:--';
    } else {
      timerEl.textContent = '--:--';
    }
  }

  const players = game.players || calcChances(game.bets || []);
  renderBattlePlayers(players, game.bluePot || 0, game.redPot || 0);
}

function renderBattlePlayers(players, bluePot, redPot) {
  const el = document.getElementById('bgPlayers');
  if (!el) return;
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
  const blueBar = document.getElementById('bgBlueBar');
  if (blueBar) { blueBar.style.width = bluePct + '%'; blueBar.textContent = `Синие ${bluePct}%`; }
  const redBar = document.getElementById('bgRedBar');
  if (redBar) redBar.textContent = `Красные ${redPct}%`;
}

// ═══════════════════════════════════════════════════
// ── FAST GAME ──────────────────────────────────────
// ═══════════════════════════════════════════════════
let fastGames = [];

socket.on('fastGamesList', (games) => {
  fastGames = games || [];
  renderFastGames();
});

socket.on('fastGameFinished', (game) => {
  if (game.winner) {
    showWinner(game.winner.username, game.winner.amount);
    showToast(`Fast Game завершена! Победитель: ${game.winner.username} 🎉`, 'success');
  }
});

function createFastGame() {
  const coins = parseInt(document.getElementById('fgCreateAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');
  if (!currentUser || currentUser.balance < coins) return showToast('Недостаточно монет', 'error');

  socket.emit('fastGameCreate', { amount: coins });
  document.getElementById('fgCreateAmount').value = '';
  showToast('Игра создана! Ожидаем игроков... (120с)', 'success');
}

function joinFastGame(gameId) {
  const game = fastGames.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting') return showToast('Игра недоступна', 'error');

  const minC = game.minBet;
  const maxC = game.maxBet;
  const amountStr = prompt(`Введите ставку (${minC}–${maxC} монет):`);
  if (!amountStr) return;

  const coins = parseInt(amountStr);
  if (!coins || coins < minC || coins > maxC) {
    return showToast(`Ставка должна быть от ${minC} до ${maxC} монет`, 'error');
  }
  if (!currentUser || currentUser.balance < coins) return showToast('Недостаточно монет', 'error');

  socket.emit('fastGameJoin', { gameId, amount: coins });
  showToast('Вы вступили в игру!', 'success');
}

function renderFastGames() {
  const games = fastGames.filter(g => g.status !== 'finished');
  const el = document.getElementById('fgRooms');
  if (!el) return;
  if (!games.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚡</div>Нет активных игр</div>'; return; }
  const myUsername = currentUser ? currentUser.username : '';
  el.innerHTML = games.map(g => {
    const players = g.players || calcChances(g.bets || []);
    const isInGame = g.bets && g.bets.some(b => b.username === myUsername);
    const canJoin = g.status === 'waiting' && !isInGame && g.bets && g.bets.length < g.maxPlayers;
    const waitLeft = g.abandonAt ? Math.max(0, Math.ceil((g.abandonAt - Date.now()) / 1000)) : null;
    const countLeft = g.endsAt ? formatTimer(g.endsAt - Date.now()) : null;
    return `<div class="room-card" ${canJoin ? `onclick="joinFastGame('${g.gameId}')"` : ''} style="${!canJoin ? 'opacity:0.7;cursor:default;' : ''}">
      <div class="room-card-id">${g.gameId}</div>
      <div class="room-card-pot">🏆 ${formatCoins(g.pot)}</div>
      <div class="room-card-info">Ставка: ${g.minBet}–${g.maxBet} 🪙</div>
      <div class="room-card-info">Игроков: ${g.bets ? g.bets.length : 0} / ${g.maxPlayers}</div>
      ${waitLeft !== null && g.status === 'waiting' ? `<div class="room-card-info" style="color:var(--accent);">⏳ Ожидание: ${waitLeft}с</div>` : ''}
      ${countLeft && g.status === 'active' ? `<div class="room-card-info" style="color:var(--green);">▶ Старт через: ${countLeft}</div>` : ''}
      <div class="room-card-players">${players.map(p => `<div class="room-player-chip" style="border-color:${p.color}">${escHtml(p.username)}</div>`).join('')}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// ── 1VS1 ───────────────────────────────────────────
// ═══════════════════════════════════════════════════
let vs1Games = [];
let activeDuelId = null;
let duelSpinInterval = null;

socket.on('1vs1List', (games) => {
  vs1Games = games || [];
  if (!activeDuelId) render1vs1Games();
});

socket.on('1vs1Finished', (game) => {
  if (game.winner) {
    // If we're in the duel screen for this game, show the result
    if (activeDuelId === game.gameId) {
      finalizeDuelAnimation(game, game.winner);
    }
    showWinner(game.winner.username, game.winner.amount);
    showToast(`Дуэль завершена! Победитель: ${game.winner.username} 🎉`, 'success');
    if (activeDuelId === game.gameId) {
      setTimeout(() => {
        hideDuelArena();
        activeDuelId = null;
        render1vs1Games();
      }, 6000);
    }
  }
});

function create1vs1() {
  const coins = parseInt(document.getElementById('ovCreateAmount').value);
  if (!coins || coins <= 0) return showToast('Введите сумму ставки в монетах', 'error');
  if (!currentUser || currentUser.balance < coins) return showToast('Недостаточно монет', 'error');

  socket.emit('1vs1Create', { amount: coins });
  document.getElementById('ovCreateAmount').value = '';
  showToast('Дуэль создана! Ожидаем соперника... (120с)', 'success');
}

function join1vs1(gameId) {
  if (!confirm('Принять вызов на дуэль?')) return;
  const game = vs1Games.find(g => g.gameId === gameId);
  if (!game || game.status !== 'waiting') return showToast('Дуэль недоступна', 'error');

  const cost = game.minBet;
  if (!currentUser || currentUser.balance < cost) return showToast('Недостаточно монет', 'error');

  socket.emit('1vs1Join', { gameId });
  activeDuelId = gameId;
  showDuelArena(game);
  showToast('Дуэль началась! 🥊', 'success');
  startDuelAnimation(game, () => {});
}

// ── 1vs1 Duel Screen UI ────────────────────────────
function showDuelArena(game) {
  const screen = document.getElementById('duel-screen');
  if (!screen) return;
  const p1 = game.bets ? game.bets[0] : null;
  const p2 = game.bets ? game.bets[1] : null;

  if (p1) {
    document.getElementById('duelLeftAvatar').textContent = p1.username[0].toUpperCase();
    document.getElementById('duelLeftAvatar').style.background = p1.color;
    document.getElementById('duelLeftName').textContent = p1.username;
    document.getElementById('duelLeftBet').textContent = formatCoins(p1.amount);
    document.getElementById('duelLeftChance').textContent = '50%';
  }

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
  const rooms = document.getElementById('ovRoomsSection');
  if (rooms) rooms.style.display = 'none';
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
  const p1 = game.bets ? game.bets[0] : null;

  if (vsEl) vsEl.classList.add('vs-pulse');
  leftEl.classList.add('avatar-spin');
  rightEl.classList.add('avatar-spin');

  let frame = 0;
  const spinDuration = 3000;
  const startTime = Date.now();

  duelSpinInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / spinDuration, 1);
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
      if (p1) {
        leftEl.textContent = p1.username[0].toUpperCase();
        leftEl.style.background = p1.color;
      }
      if (onComplete) onComplete();
    }
  }, 80);
}

function finalizeDuelAnimation(game, winner) {
  const screen = document.getElementById('duel-screen');
  if (!screen) return;
  const p1 = game.bets ? game.bets[0] : null;
  const p2 = game.bets ? game.bets[1] : null;
  if (!p1 || !p2) return;
  const isP1Winner = winner.userId === p1.userId || winner.username === p1.username;

  const leftEl = document.getElementById('duelLeftAvatar');
  const rightEl = document.getElementById('duelRightAvatar');
  const leftChance = document.getElementById('duelLeftChance');
  const rightChance = document.getElementById('duelRightChance');

  leftEl.textContent = p1.username[0].toUpperCase();
  leftEl.style.background = p1.color;
  rightEl.textContent = p2.username[0].toUpperCase();
  rightEl.style.background = p2.color;

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
  const timerEl = document.getElementById('duelTimer');
  if (timerEl) timerEl.textContent = `+${formatCoins(game.pot)}`;
}

function render1vs1Games() {
  const games = vs1Games.filter(g => g.status !== 'finished');
  const el = document.getElementById('ovRooms');
  if (!el) return;

  if (!games.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🥊</div>Нет активных дуэлей</div>';
  } else {
    el.innerHTML = games.map(renderOvs1vs1Card).join('');
  }
}

function renderOvs1vs1Card(g) {
  const p1 = g.bets ? g.bets[0] : null;
  const p2 = g.bets ? g.bets[1] : null;
  if (!p1) return '';

  const myUsername = currentUser ? currentUser.username : '';
  const isMyGame = g.bets && g.bets.some(b => b.username === myUsername);
  const isCreator = p1.username === myUsername;
  const canJoin = !isMyGame && g.status === 'waiting';
  const bothIn = g.bets && g.bets.length >= 2;
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
  } else if (bothIn && isMyGame) {
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

function viewGame1vs1(gameId) {
  const game = vs1Games.find(g => g.gameId === gameId);
  if (!game) return;
  activeDuelId = gameId;
  showDuelArena(game);
}

// ═══════════════════════════════════════════════════
// ── CHAT ───────────────────────────────────────────
// ═══════════════════════════════════════════════════
socket.on('chatMessage', (msg) => {
  appendChatMessage(msg);
});

function appendChatMessage(msg) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'chat-msg';
  const time = new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<div class="chat-msg-user">${escHtml(msg.username)}</div><div class="chat-msg-text">${escHtml(msg.message)}</div><div class="chat-msg-time">${time}</div>`;
  container.appendChild(el);
  // Keep only last 100 messages visible
  while (container.children.length > 100) container.removeChild(container.firstChild);
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const raw = input.value.trim();
  if (!raw) return;
  socket.emit('sendMessage', { message: raw });
  input.value = '';
}

function renderChat() {
  const container = document.getElementById('chatMessages');
  if (container) container.innerHTML = '';
}

// ═══════════════════════════════════════════════════
// ── PROFILE / LEADERBOARD / HISTORY / PAYOUTS ──────
// ═══════════════════════════════════════════════════
async function loadProfile() {
  try {
    const res = await apiFetch('/api/profile');
    if (!res.ok) return;
    const user = await res.json();
    currentUser = { ...currentUser, ...user };
    updateSidebar(currentUser);

    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('profUsername', user.username);
    el('profCoins', formatCoins(user.balance));
    el('profMdl', coinsToMdl(user.balance).toFixed(2) + ' MDL');
    el('profGames', user.games_played || 0);
    el('profWins', user.games_won || 0);
    el('profWinnings', formatCoins(user.total_winnings || 0));
  } catch (e) { console.error('loadProfile error:', e); }
}

async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return;
    const users = await res.json();
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">Нет данных</td></tr>';
      return;
    }
    tbody.innerHTML = users.slice(0, 20).map((u, i) => {
      const rankClass = i < 3 ? `rank-${i + 1}` : '';
      const rankText = i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1;
      return `<tr><td><span class="rank-badge ${rankClass}">${rankText}</span></td><td>${escHtml(u.username)}</td><td class="text-accent">${formatCoins(u.balance)}</td><td>${u.games_won || 0}</td><td>${formatCoins(u.total_winnings || 0)}</td></tr>`;
    }).join('');
  } catch (e) { console.error('loadLeaderboard error:', e); }
}

async function loadHistory() {
  try {
    if (!currentUser) return;
    const res = await apiFetch(`/api/bets/user/${currentUser.id}`);
    if (!res.ok) return;
    const bets = await res.json();
    const tbody = document.getElementById('historyBody');
    if (!tbody) return;
    if (!bets.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">История пуста</td></tr>';
      return;
    }
    tbody.innerHTML = bets.slice(0, 50).map(b => {
      const isWon = b.result === 'win';
      const result = isWon
        ? `<span class="won-badge">+${formatCoins(b.amount + (b.profit || 0))}</span>`
        : `<span class="lost-badge">Проигрыш</span>`;
      return `<tr>
        <td style="font-size:0.75rem;color:var(--text-muted);">GAME#${b.game_id}</td>
        <td>${b.game_type || '-'}</td>
        <td>${formatCoins(b.amount)}</td>
        <td>${result}</td>
        <td style="color:var(--text-muted);font-size:0.78rem;">${new Date(b.created_at).toLocaleDateString('ru-RU')}</td>
      </tr>`;
    }).join('');
  } catch (e) { console.error('loadHistory error:', e); }
}

async function loadPayouts() {
  try {
    if (!currentUser) return;
    const res = await apiFetch(`/api/bets/user/${currentUser.id}`);
    if (!res.ok) return;
    const bets = await res.json();
    const wins = bets.filter(b => b.result === 'win');
    const el = document.getElementById('payoutsContent');
    if (!el) return;
    if (!wins.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div>Нет данных о выплатах</div>'; return; }
    el.innerHTML = wins.map(b => `
      <div class="player-row" style="margin-bottom:8px;">
        <div class="player-name">${b.game_type || 'Игра'} #${b.game_id}</div>
        <div class="won-badge">+${formatCoins(b.amount + (b.profit || 0))}</div>
        <div style="color:var(--text-muted);font-size:0.78rem;margin-left:auto;">${new Date(b.created_at).toLocaleDateString('ru-RU')}</div>
      </div>`).join('');
  } catch (e) { console.error('loadPayouts error:', e); }
}

// ═══════════════════════════════════════════════════
// ── FREE COINS / PROMO / DEPOSIT / TRANSFER ─────────
// ═══════════════════════════════════════════════════
async function getFreeCoins() {
  try {
    const res = await apiFetch('/api/balance/free', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Ошибка', 'error');
    }
    if (currentUser) {
      currentUser.balance = data.balance;
      updateSidebar(currentUser);
    }
    showToast('+50 монет получено! 🎁', 'success');
  } catch (e) {
    showToast('Ошибка соединения с сервером', 'error');
  }
}

async function applyPromo() {
  const code = document.getElementById('promoInput').value.trim().toUpperCase();
  if (!code) return showToast('Введите промокод', 'error');

  try {
    const res = await apiFetch(`/api/promo/${encodeURIComponent(code)}/use`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Неверный промокод', 'error');
    }
    if (currentUser) {
      currentUser.balance = data.balance;
      updateSidebar(currentUser);
    }
    document.getElementById('promoInput').value = '';
    showToast(`Промокод ${code} активирован! 🎉`, 'success');
  } catch (e) {
    showToast('Ошибка соединения с сервером', 'error');
  }
}

function depositCoins() {
  const mdl = parseFloat(document.getElementById('depositAmount').value);
  if (!mdl || mdl < 10) return showToast('Минимальная сумма: 10 MDL', 'error');
  // In production this would go through a payment processor
  showToast('Функция пополнения будет доступна после запуска платёжной системы. Обратитесь к администратору.', 'info');
}

async function transferCoins() {
  const toUsername = document.getElementById('transferTo').value.trim();
  const amount = parseInt(document.getElementById('transferAmount').value);
  if (!toUsername) return showToast('Введите ник получателя', 'error');
  if (!amount || amount <= 0) return showToast('Введите сумму перевода', 'error');
  if (!currentUser || currentUser.balance < amount) return showToast('Недостаточно монет', 'error');

  try {
    const res = await apiFetch('/api/balance/transfer', {
      method: 'POST',
      body: JSON.stringify({ to_username: toUsername, amount })
    });
    const data = await res.json();
    if (!res.ok) {
      return showToast(data.error || 'Ошибка перевода', 'error');
    }
    currentUser.balance = data.balance;
    updateSidebar(currentUser);
    document.getElementById('transferTo').value = '';
    document.getElementById('transferAmount').value = '';
    showToast(`Переведено ${formatCoins(amount)} → ${toUsername}! ✅`, 'success');
  } catch (e) {
    showToast('Ошибка соединения с сервером', 'error');
  }
}

// ═══════════════════════════════════════════════════
// ── REFERRAL ───────────────────────────────────────
// ═══════════════════════════════════════════════════
function loadReferral() {
  const code = currentUser?.referral_code || '-';
  const codeEl = document.getElementById('refCode');
  if (codeEl) codeEl.textContent = code;
  const linkEl = document.getElementById('refLink');
  if (linkEl) {
    const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
    linkEl.textContent = window.location.origin + basePath + '/register.html?ref=' + code;
  }
}

function copyRefCode() {
  const code = document.getElementById('refCode')?.textContent;
  if (!code) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => showToast('Код скопирован!', 'success'));
  } else {
    showToast('Ваш код: ' + code, 'info');
  }
}

// ═══════════════════════════════════════════════════
// ── GAME LOOP (1-second tick for timers) ───────────
// ═══════════════════════════════════════════════════
let tickCount = 0;

function gameTick() {
  tickCount++;

  // Update jackpot timer display
  if (jackpotGame && jackpotGame.status === 'active' && jackpotGame.endsAt) {
    const el = document.getElementById('jpTimer');
    if (el) el.textContent = formatTimer(jackpotGame.endsAt - Date.now());
  } else if (jackpotGame && jackpotGame.status === 'waiting' && jackpotGame.bets && jackpotGame.bets.length > 0) {
    const el = document.getElementById('jpTimer');
    if (el) el.textContent = 'Ждём игрока...';
  }

  // Update battle timer display
  if (battleGame && battleGame.status === 'active' && battleGame.endsAt) {
    const el = document.getElementById('bgTimer');
    if (el) el.textContent = formatTimer(battleGame.endsAt - Date.now());
  }

  // Update fast game countdowns
  if (tickCount % 2 === 0) {
    const fgView = document.getElementById('game-fast');
    if (fgView && fgView.classList.contains('active')) renderFastGames();
  }

  // Update 1vs1 game cards (countdown display)
  if (tickCount % 2 === 0) {
    const ovView = document.getElementById('game-1vs1');
    if (ovView && ovView.classList.contains('active')) {
      const duelScreen = document.getElementById('duel-screen');
      const isScreenVisible = duelScreen && duelScreen.style.display !== 'none';
      if (!isScreenVisible && !activeDuelId) render1vs1Games();
    }
  }

  // Update duel screen timer if waiting
  if (activeDuelId) {
    const activeG = vs1Games.find(g => g.gameId === activeDuelId);
    if (activeG && activeG.status === 'waiting' && activeG.abandonAt) {
      const waitLeft = Math.max(0, Math.ceil((activeG.abandonAt - Date.now()) / 1000));
      const timerEl = document.getElementById('duelTimer');
      if (timerEl) timerEl.textContent = `⏳ Ожидание соперника: ${waitLeft}с`;
    }
  }
}

// ══════════════════════════════════════════════════
// ── INIT ──────────────────────────────────────────
// ══════════════════════════════════════════════════
(async function init() {
  // Try to load user from cached data first
  try {
    const cached = JSON.parse(localStorage.getItem('em_user') || 'null');
    if (cached) {
      currentUser = cached;
      updateSidebar(currentUser);
    }
  } catch (e) { /* ignore */ }

  // Verify token and get fresh user data from server
  try {
    const res = await apiFetch('/api/profile');
    if (!res.ok) {
      localStorage.removeItem('em_token');
      localStorage.removeItem('em_user');
      window.location.href = 'login.html';
      return;
    }
    const user = await res.json();
    currentUser = user;
    localStorage.setItem('em_user', JSON.stringify(user));
    updateSidebar(user);
  } catch (e) {
    // If server unavailable but we have a cached user, continue offline
    if (!currentUser) {
      window.location.href = 'login.html';
      return;
    }
  }

  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if (urlRef) localStorage.setItem('pendingRef', urlRef);

  setInterval(gameTick, 1000);
})();
