/**
 * check-db.js – Quick database inspection utility
 *
 * Usage:
 *   node check-db.js
 *
 * Prints all users currently stored in the SQLite database.
 * A non-empty list confirms that registration / login is correctly
 * writing to the server database rather than localStorage only.
 */

require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server/database.sqlite');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Could not open database:', err.message);
    console.error('   Make sure the server has been started at least once to create the database.');
    process.exit(1);
  }
});

db.all(
  'SELECT id, username, email, balance, status, created_at FROM users ORDER BY id',
  [],
  (err, rows) => {
    if (err) {
      console.error('❌ Query failed:', err.message);
      db.close();
      process.exit(1);
    }

    if (!rows || rows.length === 0) {
      console.log('⚠️  Пользователи в БД: [] (пусто)');
      console.log('   Register via http://localhost:3000/register.html to add users.');
    } else {
      console.log(`✅ Пользователи в БД (${rows.length}):`);
      rows.forEach(u => {
        console.log(
          `   [${u.id}] ${u.username} | balance: ${u.balance} | status: ${u.status} | created: ${u.created_at}`
        );
      });
    }

    db.close();
  }
);
