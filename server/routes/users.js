'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { db, audit } = require('../db');
const a = require('../auth');
const wf = require('../workflow');
const { wrap, http, str } = require('../lib');
const { shapeUser } = require('./auth');

const router = express.Router();

// Everything here is administrator-only.
router.use(a.requireAuth, (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only an administrator can manage users.' });
  }
  next();
});

router.get(
  '/',
  wrap((req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.full_name, u.role, u.email, u.phone, u.active,
                u.must_change_pw, u.last_login_at, u.created_at,
                (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > datetime('now')) AS active_sessions
         FROM users u ORDER BY u.active DESC, u.role, u.username`
      )
      .all();
    res.json({
      users: rows.map((u) => ({
        ...shapeUser(u),
        active: !!u.active,
        createdAt: u.created_at,
        activeSessions: u.active_sessions,
      })),
      roles: wf.ROLES,
    });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const user = a.createUser(req.body, req.user.id);
    audit(req, 'user.create', 'user', user.id, { username: user.username, role: user.role });
    res.status(201).json({ user: shapeUser(user) });
  })
);

router.patch(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) throw http(404, 'User not found.');

    const sets = [];
    const vals = [];

    if (req.body.full_name !== undefined) {
      const v = str(req.body.full_name);
      if (!v) throw http(400, 'Full name cannot be empty.');
      sets.push('full_name = ?');
      vals.push(v);
    }
    if (req.body.role !== undefined) {
      if (!wf.ROLE_KEYS.includes(req.body.role)) throw http(400, 'Unknown role.');
      if (target.role === 'admin' && req.body.role !== 'admin' && countAdmins() <= 1) {
        throw http(400, 'You cannot change the role of the last administrator.');
      }
      sets.push('role = ?');
      vals.push(req.body.role);
    }
    if (req.body.email !== undefined) {
      sets.push('email = ?');
      vals.push(str(req.body.email));
    }
    if (req.body.phone !== undefined) {
      sets.push('phone = ?');
      vals.push(str(req.body.phone));
    }
    if (req.body.active !== undefined) {
      const active = req.body.active ? 1 : 0;
      if (!active) {
        if (target.id === req.user.id) throw http(400, 'You cannot deactivate your own account.');
        if (target.role === 'admin' && countAdmins() <= 1) {
          throw http(400, 'You cannot deactivate the last administrator.');
        }
      }
      sets.push('active = ?');
      vals.push(active);
      if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }

    if (sets.length) {
      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
      audit(req, 'user.update', 'user', id, req.body);
    }
    res.json({ user: shapeUser(db.prepare(a.SELECT_USER).get(id)) });
  })
);

router.post(
  '/:id/reset-password',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const pw = String(req.body.password || '');
    if (pw.length < 6) throw http(400, 'Password must be at least 6 characters.');
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!target) throw http(404, 'User not found.');
    db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?').run(
      bcrypt.hashSync(pw, 10),
      id
    );
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    audit(req, 'user.password.reset', 'user', id, null);
    res.json({ ok: true });
  })
);

router.get(
  '/audit',
  wrap((req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const rows = db
      .prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
      .all(limit);
    res.json({ entries: rows });
  })
);

function countAdmins() {
  return db.prepare(`SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1`).get().n;
}

module.exports = router;
