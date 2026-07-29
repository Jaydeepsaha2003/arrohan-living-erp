'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const wf = require('./workflow');

const COOKIE = 'arrohan_sid';
const SESSION_DAYS = 7;

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

async function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.run(
    `INSERT INTO sessions (token, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)`,
    token,
    userId,
    expires,
    req.ip || null,
    (req.get('user-agent') || '').slice(0, 300)
  );
  return { token, expires };
}

async function destroySession(token) {
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', token);
}

async function purgeExpiredSessions() {
  await db.run(`DELETE FROM sessions WHERE expires_at < datetime('now')`);
}

const SELECT_USER = `SELECT id, username, full_name, role, email, phone, active, must_change_pw, last_login_at
                     FROM users WHERE id = ?`;

/** Populates req.user from the session cookie. Never rejects the request. */
async function attachUser(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE] : null;
  req.sessionToken = token || null;
  req.user = null;
  try {
    if (token) {
      const row = await db.get(
        `SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`,
        token
      );
      if (row) req.user = await db.get(SELECT_USER, row.id);
    }
    next();
  } catch (e) {
    next(e);
  }
}

function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    // Cookies must be Secure on a hosted HTTPS deployment, but a plain-HTTP
    // office LAN install would then never receive them.
    secure: !!process.env.VERCEL || process.env.COOKIE_SECURE === '1',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expires),
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// ------------------------------------------------------------- guard middleware

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

/** Blocks management (read-only) and anyone else from write verbs. */
function requireWrite(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  if (req.user.role === 'management') {
    return res.status(403).json({ error: 'Management accounts have read-only access.' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({
      error: `This action is restricted to: ${roles.map((r) => wf.ROLES[r]?.label || r).join(', ')}.`,
    });
  };
}

function requireCapability(capability) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
    if (wf.can(req.user, capability)) return next();
    return res.status(403).json({
      error: `Your role (${wf.ROLES[req.user.role]?.label || req.user.role}) cannot perform this action.`,
    });
  };
}

/** Guards a stage route: the user's role must own that stage. */
function requireStage(stageKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
    if (wf.canDoStage(req.user, stageKey)) return next();
    const stage = wf.STAGE_BY_KEY[stageKey];
    return res.status(403).json({
      error: `Only the ${stage ? stage.dept : stageKey} department can complete "${wf.stageLabel(stageKey)}".`,
    });
  };
}

// ------------------------------------------------------------------ user admin

function findUserByUsername(username) {
  return db.get('SELECT * FROM users WHERE lower(username) = lower(?)', String(username || '').trim());
}

async function createUser({ username, full_name, password, role, email, phone, must_change_pw }, createdBy) {
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(uname)) {
    throw httpError(400, 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore.');
  }
  if (!full_name || !String(full_name).trim()) throw httpError(400, 'Full name is required.');
  if (!password || String(password).length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  if (!wf.ROLE_KEYS.includes(role)) throw httpError(400, 'Unknown role.');
  if (await findUserByUsername(uname)) throw httpError(409, `Username "${uname}" is already taken.`);

  const info = await db.run(
    `INSERT INTO users (username, full_name, password_hash, role, email, phone, must_change_pw, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    uname,
    String(full_name).trim(),
    hashPassword(String(password)),
    role,
    email || null,
    phone || null,
    must_change_pw ? 1 : 0,
    createdBy || null
  );
  return db.get(SELECT_USER, info.lastInsertRowid);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  COOKIE,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  purgeExpiredSessions,
  attachUser,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireWrite,
  requireRole,
  requireCapability,
  requireStage,
  findUserByUsername,
  createUser,
  httpError,
  SELECT_USER,
};
