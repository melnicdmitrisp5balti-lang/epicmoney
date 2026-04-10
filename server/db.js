const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open SQLite database:', err.message);
    process.exit(1);
  }
  console.log('SQLite connected:', DB_PATH);
});

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      username          TEXT    UNIQUE NOT NULL,
      email             TEXT    UNIQUE,
      password          TEXT    NOT NULL,
      balance           REAL    NOT NULL DEFAULT 100,
      status            TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned')),
      games_played      INTEGER NOT NULL DEFAULT 0,
      games_won         INTEGER NOT NULL DEFAULT 0,
      total_winnings    REAL    NOT NULL DEFAULT 0,
      tutorial_attempts INTEGER NOT NULL DEFAULT 3,
      created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migrations for existing databases
  const migrations = [
    "ALTER TABLE users ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN games_won INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN total_winnings REAL NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN tutorial_attempts INTEGER NOT NULL DEFAULT 3"
  ];
  migrations.forEach(sql => db.run(sql, () => {}));

  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT    NOT NULL CHECK(type IN ('1vs1','jackpot','battle','fast')),
      player1_id   INTEGER,
      player2_id   INTEGER,
      player3_id   INTEGER,
      amounts      TEXT,
      winner_id    INTEGER,
      total_pot    REAL    NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','active','completed','cancelled')),
      created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
      completed_at DATETIME
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      game_id    INTEGER NOT NULL,
      amount     REAL    NOT NULL,
      result     TEXT    CHECK(result IN ('win','lose')),
      profit     REAL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(game_id) REFERENCES games(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      action      TEXT    NOT NULL,
      description TEXT,
      details     TEXT,
      created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT    UNIQUE NOT NULL,
      type        TEXT    NOT NULL CHECK(type IN ('coins','percent')),
      value       REAL    NOT NULL,
      limit_uses  INTEGER NOT NULL DEFAULT 1,
      used_count  INTEGER NOT NULL DEFAULT 0,
      expires_at  DATETIME,
      created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      type       TEXT    NOT NULL CHECK(type IN ('deposit','withdraw','bonus','loss')),
      amount     REAL    NOT NULL,
      reason     TEXT,
      admin_id   INTEGER,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    UNIQUE NOT NULL,
      password   TEXT    NOT NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Default admin seeding (only if table is empty)
  const bcrypt = require('bcryptjs');
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  db.get('SELECT COUNT(*) AS cnt FROM admin_users', (err, row) => {
    if (!err && row && row.cnt === 0) {
      bcrypt.hash(ADMIN_PASSWORD, 10, (err2, hash) => {
        if (!err2) {
          db.run(
            'INSERT INTO admin_users (username, password) VALUES (?, ?)',
            ['admin', hash],
            (e) => {
              if (!e) console.log('Default admin user created (username: admin)');
            }
          );
        }
      });
    }
  });
});

/**
 * Promisified helpers
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = { db, run, get, all };
