/* ═══════════════════════════════════════════════════
   EpicMoney – Admin Panel JavaScript
   All data stored in localStorage (em_ prefix)
   ═══════════════════════════════════════════════════ */

// ── Storage Keys ────────────────────────────────
const K = {
  USERS:        'em_users',
  CUR_UID:      'em_current_uid',
  ADMIN_UID:    'em_admin_uid',
  JACKPOT:      'em_jackpot',
  BATTLE:       'em_battle',
  FAST:         'em_fast_games',
  OVS:          'em_1vs1_games',
  CHAT:         'em_chat',
  HISTORY:      'em_history',
  ADMIN_LOGS:   'em_admin_logs',
  BALANCE_LOG:  'em_balance_log',
  MOD_LOG:      'em_mod_log',
  BANNED_WORDS: 'em_banned_words',
  PROMOS:       'em_admin_promos',
  SETTINGS:     'em_admin_settings'
};

// ── localStorage helpers ────────────────────────
const ls = {
  get:  (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set:  (k, v) => localStorage.setItem(k, JSON.stringify(v))
};

// ── Auth guard ──────────────────────────────────
const adminUid = localStorage.getItem(K.ADMIN_UID);
if (!adminUid) {
  window.location.href = 'admin-login.html';
}

const users      = () => ls.get(K.USERS, []);
const adminUser  = () => users().find(u => u.id === adminUid) || null;

// ── Pagination state ────────────────────────────
const PAGE_SIZE = 20;
const pages = { users: 1, games: 1, logs: 1, balances: 1, promos: 1 };

// ── Current moderation target ───────────────────
let _moderateTarget = null;
let _moderateAction = null;
let _editingPromoCode = null;
let _confirmCallback = null;
let _giveCoinsUid = null;

// ── Utility ─────────────────────────────────────
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCoins(n) {
  return Number(n || 0).toLocaleString('ru-RU') + ' 🪙';
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function formatDateShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function genId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// ── Modal helpers ────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', (e) => {
    if (e.target === el) el.classList.remove('open');
  });
});

// ── Confirm dialog ───────────────────────────────
function confirmAction(title, msg, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  _confirmCallback = callback;
  openModal('confirmModal');
}

document.getElementById('confirmOkBtn').addEventListener('click', () => {
  closeModal('confirmModal');
  if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
});

// ── Admin log helper ─────────────────────────────
function addAdminLog(type, description, result = 'ok', username = '') {
  const logs = ls.get(K.ADMIN_LOGS, []);
  logs.unshift({
    id: genId(),
    ts: Date.now(),
    adminId: adminUid,
    adminName: adminUser()?.username || 'admin',
    username: username,
    type,
    description,
    result
  });
  ls.set(K.ADMIN_LOGS, logs.slice(0, 2000));
}

// ── Navigation ───────────────────────────────────
function showAdminSection(name) {
  document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelector(`[data-section="${name}"]`).classList.add('active');

  // Render section
  switch (name) {
    case 'dashboard':   renderDashboard(); break;
    case 'users':       renderUsersTable(); break;
    case 'balances':    renderBalanceLog(); break;
    case 'games':       renderGamesTable(); break;
    case 'logs':        renderLogsTable(); break;
    case 'moderation':  renderModeration(); break;
    case 'settings':    renderSettings(); break;
    case 'promos':      renderPromosTable(); break;
  }
}

// ── Admin logout ─────────────────────────────────
function adminLogout() {
  localStorage.removeItem(K.ADMIN_UID);
  window.location.href = 'admin-login.html';
}

// ── Init ─────────────────────────────────────────
(function init() {
  const au = adminUser();
  if (!au) { adminLogout(); return; }
  document.getElementById('adminUserName').textContent = au.username;
  renderDashboard();
  addAdminLog('system', 'Вход в панель администратора', 'ok', au.username);
})();

// ═══════════════════════════════════════════════════
// ── DASHBOARD ────────────────────────────────────
// ═══════════════════════════════════════════════════
function renderDashboard() {
  const allUsers = users();
  const history = ls.get(K.HISTORY, []);
  const logs = ls.get(K.ADMIN_LOGS, []);

  const activeUsers = allUsers.filter(u => u.status !== 'banned');
  const bannedUsers = allUsers.filter(u => u.status === 'banned');
  const totalCoins  = allUsers.reduce((s, u) => s + (u.coins || 0), 0);
  const totalWon    = allUsers.reduce((s, u) => s + (u.totalWinnings || 0), 0);

  const now = Date.now();
  const dayMs  = 86400000;
  const weekMs = dayMs * 7;

  const allGames = getAllGames();
  const gamesDay  = allGames.filter(g => g.createdAt > now - dayMs);
  const gamesWeek = allGames.filter(g => g.createdAt > now - weekMs);

  const statsEl = document.getElementById('dashboardStats');
  statsEl.innerHTML = [
    { icon:'👥', val: allUsers.length, label: `Игроков (${bannedUsers.length} забанено)` },
    { icon:'✅', val: activeUsers.length, label: 'Активных игроков' },
    { icon:'🎮', val: gamesDay.length, label: 'Игр за сегодня' },
    { icon:'📅', val: gamesWeek.length, label: 'Игр за неделю' },
    { icon:'🏆', val: formatCoins(totalWon), label: 'Всего выплачено' },
    { icon:'💰', val: formatCoins(totalCoins), label: 'Монет в системе' },
    { icon:'🎰', val: allGames.filter(g => g.status !== 'finished').length, label: 'Активных игр' },
    { icon:'📋', val: ls.get(K.ADMIN_LOGS, []).length, label: 'Записей в логах' }
  ].map(s => `
    <div class="stat-card">
      <div class="stat-icon">${s.icon}</div>
      <div class="stat-value">${typeof s.val === 'number' ? s.val.toLocaleString('ru-RU') : s.val}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');

  // Activity bar chart (24h by hour)
  const hourBuckets = new Array(24).fill(0);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  logs.filter(l => l.ts >= todayStart.getTime()).forEach(l => {
    hourBuckets[new Date(l.ts).getHours()]++;
  });
  const maxH = Math.max(...hourBuckets, 1);
  const chartEl = document.getElementById('activityChart');
  const labelsEl = document.getElementById('activityChartLabels');
  chartEl.innerHTML = hourBuckets.map((v, i) =>
    `<div class="bar" title="${i}:00 — ${v} действий" style="height:${Math.round((v/maxH)*100)}%"></div>`
  ).join('');
  labelsEl.innerHTML = `<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>`;

  // Game type stats
  const typeCount = { jackpot:0, battle:0, fast:0, '1vs1':0 };
  allGames.forEach(g => { if (typeCount[g.type] !== undefined) typeCount[g.type]++; });
  document.getElementById('gameTypeStats').innerHTML = Object.entries(typeCount).map(([t, c]) => `
    <div class="info-row">
      <span class="info-key">${gameTypeName(t)}</span>
      <span class="info-val text-accent">${c}</span>
    </div>
  `).join('');

  // Recent payouts from history
  const recentHist = allGames.filter(g => g.status === 'finished' && g.winner).slice(0, 8);
  document.getElementById('recentPayouts').innerHTML = recentHist.length ? recentHist.map(g => `
    <div class="info-row">
      <span class="info-key">${escHtml(g.winner)} <span class="badge badge-gray" style="margin-left:4px">${gameTypeName(g.type)}</span></span>
      <span class="info-val text-green">+${formatCoins(g.pot || 0)}</span>
    </div>
  `).join('') : '<div class="empty-state"><div class="empty-icon">💤</div><p>Нет выплат</p></div>';
}

// ═══════════════════════════════════════════════════
// ── USERS TABLE ──────────────────────────────────
// ═══════════════════════════════════════════════════
function renderUsersTable() {
  const search  = (document.getElementById('userSearch').value || '').toLowerCase();
  const status  = document.getElementById('userStatusFilter').value;
  const sortBy  = document.getElementById('userSortBy').value;

  let list = users();

  if (search) list = list.filter(u =>
    (u.username||'').toLowerCase().includes(search) ||
    (u.email||'').toLowerCase().includes(search)
  );
  if (status) list = list.filter(u => (u.status || 'active') === status);

  list = list.sort((a, b) => {
    if (sortBy === 'coins')       return (b.coins||0) - (a.coins||0);
    if (sortBy === 'gamesPlayed') return (b.gamesPlayed||0) - (a.gamesPlayed||0);
    return (b.createdAt||0) - (a.createdAt||0);
  });

  const total = list.length;
  const p = pages.users;
  const slice = list.slice((p-1)*PAGE_SIZE, p*PAGE_SIZE);

  const tbody = document.getElementById('usersTableBody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👥</div><p>Пользователи не найдены</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(u => {
      const st = u.status || 'active';
      const stBadge = st === 'banned'
        ? `<span class="badge badge-red">Забанен</span>`
        : `<span class="badge badge-green">Активен</span>`;
      return `
        <tr>
          <td class="text-muted truncate" style="font-size:0.75rem">${escHtml(u.id)}</td>
          <td><strong>${escHtml(u.username)}</strong></td>
          <td class="text-muted">${escHtml(u.email||'—')}</td>
          <td class="text-accent font-bold">${formatCoins(u.coins)}</td>
          <td>${u.gamesPlayed||0}</td>
          <td>${stBadge}</td>
          <td class="text-muted">${formatDateShort(u.createdAt)}</td>
          <td>
            <div class="action-btns">
              <button class="btn btn-outline btn-sm" onclick="viewUser('${escHtml(u.id)}')">👁</button>
              <button class="btn btn-blue btn-sm" onclick="openGiveCoins('${escHtml(u.id)}')">💰</button>
              ${st === 'banned'
                ? `<button class="btn btn-outline btn-sm" onclick="toggleBan('${escHtml(u.id)}', false)">✅</button>`
                : `<button class="btn btn-danger btn-sm" onclick="toggleBan('${escHtml(u.id)}', true)">🚫</button>`}
              <button class="btn btn-danger btn-sm" onclick="deleteUser('${escHtml(u.id)}')">🗑</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  renderPagination('usersPagination', total, p, (newP) => { pages.users = newP; renderUsersTable(); });
}

function viewUser(id) {
  const u = users().find(u => u.id === id);
  if (!u) return;
  const games = getAllGames().filter(g => g.players && g.players.some && g.players.some(p => p.id === id || p === id));
  document.getElementById('viewUserBody').innerHTML = `
    <div class="info-row"><span class="info-key">ID</span><span class="info-val" style="font-size:0.78rem">${escHtml(u.id)}</span></div>
    <div class="info-row"><span class="info-key">Ник</span><span class="info-val">${escHtml(u.username)}</span></div>
    <div class="info-row"><span class="info-key">Email</span><span class="info-val">${escHtml(u.email||'—')}</span></div>
    <div class="info-row"><span class="info-key">Баланс</span><span class="info-val text-accent">${formatCoins(u.coins)}</span></div>
    <div class="info-row"><span class="info-key">Игр сыграно</span><span class="info-val">${u.gamesPlayed||0}</span></div>
    <div class="info-row"><span class="info-key">Побед</span><span class="info-val">${u.gamesWon||0}</span></div>
    <div class="info-row"><span class="info-key">Всего выиграно</span><span class="info-val text-green">${formatCoins(u.totalWinnings)}</span></div>
    <div class="info-row"><span class="info-key">Статус</span><span class="info-val">${u.status==='banned'?'<span class="badge badge-red">Забанен</span>':'<span class="badge badge-green">Активен</span>'}</span></div>
    <div class="info-row"><span class="info-key">Реф. код</span><span class="info-val">${escHtml(u.referralCode||'—')}</span></div>
    <div class="info-row"><span class="info-key">Регистрация</span><span class="info-val">${formatDate(u.createdAt)}</span></div>
    <div class="info-row"><span class="info-key">Участвовал в играх</span><span class="info-val">${games.length}</span></div>
  `;
  openModal('viewUserModal');
}

function toggleBan(id, ban) {
  const u = users().find(u => u.id === id);
  if (!u) return;
  const msg = ban
    ? `Заблокировать пользователя "${u.username}"? Он не сможет войти в систему.`
    : `Разблокировать пользователя "${u.username}"?`;
  confirmAction(ban ? '🚫 Заблокировать' : '✅ Разблокировать', msg, () => {
    const allUsers = users();
    const i = allUsers.findIndex(x => x.id === id);
    allUsers[i].status = ban ? 'banned' : 'active';
    ls.set(K.USERS, allUsers);
    addAdminLog('ban', `${ban ? 'Заблокирован' : 'Разблокирован'} пользователь`, 'ok', u.username);
    showToast(ban ? `Пользователь ${u.username} заблокирован` : `Пользователь ${u.username} разблокирован`, ban ? 'error' : 'success');
    renderUsersTable();
  });
}

function deleteUser(id) {
  const u = users().find(u => u.id === id);
  if (!u) return;
  confirmAction('🗑 Удалить пользователя', `Удалить "${u.username}"? Это действие необратимо!`, () => {
    const allUsers = users().filter(x => x.id !== id);
    ls.set(K.USERS, allUsers);
    addAdminLog('system', `Удалён пользователь ${u.username}`, 'ok', u.username);
    showToast(`Пользователь ${u.username} удалён`, 'success');
    renderUsersTable();
  });
}

// ── Give Coins ───────────────────────────────────
function openGiveCoins(uid) {
  _giveCoinsUid = uid;
  const u = users().find(x => x.id === uid);
  if (!u) return;
  document.getElementById('giveCoinsUserInfo').innerHTML = `
    <strong>${escHtml(u.username)}</strong> &nbsp; Текущий баланс: <span class="text-accent font-bold">${formatCoins(u.coins)}</span>
  `;
  document.getElementById('giveCoinsAmount').value = '';
  document.getElementById('giveCoinsReason').value = '';
  openModal('giveCoinsModal');
}

function submitGiveCoins() {
  const amount = parseInt(document.getElementById('giveCoinsAmount').value);
  const reason = document.getElementById('giveCoinsReason').value.trim();
  if (!amount || amount < 1) { showToast('Введите корректную сумму', 'error'); return; }

  const allUsers = users();
  const i = allUsers.findIndex(x => x.id === _giveCoinsUid);
  if (i < 0) return;
  const u = allUsers[i];
  allUsers[i].coins = (allUsers[i].coins || 0) + amount;
  ls.set(K.USERS, allUsers);

  // Add to balance log
  addBalanceLog(_giveCoinsUid, u.username, 'add', amount, reason || 'Выдача администратором');
  addAdminLog('deposit', `Выдано ${amount} монет пользователю ${u.username}${reason ? '. Причина: ' + reason : ''}`, 'ok', u.username);
  closeModal('giveCoinsModal');
  showToast(`Выдано ${formatCoins(amount)} пользователю ${u.username}`, 'success');
  renderUsersTable();
}

// ═══════════════════════════════════════════════════
// ── BALANCE LOG ──────────────────────────────────
// ═══════════════════════════════════════════════════
function addBalanceLog(userId, username, op, amount, reason) {
  const log = ls.get(K.BALANCE_LOG, []);
  log.unshift({
    id: genId(),
    ts: Date.now(),
    userId,
    username,
    op,
    amount,
    reason,
    adminId: adminUid,
    adminName: adminUser()?.username || 'admin'
  });
  ls.set(K.BALANCE_LOG, log.slice(0, 2000));
}

function renderBalanceLog() {
  const search    = (document.getElementById('balanceSearch').value || '').toLowerCase();
  const opFilter  = document.getElementById('balanceOpFilter').value;

  let list = ls.get(K.BALANCE_LOG, []);
  if (search)   list = list.filter(l => (l.username||'').toLowerCase().includes(search));
  if (opFilter) list = list.filter(l => l.op === opFilter);

  const total = list.length;
  const p = pages.balances;
  const slice = list.slice((p-1)*PAGE_SIZE, p*PAGE_SIZE);

  const tbody = document.getElementById('balanceLogBody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💰</div><p>Операций нет</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(l => `
      <tr>
        <td class="text-muted">${formatDate(l.ts)}</td>
        <td><strong>${escHtml(l.username||'—')}</strong></td>
        <td>${l.op === 'add'
          ? '<span class="badge badge-green">Пополнение</span>'
          : '<span class="badge badge-red">Снятие</span>'}</td>
        <td class="${l.op === 'add' ? 'text-green' : 'text-red'} font-bold">${l.op === 'add' ? '+' : '-'}${formatCoins(l.amount)}</td>
        <td class="text-muted">${escHtml(l.reason||'—')}</td>
        <td class="text-muted">${escHtml(l.adminName||'—')}</td>
      </tr>`).join('');
  }

  renderPagination('balancePagination', total, p, (newP) => { pages.balances = newP; renderBalanceLog(); });
}

function openBalanceModal() {
  const sel = document.getElementById('balanceUserId');
  sel.innerHTML = users().filter(u => u.status !== 'banned')
    .sort((a,b) => (a.username||'').localeCompare(b.username||''))
    .map(u => `<option value="${escHtml(u.id)}">${escHtml(u.username)} (${formatCoins(u.coins)})</option>`).join('');
  document.getElementById('balanceAmount').value = '';
  document.getElementById('balanceReason').value = '';
  document.getElementById('balanceCurrentInfo').style.display = 'none';
  openModal('balanceModal');
  onBalanceUserChange();
}

function onBalanceUserChange() {
  const id = document.getElementById('balanceUserId').value;
  const u = users().find(x => x.id === id);
  const infoEl = document.getElementById('balanceCurrentInfo');
  if (u) {
    infoEl.innerHTML = `Текущий баланс: <span class="text-accent font-bold">${formatCoins(u.coins)}</span>`;
    infoEl.style.display = 'block';
  } else {
    infoEl.style.display = 'none';
  }
}

function submitBalanceChange() {
  const id     = document.getElementById('balanceUserId').value;
  const op     = document.getElementById('balanceOp').value;
  const amount = parseInt(document.getElementById('balanceAmount').value);
  const reason = document.getElementById('balanceReason').value.trim();

  if (!id) { showToast('Выберите пользователя', 'error'); return; }
  if (!amount || amount < 1) { showToast('Введите корректную сумму', 'error'); return; }

  const allUsers = users();
  const i = allUsers.findIndex(x => x.id === id);
  if (i < 0) return;
  const u = allUsers[i];

  if (op === 'sub' && (u.coins||0) < amount) {
    showToast('Недостаточно монет на счету пользователя', 'error');
    return;
  }

  allUsers[i].coins = op === 'add' ? (u.coins||0) + amount : Math.max(0, (u.coins||0) - amount);
  ls.set(K.USERS, allUsers);

  addBalanceLog(id, u.username, op, amount, reason || 'Операция администратором');
  addAdminLog(op === 'add' ? 'deposit' : 'withdraw',
    `${op === 'add' ? 'Пополнение' : 'Снятие'} ${amount} монет у ${u.username}${reason ? '. Причина: ' + reason : ''}`,
    'ok', u.username);

  closeModal('balanceModal');
  showToast(`Баланс ${u.username} изменён на ${op === 'add' ? '+' : '-'}${formatCoins(amount)}`, 'success');
  renderBalanceLog();
}

// ═══════════════════════════════════════════════════
// ── GAMES ────────────────────────────────────────
// ═══════════════════════════════════════════════════
function getAllGames() {
  const jackpot = ls.get(K.JACKPOT, null);
  const battle  = ls.get(K.BATTLE, null);
  const fastArr = ls.get(K.FAST, []);
  const ovsArr  = ls.get(K.OVS, []);
  const list    = [];

  if (jackpot) list.push({ ...jackpot, type: 'jackpot', id: jackpot.id || 'jackpot-1' });
  if (battle)  list.push({ ...battle, type: 'battle', id: battle.id || 'battle-1' });
  fastArr.forEach(g => list.push({ ...g, type: 'fast' }));
  ovsArr.forEach(g => list.push({ ...g, type: '1vs1' }));

  return list;
}

function gameTypeName(type) {
  const names = { jackpot:'🎰 Jackpot', battle:'⚔️ Battle', fast:'⚡ Fast', '1vs1':'🥊 1vs1' };
  return names[type] || type;
}

function gameStatusBadge(status) {
  if (status === 'waiting')  return '<span class="badge badge-yellow">Ожидание</span>';
  if (status === 'active')   return '<span class="badge badge-green">В процессе</span>';
  if (status === 'finished') return '<span class="badge badge-gray">Завершена</span>';
  return `<span class="badge badge-gray">${escHtml(status||'—')}</span>`;
}

function getGamePlayers(g) {
  if (g.players) {
    if (Array.isArray(g.players)) {
      return g.players.map(p => typeof p === 'object' ? (p.username || p.id) : p).join(', ');
    }
  }
  if (g.playerA && g.playerB) return `${g.playerA.username||'?'} vs ${g.playerB.username||'?'}`;
  if (g.playerA) return g.playerA.username || '?';
  return '—';
}

function renderGamesTable() {
  const typeFilter   = document.getElementById('gameTypeFilter').value;
  const statusFilter = document.getElementById('gameStatusFilter').value;

  let list = getAllGames();
  if (typeFilter)   list = list.filter(g => g.type === typeFilter);
  if (statusFilter) list = list.filter(g => (g.status||'') === statusFilter);

  list = list.sort((a, b) => (b.createdAt||0) - (a.createdAt||0));

  const total = list.length;
  const p = pages.games;
  const slice = list.slice((p-1)*PAGE_SIZE, p*PAGE_SIZE);

  const tbody = document.getElementById('gamesTableBody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🎮</div><p>Игр не найдено</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(g => `
      <tr>
        <td class="text-muted" style="font-size:0.75rem">${escHtml(g.id||'—')}</td>
        <td>${gameTypeName(g.type)}</td>
        <td class="text-accent font-bold">${formatCoins(g.pot || g.bank || 0)}</td>
        <td class="text-muted truncate">${escHtml(getGamePlayers(g))}</td>
        <td>${gameStatusBadge(g.status)}</td>
        <td class="text-muted">${formatDate(g.createdAt)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-outline btn-sm" onclick="viewGame('${escHtml(g.id)}','${escHtml(g.type)}')">👁</button>
            ${g.status !== 'finished'
              ? `<button class="btn btn-danger btn-sm" onclick="stopGame('${escHtml(g.id)}','${escHtml(g.type)}')">⏹</button>`
              : ''}
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination('gamesPagination', total, p, (newP) => { pages.games = newP; renderGamesTable(); });
}

function viewGame(id, type) {
  const game = getAllGames().find(g => g.id === id && g.type === type);
  if (!game) return;
  document.getElementById('viewGameBody').innerHTML = `
    <div class="info-row"><span class="info-key">ID</span><span class="info-val" style="font-size:0.78rem">${escHtml(game.id)}</span></div>
    <div class="info-row"><span class="info-key">Тип</span><span class="info-val">${gameTypeName(game.type)}</span></div>
    <div class="info-row"><span class="info-key">Банк</span><span class="info-val text-accent">${formatCoins(game.pot || game.bank || 0)}</span></div>
    <div class="info-row"><span class="info-key">Статус</span><span class="info-val">${gameStatusBadge(game.status)}</span></div>
    <div class="info-row"><span class="info-key">Игроки</span><span class="info-val">${escHtml(getGamePlayers(game))}</span></div>
    <div class="info-row"><span class="info-key">Создана</span><span class="info-val">${formatDate(game.createdAt)}</span></div>
    ${game.endedAt ? `<div class="info-row"><span class="info-key">Завершена</span><span class="info-val">${formatDate(game.endedAt)}</span></div>` : ''}
    ${game.winner ? `<div class="info-row"><span class="info-key">Победитель</span><span class="info-val text-green">${escHtml(game.winner)}</span></div>` : ''}
  `;
  openModal('viewGameModal');
}

function stopGame(id, type) {
  confirmAction('⏹ Остановить игру', 'Остановить игру и вернуть монеты участникам?', () => {
    // Mark game as finished and refund
    const key = { jackpot: K.JACKPOT, battle: K.BATTLE, fast: K.FAST, '1vs1': K.OVS }[type];
    if (!key) return;

    if (type === 'jackpot' || type === 'battle') {
      const game = ls.get(key, null);
      if (game && game.id === id) {
        // Refund all players
        if (game.players) {
          const allUsers = users();
          game.players.forEach(p => {
            const pid = typeof p === 'object' ? p.id : null;
            const pbid = typeof p === 'object' ? p.bet : 0;
            if (pid) {
              const idx = allUsers.findIndex(u => u.id === pid);
              if (idx >= 0) allUsers[idx].coins = (allUsers[idx].coins || 0) + (pbid || 0);
            }
          });
          ls.set(K.USERS, allUsers);
        }
        ls.set(key, null);
      }
    } else {
      const arr = ls.get(key, []);
      const game = arr.find(g => g.id === id);
      if (game) {
        // Refund players
        const allUsers = users();
        const refundPlayer = (p) => {
          const pid = typeof p === 'object' ? p.id : null;
          const pbid = typeof p === 'object' ? (p.bet || p.coins || 0) : 0;
          if (pid) {
            const idx = allUsers.findIndex(u => u.id === pid);
            if (idx >= 0) allUsers[idx].coins = (allUsers[idx].coins || 0) + pbid;
          }
        };
        if (game.players && Array.isArray(game.players)) game.players.forEach(refundPlayer);
        if (game.playerA) refundPlayer(game.playerA);
        if (game.playerB) refundPlayer(game.playerB);
        ls.set(K.USERS, allUsers);
        ls.set(key, arr.filter(g => g.id !== id));
      }
    }

    addAdminLog('system', `Игра ${id} (${type}) остановлена администратором`, 'ok');
    showToast('Игра остановлена, монеты возвращены', 'success');
    renderGamesTable();
  });
}

// ═══════════════════════════════════════════════════
// ── LOGS ─────────────────────────────────────────
// ═══════════════════════════════════════════════════
function renderLogsTable() {
  const search    = (document.getElementById('logSearch').value || '').toLowerCase();
  const typeFilter = document.getElementById('logTypeFilter').value;
  const dateFrom  = document.getElementById('logDateFrom').value;
  const dateTo    = document.getElementById('logDateTo').value;

  let list = ls.get(K.ADMIN_LOGS, []);

  if (search)    list = list.filter(l =>
    (l.username||'').toLowerCase().includes(search) ||
    (l.description||'').toLowerCase().includes(search) ||
    (l.type||'').toLowerCase().includes(search)
  );
  if (typeFilter) list = list.filter(l => l.type === typeFilter);
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    list = list.filter(l => l.ts >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime() + 86399999;
    list = list.filter(l => l.ts <= to);
  }

  const total = list.length;
  const p = pages.logs;
  const slice = list.slice((p-1)*PAGE_SIZE, p*PAGE_SIZE);

  const tbody = document.getElementById('logsTableBody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📝</div><p>Логов нет</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(l => `
      <tr>
        <td class="text-muted">${formatDate(l.ts)}</td>
        <td><strong>${escHtml(l.username||l.adminName||'—')}</strong></td>
        <td><span class="log-type-${escHtml(l.type)}">${escHtml(l.type||'—')}</span></td>
        <td>${escHtml(l.description||'—')}</td>
        <td>${l.result === 'ok'
          ? '<span class="badge badge-green">OK</span>'
          : '<span class="badge badge-red">Ошибка</span>'}</td>
      </tr>`).join('');
  }

  renderPagination('logsPagination', total, p, (newP) => { pages.logs = newP; renderLogsTable(); });
}

function exportLogs() {
  const logs = ls.get(K.ADMIN_LOGS, []);
  const rows = [['Время','Пользователь','Тип','Описание','Результат']];
  logs.forEach(l => rows.push([
    formatDate(l.ts),
    l.username || l.adminName || '',
    l.type || '',
    l.description || '',
    l.result || ''
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `epicmoney_logs_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Логи экспортированы', 'success');
}

// ═══════════════════════════════════════════════════
// ── MODERATION ───────────────────────────────────
// ═══════════════════════════════════════════════════
function renderModeration() {
  renderWordsTable();
  renderModLog();
  renderModUsersTable();
}

function renderWordsTable() {
  const words = ls.get(K.BANNED_WORDS, []);
  const tbody = document.getElementById('wordsTableBody');
  if (!words.length) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state" style="padding:20px"><div class="empty-icon">✅</div><p>Запрещённых слов нет</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = words.map((w, i) => `
    <tr>
      <td><strong>${escHtml(w.word)}</strong></td>
      <td><span class="badge ${w.action==='ban'?'badge-red':w.action==='warn'?'badge-yellow':'badge-gray'}">${
        w.action==='ban'?'Бан':w.action==='warn'?'Предупреждение':'Скрыть'
      }</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteWord(${i})">🗑</button></td>
    </tr>`).join('');
}

function openWordModal() {
  document.getElementById('newWordInput').value = '';
  document.getElementById('newWordAction').value = 'hide';
  openModal('wordModal');
}

function submitWord() {
  const word   = document.getElementById('newWordInput').value.trim().toLowerCase();
  const action = document.getElementById('newWordAction').value;
  if (!word) { showToast('Введите слово', 'error'); return; }
  const words = ls.get(K.BANNED_WORDS, []);
  if (words.find(w => w.word === word)) { showToast('Слово уже добавлено', 'error'); return; }
  words.push({ word, action });
  ls.set(K.BANNED_WORDS, words);
  addAdminLog('system', `Добавлено запрещённое слово: "${word}" (${action})`);
  closeModal('wordModal');
  showToast('Слово добавлено', 'success');
  renderWordsTable();
}

function deleteWord(idx) {
  const words = ls.get(K.BANNED_WORDS, []);
  const w = words[idx];
  if (!w) return;
  confirmAction('🗑 Удалить слово', `Удалить "${w.word}" из списка запрещённых слов?`, () => {
    words.splice(idx, 1);
    ls.set(K.BANNED_WORDS, words);
    addAdminLog('system', `Удалено запрещённое слово: "${w.word}"`);
    showToast('Слово удалено', 'success');
    renderWordsTable();
  });
}

function renderModLog() {
  const log = ls.get(K.MOD_LOG, []);
  const tbody = document.getElementById('modLogBody');
  if (!log.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding:20px"><div class="empty-icon">📋</div><p>Нет записей</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = log.slice(0, 50).map(l => `
    <tr>
      <td class="text-muted">${formatDate(l.ts)}</td>
      <td><strong>${escHtml(l.username||'—')}</strong></td>
      <td><span class="badge ${l.action==='ban'?'badge-red':l.action==='mute'?'badge-yellow':'badge-blue'}">${
        l.action==='ban'?'Бан':l.action==='mute'?'Мьют':l.action==='warn'?'Предупреждение':'—'
      }</span></td>
      <td class="text-muted">${escHtml(l.reason||'—')}</td>
    </tr>`).join('');
}

function renderModUsersTable() {
  const search = (document.getElementById('modUserSearch').value || '').toLowerCase();
  let list = users().filter(u => !search || (u.username||'').toLowerCase().includes(search));

  const tbody = document.getElementById('modUsersBody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state" style="padding:20px"><div class="empty-icon">👥</div><p>Пользователи не найдены</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.slice(0, 30).map(u => {
    const muteUntil = u.muteUntil && u.muteUntil > Date.now()
      ? `<span class="badge badge-yellow">до ${formatDate(u.muteUntil)}</span>`
      : '—';
    const st = u.status === 'banned'
      ? '<span class="badge badge-red">Забанен</span>'
      : '<span class="badge badge-green">Активен</span>';
    return `
      <tr>
        <td><strong>${escHtml(u.username)}</strong></td>
        <td>${st}</td>
        <td>${muteUntil}</td>
        <td>${u.warnings || 0}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-outline btn-sm" onclick="openModerate('${escHtml(u.id)}','warn')">⚠️</button>
            <button class="btn btn-blue btn-sm" onclick="openModerate('${escHtml(u.id)}','mute')">🔇</button>
            ${u.status === 'banned'
              ? `<button class="btn btn-outline btn-sm" onclick="toggleBan('${escHtml(u.id)}',false)">✅</button>`
              : `<button class="btn btn-danger btn-sm" onclick="toggleBan('${escHtml(u.id)}',true)">🚫</button>`}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function openModerate(uid, action) {
  _moderateTarget = uid;
  _moderateAction = action;
  const u = users().find(x => x.id === uid);
  if (!u) return;
  const titles = { warn:'⚠️ Предупреждение', mute:'🔇 Мьют' };
  document.getElementById('moderateModalTitle').textContent = titles[action] || 'Действие';
  document.getElementById('moderateUserInfo').innerHTML = `Пользователь: <strong>${escHtml(u.username)}</strong>`;
  document.getElementById('muteDurationGroup').style.display = action === 'mute' ? '' : 'none';
  document.getElementById('moderateReason').value = '';
  document.getElementById('moderateSubmitBtn').textContent = action === 'warn' ? 'Отправить предупреждение' : 'Применить мьют';
  openModal('moderateModal');
}

function submitModeration() {
  const reason = document.getElementById('moderateReason').value.trim();
  if (!reason) { showToast('Укажите причину', 'error'); return; }

  const allUsers = users();
  const i = allUsers.findIndex(x => x.id === _moderateTarget);
  if (i < 0) return;
  const u = allUsers[i];

  if (_moderateAction === 'warn') {
    allUsers[i].warnings = (allUsers[i].warnings || 0) + 1;
  } else if (_moderateAction === 'mute') {
    const hours = parseInt(document.getElementById('muteDuration').value) || 24;
    allUsers[i].muteUntil = Date.now() + hours * 3600000;
  }

  ls.set(K.USERS, allUsers);

  // Add to mod log
  const modLog = ls.get(K.MOD_LOG, []);
  modLog.unshift({ ts: Date.now(), userId: _moderateTarget, username: u.username, action: _moderateAction, reason, adminId: adminUid });
  ls.set(K.MOD_LOG, modLog.slice(0, 1000));

  addAdminLog('ban', `${_moderateAction==='warn'?'Предупреждение':'Мьют'} для ${u.username}: ${reason}`, 'ok', u.username);
  closeModal('moderateModal');
  showToast(`Действие применено к ${u.username}`, 'success');
  renderModeration();
}

// ═══════════════════════════════════════════════════
// ── SETTINGS ─────────────────────────────────────
// ═══════════════════════════════════════════════════
const DEFAULT_SETTINGS = {
  minBet: 10,
  maxBet: 100000,
  betLimit: 10,
  commission: 5,
  withdrawCommission: 2,
  depositCommission: 0,
  mdlToCoins: 10,
  mdlToTickets: 1,
  waitTime: 60,
  startDelay: 10,
  registrationEnabled: true,
  gamesEnabled: true
};

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...ls.get(K.SETTINGS, {}) };
}

function renderSettings() {
  const s = getSettings();
  const grid = document.getElementById('settingsGrid');
  grid.innerHTML = `
    <div class="settings-card">
      <h3>🎮 Параметры игр</h3>
      <div class="form-group">
        <label>Минимальная ставка (монет)</label>
        <input type="number" class="form-input" id="s_minBet" value="${s.minBet}" min="1" />
      </div>
      <div class="form-group">
        <label>Максимальная ставка (монет)</label>
        <input type="number" class="form-input" id="s_maxBet" value="${s.maxBet}" min="1" />
      </div>
      <div class="form-group">
        <label>Лимит ставок на игрока</label>
        <input type="number" class="form-input" id="s_betLimit" value="${s.betLimit}" min="1" />
      </div>
    </div>

    <div class="settings-card">
      <h3>💳 Комиссии (%)</h3>
      <div class="form-group">
        <label>Комиссия платформы</label>
        <input type="number" class="form-input" id="s_commission" value="${s.commission}" min="0" max="50" />
      </div>
      <div class="form-group">
        <label>Комиссия за вывод</label>
        <input type="number" class="form-input" id="s_withdrawCommission" value="${s.withdrawCommission}" min="0" max="50" />
      </div>
      <div class="form-group">
        <label>Комиссия за пополнение</label>
        <input type="number" class="form-input" id="s_depositCommission" value="${s.depositCommission}" min="0" max="50" />
      </div>
    </div>

    <div class="settings-card">
      <h3>🔄 Конверсия валют</h3>
      <div class="form-group">
        <label>1 MDL = ? монет</label>
        <input type="number" class="form-input" id="s_mdlToCoins" value="${s.mdlToCoins}" min="1" />
      </div>
      <div class="form-group">
        <label>1 MDL = ? билетов</label>
        <input type="number" class="form-input" id="s_mdlToTickets" value="${s.mdlToTickets}" min="1" />
      </div>
    </div>

    <div class="settings-card">
      <h3>⏱️ Таймеры (секунд)</h3>
      <div class="form-group">
        <label>Время ожидания игроков</label>
        <input type="number" class="form-input" id="s_waitTime" value="${s.waitTime}" min="5" />
      </div>
      <div class="form-group">
        <label>Задержка до начала игры</label>
        <input type="number" class="form-input" id="s_startDelay" value="${s.startDelay}" min="1" />
      </div>
    </div>

    <div class="settings-card">
      <h3>🔧 Прочее</h3>
      <div class="toggle-row">
        <span>Регистрация включена</span>
        <label class="toggle-switch">
          <input type="checkbox" id="s_registrationEnabled" ${s.registrationEnabled ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="toggle-row">
        <span>Игры включены</span>
        <label class="toggle-switch">
          <input type="checkbox" id="s_gamesEnabled" ${s.gamesEnabled ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
}

function saveSettings() {
  const s = {
    minBet:               parseInt(document.getElementById('s_minBet').value) || DEFAULT_SETTINGS.minBet,
    maxBet:               parseInt(document.getElementById('s_maxBet').value) || DEFAULT_SETTINGS.maxBet,
    betLimit:             parseInt(document.getElementById('s_betLimit').value) || DEFAULT_SETTINGS.betLimit,
    commission:           parseFloat(document.getElementById('s_commission').value) || 0,
    withdrawCommission:   parseFloat(document.getElementById('s_withdrawCommission').value) || 0,
    depositCommission:    parseFloat(document.getElementById('s_depositCommission').value) || 0,
    mdlToCoins:           parseInt(document.getElementById('s_mdlToCoins').value) || DEFAULT_SETTINGS.mdlToCoins,
    mdlToTickets:         parseInt(document.getElementById('s_mdlToTickets').value) || DEFAULT_SETTINGS.mdlToTickets,
    waitTime:             parseInt(document.getElementById('s_waitTime').value) || DEFAULT_SETTINGS.waitTime,
    startDelay:           parseInt(document.getElementById('s_startDelay').value) || DEFAULT_SETTINGS.startDelay,
    registrationEnabled:  document.getElementById('s_registrationEnabled').checked,
    gamesEnabled:         document.getElementById('s_gamesEnabled').checked
  };

  if (s.minBet >= s.maxBet) { showToast('Минимальная ставка должна быть меньше максимальной', 'error'); return; }
  if (s.commission > 50)    { showToast('Комиссия не может превышать 50%', 'error'); return; }

  ls.set(K.SETTINGS, s);
  addAdminLog('system', 'Настройки системы обновлены');
  showToast('Настройки сохранены', 'success');
}

// ═══════════════════════════════════════════════════
// ── PROMO CODES ──────────────────────────────────
// ═══════════════════════════════════════════════════
function renderPromosTable() {
  const search       = (document.getElementById('promoSearch').value || '').toLowerCase();
  const statusFilter = document.getElementById('promoStatusFilter').value;
  const typeFilter   = document.getElementById('promoTypeFilter').value;

  let list = ls.get(K.PROMOS, []);
  if (search)       list = list.filter(p => p.code.toLowerCase().includes(search));
  if (statusFilter) list = list.filter(p => {
    const active = p.active && (!p.expiry || new Date(p.expiry).getTime() > Date.now()) && (!p.limit || p.uses < p.limit);
    return statusFilter === 'active' ? active : !active;
  });
  if (typeFilter)   list = list.filter(p => p.type === typeFilter);

  list = list.sort((a, b) => (b.createdAt||0) - (a.createdAt||0));

  const total = list.length;
  const p = pages.promos;
  const slice = list.slice((p-1)*PAGE_SIZE, p*PAGE_SIZE);

  const tbody = document.getElementById('promosTableBody');
  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🎟️</div><p>Промокодов нет</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map(pr => {
      const isActive = pr.active && (!pr.expiry || new Date(pr.expiry).getTime() > Date.now()) && (!pr.limit || pr.uses < pr.limit);
      const statusBadge = isActive ? '<span class="badge badge-green">Активен</span>' : '<span class="badge badge-gray">Неактивен</span>';
      return `
        <tr>
          <td><strong>${escHtml(pr.code)}</strong></td>
          <td>${pr.type === 'coins' ? '💰 Монеты' : '% Процент'}</td>
          <td class="text-accent font-bold">${pr.type === 'coins' ? formatCoins(pr.value) : pr.value + '%'}</td>
          <td>${pr.uses || 0}</td>
          <td>${pr.limit ? pr.limit : '∞'}</td>
          <td>${statusBadge}</td>
          <td class="text-muted">${pr.expiry ? formatDateShort(new Date(pr.expiry).getTime()) : '∞'}</td>
          <td>
            <div class="action-btns">
              <button class="btn btn-outline btn-sm" onclick="editPromo('${escHtml(pr.code)}')">✏️</button>
              <button class="btn btn-outline btn-sm" onclick="togglePromo('${escHtml(pr.code)}')">${isActive ? '⏸' : '▶️'}</button>
              <button class="btn btn-danger btn-sm" onclick="deletePromo('${escHtml(pr.code)}')">🗑</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  renderPagination('promosPagination', total, p, (newP) => { pages.promos = newP; renderPromosTable(); });
}

function openPromoModal() {
  _editingPromoCode = null;
  document.getElementById('promoModalTitle').textContent = '🎟️ Создать промокод';
  document.getElementById('promoSubmitBtn').textContent = 'Создать';
  document.getElementById('promoCode').value = '';
  document.getElementById('promoType').value = 'coins';
  document.getElementById('promoValue').value = '';
  document.getElementById('promoLimit').value = '0';
  document.getElementById('promoExpiry').value = '';
  document.getElementById('promoMinBet').value = '0';
  openModal('promoModal');
}

function editPromo(code) {
  const promos = ls.get(K.PROMOS, []);
  const pr = promos.find(p => p.code === code);
  if (!pr) return;
  _editingPromoCode = code;
  document.getElementById('promoModalTitle').textContent = '✏️ Редактировать промокод';
  document.getElementById('promoSubmitBtn').textContent = 'Сохранить';
  document.getElementById('promoCode').value = pr.code;
  document.getElementById('promoType').value = pr.type;
  document.getElementById('promoValue').value = pr.value;
  document.getElementById('promoLimit').value = pr.limit || 0;
  document.getElementById('promoExpiry').value = pr.expiry || '';
  document.getElementById('promoMinBet').value = pr.minBet || 0;
  openModal('promoModal');
}

function genPromoCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('promoCode').value = code;
}

function submitPromo() {
  const code   = document.getElementById('promoCode').value.trim().toUpperCase();
  const type   = document.getElementById('promoType').value;
  const value  = parseInt(document.getElementById('promoValue').value);
  const limit  = parseInt(document.getElementById('promoLimit').value) || 0;
  const expiry = document.getElementById('promoExpiry').value;
  const minBet = parseInt(document.getElementById('promoMinBet').value) || 0;

  if (!code) { showToast('Введите код', 'error'); return; }
  if (!value || value < 1) { showToast('Введите значение', 'error'); return; }
  if (!/^[A-Z0-9_-]{2,20}$/.test(code)) { showToast('Код может содержать только буквы A-Z, цифры, _ и -', 'error'); return; }

  const promos = ls.get(K.PROMOS, []);
  const existing = promos.find(p => p.code === code);

  if (_editingPromoCode) {
    const idx = promos.findIndex(p => p.code === _editingPromoCode);
    if (idx < 0) return;
    promos[idx] = { ...promos[idx], code, type, value, limit, expiry: expiry || null, minBet };
    addAdminLog('system', `Промокод ${code} обновлён`);
    showToast('Промокод обновлён', 'success');
  } else {
    if (existing) { showToast('Промокод с таким кодом уже существует', 'error'); return; }
    promos.unshift({ code, type, value, limit, expiry: expiry || null, minBet, uses: 0, active: true, createdAt: Date.now() });
    addAdminLog('system', `Создан промокод ${code} (${type}: ${value})`);
    showToast('Промокод создан', 'success');
  }

  ls.set(K.PROMOS, promos);
  closeModal('promoModal');
  renderPromosTable();
}

function togglePromo(code) {
  const promos = ls.get(K.PROMOS, []);
  const idx = promos.findIndex(p => p.code === code);
  if (idx < 0) return;
  promos[idx].active = !promos[idx].active;
  ls.set(K.PROMOS, promos);
  addAdminLog('system', `Промокод ${code} ${promos[idx].active ? 'активирован' : 'деактивирован'}`);
  showToast(`Промокод ${promos[idx].active ? 'активирован' : 'деактивирован'}`, 'success');
  renderPromosTable();
}

function deletePromo(code) {
  confirmAction('🗑 Удалить промокод', `Удалить промокод "${code}"?`, () => {
    const promos = ls.get(K.PROMOS, []).filter(p => p.code !== code);
    ls.set(K.PROMOS, promos);
    addAdminLog('system', `Промокод ${code} удалён`);
    showToast('Промокод удалён', 'success');
    renderPromosTable();
  });
}

// ═══════════════════════════════════════════════════
// ── PAGINATION ───────────────────────────────────
// ═══════════════════════════════════════════════════
function renderPagination(containerId, total, current, onPageChange) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const el = document.getElementById(containerId);
  const from = (current - 1) * PAGE_SIZE + 1;
  const to   = Math.min(current * PAGE_SIZE, total);

  el.innerHTML = `
    <span>Показано ${total > 0 ? from : 0}–${to} из ${total}</span>
    <div class="pagination-btns">
      <button class="page-btn" onclick="(${onPageChange.toString()})(${current - 1})" ${current <= 1 ? 'disabled' : ''}>‹</button>
      ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
        let pg;
        if (totalPages <= 7) { pg = i + 1; }
        else if (current <= 4) { pg = i + 1; }
        else if (current >= totalPages - 3) { pg = totalPages - 6 + i; }
        else { pg = current - 3 + i; }
        pg = Math.max(1, Math.min(totalPages, pg));
        return `<button class="page-btn ${pg === current ? 'active' : ''}" onclick="(${onPageChange.toString()})(${pg})">${pg}</button>`;
      }).join('')}
      <button class="page-btn" onclick="(${onPageChange.toString()})(${current + 1})" ${current >= totalPages ? 'disabled' : ''}>›</button>
    </div>
  `;
}
