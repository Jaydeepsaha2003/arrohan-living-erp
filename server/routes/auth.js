'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { db, audit, getSetting } = require('../db');
const a = require('../auth');
const wf = require('../workflow');
const { wrap, http, str } = require('../lib');

const router = express.Router();

/**
 * Brute-force guard. Only failed attempts count, so a shared office IP with a
 * dozen staff signing in each morning is never locked out — but repeated wrong
 * guesses against one address are.
 */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 25,
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts from this device. Please wait ten minutes and try again.' },
});

router.post(
  '/login',
  loginLimiter,
  wrap((req, res) => {
    const username = str(req.body.username);
    const password = String(req.body.password || '');
    if (!username || !password) throw http(400, 'Enter your username and password.');

    const user = a.findUserByUsername(username);
    if (!user || !a.verifyPassword(password, user.password_hash)) {
      audit({ user: null }, 'login.failed', 'user', null, { username });
      throw http(401, 'Incorrect username or password.');
    }
    if (!user.active) throw http(403, 'This account has been deactivated. Contact your administrator.');

    a.purgeExpiredSessions();
    const { token, expires } = a.createSession(user.id, req);
    db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
    a.setSessionCookie(res, token, expires);

    const fresh = db.prepare(a.SELECT_USER).get(user.id);
    audit({ user: fresh }, 'login', 'user', user.id, null);
    res.json({ user: shapeUser(fresh) });
  })
);

router.post(
  '/logout',
  wrap((req, res) => {
    if (req.user) audit(req, 'logout', 'user', req.user.id, null);
    a.destroySession(req.sessionToken);
    a.clearSessionCookie(res);
    res.json({ ok: true });
  })
);

/** Bootstrap payload: current user plus everything the UI needs to render. */
router.get(
  '/me',
  wrap((req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    res.json({
      user: shapeUser(req.user),
      company: getSetting('company'),
      meta: {
        stages: wf.STAGES.map((s) => ({
          key: s.key,
          step: s.step,
          label: s.label,
          short: s.short,
          dept: s.dept,
          desc: s.desc,
          roles: s.roles,
          docs: s.docs,
          canReject: !!s.canReject,
          mine: wf.canDoStage(req.user, s.key),
        })),
        roles: wf.ROLES,
        lostReasons: wf.LOST_REASONS,
        enquiryStageLabels: wf.ENQUIRY_STAGE_LABELS,
        paymentModes: wf.PAYMENT_MODES,
        units: wf.UNITS,
        myStages: wf.stagesForRole(req.user.role),
        capabilities: Object.fromEntries(
          Object.keys(wf.CAPABILITIES).map((c) => [c, wf.can(req.user, c)])
        ),
      },
    });
  })
);

router.post(
  '/change-password',
  a.requireAuth,
  wrap((req, res) => {
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');
    if (next.length < 6) throw http(400, 'New password must be at least 6 characters.');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!a.verifyPassword(current, row.password_hash)) throw http(400, 'Your current password is incorrect.');
    db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?').run(
      bcrypt.hashSync(next, 10),
      req.user.id
    );
    // Sign out every other device for this user.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(req.user.id, req.sessionToken);
    audit(req, 'password.change', 'user', req.user.id, null);
    res.json({ ok: true });
  })
);

function shapeUser(u) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    roleLabel: wf.ROLES[u.role] ? wf.ROLES[u.role].label : u.role,
    email: u.email,
    phone: u.phone,
    mustChangePassword: !!u.must_change_pw,
    lastLoginAt: u.last_login_at,
    isAdmin: u.role === 'admin',
    readOnly: u.role === 'management',
  };
}

module.exports = { router, shapeUser };
