'use strict';

/**
 * Database layer — libSQL, which is SQLite.
 *
 * Same engine, same SQL dialect, same file format. The only difference from the
 * embedded better-sqlite3 driver is that every call is asynchronous, because the
 * same client can talk to either a local file or a hosted Turso database over
 * the network.
 *
 *   Local / on-premise :  file:./data/arrohan.db   (default, nothing to set up)
 *   Vercel / hosted    :  TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 *
 * A hosted database is what makes serverless hosting possible at all: Vercel's
 * filesystem is wiped between invocations, so a local .db file there would lose
 * every record.
 */

const fs = require('fs');
const path = require('path');

// Loads a .env file in the project root if one exists — local convenience only.
// Vercel injects its own environment variables directly and has no .env file
// to load, so this is a no-op there (and dotenv silently does nothing if the
// file is missing, so it's safe to always call).
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { createClient } = require('@libsql/client');

const DATA_DIR = process.env.ARROHAN_DATA_DIR || path.join(__dirname, '..', 'data');
const REMOTE_URL = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || null;
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || null;

let DB_PATH = null;
let client;

if (REMOTE_URL) {
  client = createClient({ url: REMOTE_URL, authToken: AUTH_TOKEN || undefined });
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  DB_PATH = process.env.ARROHAN_DB || path.join(DATA_DIR, 'arrohan.db');
  client = createClient({ url: `file:${DB_PATH.replace(/\\/g, '/')}` });
}

const isRemote = !!REMOTE_URL;

/** Where the data lives, for the startup banner and the docs. */
function describeDatabase() {
  if (!isRemote) return DB_PATH;
  try {
    const u = new URL(REMOTE_URL);
    return `${u.protocol}//${u.host} (hosted)`;
  } catch {
    return 'hosted database';
  }
}

// ------------------------------------------------------------------ primitives

/**
 * libSQL returns INTEGER columns as BigInt when they exceed the safe range, and
 * always returns lastInsertRowid as BigInt. Neither survives JSON.stringify, so
 * normalise on the way out.
 */
function normalise(value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

function normaliseRow(row) {
  if (!row) return row;
  const out = {};
  for (const k of Object.keys(row)) out[k] = normalise(row[k]);
  return out;
}

function args(params) {
  // undefined is not a valid bound value; treat it as SQL NULL.
  return params.map((p) => (p === undefined ? null : typeof p === 'bigint' ? Number(p) : p));
}

/** Every row. */
async function all(sql, ...params) {
  const res = await exec_(sql, params);
  return res.rows.map(normaliseRow);
}

/** First row, or undefined. */
async function get(sql, ...params) {
  const res = await exec_(sql, params);
  return res.rows.length ? normaliseRow(res.rows[0]) : undefined;
}

/** Write. Returns { changes, lastInsertRowid } to match the old call sites. */
async function run(sql, ...params) {
  const res = await exec_(sql, params);
  return {
    changes: Number(res.rowsAffected || 0),
    lastInsertRowid: normalise(res.lastInsertRowid),
  };
}

async function exec_(sql, params) {
  const target = current() || client;
  return params.length ? target.execute({ sql, args: args(params) }) : target.execute(sql);
}

/** Run a whole .sql file (many statements, comments allowed). */
async function execMultiple(sqlText) {
  await (current() || client).executeMultiple(sqlText);
}

// --------------------------------------------------------------- transactions

/**
 * Async-local transaction handle, so `all`/`get`/`run` inside tx() automatically
 * use the transaction without every helper having to thread it through.
 */
const { AsyncLocalStorage } = require('node:async_hooks');
const txStore = new AsyncLocalStorage();

function current() {
  return txStore.getStore() || null;
}

/**
 * Run fn inside one transaction. Commits on success, rolls back on any throw.
 * Nested calls join the outer transaction rather than starting a second one.
 */
async function tx(fn) {
  if (current()) return fn(); // already inside a transaction — join it

  const handle = await client.transaction('write');
  try {
    const out = await txStore.run(handle, fn);
    await handle.commit();
    return out;
  } catch (e) {
    try {
      await handle.rollback();
    } catch {
      /* the transaction may already be closed */
    }
    throw e;
  }
}

// ---------------------------------------------------------------- migrations

let migrated = false;

/**
 * Create tables and indexes. Idempotent, but on serverless we only want it once
 * per process rather than on every request.
 */
async function migrate({ force = false } = {}) {
  if (migrated && !force) return;
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await execMultiple(schema);
  migrated = true;
}

async function ensureForeignKeys() {
  // A file database needs this per connection; Turso enables it by default.
  if (!isRemote) await client.execute('PRAGMA foreign_keys = ON');
}

// ------------------------------------------------------- document numbering

/**
 * Reserve the next number for a document prefix within the current Indian
 * financial year (1 Apr – 31 Mar). Returns e.g. "QT/25-26/0007".
 *
 * The UPDATE ... RETURNING is atomic, so two people saving at the same instant
 * can never be handed the same number.
 */
async function nextDocNo(prefix, opts = {}) {
  const fy = financialYear(opts.date);
  await run(
    `INSERT INTO doc_counters (prefix, fy, last_no) VALUES (?, ?, 0)
     ON CONFLICT(prefix, fy) DO NOTHING`,
    prefix,
    fy
  );
  const row = await get(
    `UPDATE doc_counters SET last_no = last_no + 1 WHERE prefix = ? AND fy = ? RETURNING last_no`,
    prefix,
    fy
  );
  const pad = opts.pad ?? 4;
  return `${prefix}/${fy}/${String(row.last_no).padStart(pad, '0')}`;
}

function financialYear(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // month 3 === April
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

// ------------------------------------------------------------------ settings

async function getSetting(key, fallback = null) {
  const row = await get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

async function setSetting(key, value) {
  await run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    JSON.stringify(value)
  );
}

// --------------------------------------------------------------------- audit

/**
 * Best-effort audit entry. A failure here must never break the user's action,
 * so it is logged and swallowed.
 */
async function audit(req, action, entity, entityId, detail) {
  const user = req && req.user;
  try {
    await run(
      `INSERT INTO audit_log (user_id, username, action, entity, entity_id, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      user ? user.id : null,
      user ? user.username : null,
      action,
      entity || null,
      entityId != null ? String(entityId) : null,
      detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)) : null
    );
  } catch (e) {
    console.warn('[audit] could not record', action, '-', e.message);
  }
}

async function close() {
  try {
    client.close();
  } catch {
    /* already closed */
  }
}

module.exports = {
  client,
  isRemote,
  DB_PATH,
  DATA_DIR,
  describeDatabase,
  all,
  get,
  run,
  execMultiple,
  tx,
  migrate,
  ensureForeignKeys,
  nextDocNo,
  financialYear,
  getSetting,
  setSetting,
  audit,
  close,
};
