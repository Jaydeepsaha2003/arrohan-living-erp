'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.ARROHAN_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.ARROHAN_DB || path.join(DATA_DIR, 'arrohan.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

// WAL keeps readers unblocked while one user writes — important for a shared LAN install.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

/** Run fn inside a transaction; returns fn's result. */
function tx(fn) {
  return db.transaction(fn)();
}

/**
 * Reserve the next number for a document prefix within the current Indian
 * financial year (1 Apr – 31 Mar). Returns e.g. "QT/25-26/0007".
 */
function nextDocNo(prefix, opts = {}) {
  const fy = financialYear(opts.date);
  db.prepare(
    `INSERT INTO doc_counters (prefix, fy, last_no) VALUES (?, ?, 0)
     ON CONFLICT(prefix, fy) DO NOTHING`
  ).run(prefix, fy);
  const row = db
    .prepare(`UPDATE doc_counters SET last_no = last_no + 1 WHERE prefix = ? AND fy = ? RETURNING last_no`)
    .get(prefix, fy);
  const pad = opts.pad ?? 4;
  return `${prefix}/${fy}/${String(row.last_no).padStart(pad, '0')}`;
}

function financialYear(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // month 3 === April
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, JSON.stringify(value));
}

function audit(req, action, entity, entityId, detail) {
  const user = req && req.user;
  db.prepare(
    `INSERT INTO audit_log (user_id, username, action, entity, entity_id, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    user ? user.id : null,
    user ? user.username : null,
    action,
    entity || null,
    entityId != null ? String(entityId) : null,
    detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null
  );
}

module.exports = { db, DB_PATH, DATA_DIR, migrate, tx, nextDocNo, financialYear, getSetting, setSetting, audit };
