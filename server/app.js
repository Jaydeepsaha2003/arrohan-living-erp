'use strict';

/**
 * Builds the Express app. Shared by two entry points:
 *   server/index.js — standalone server (office PC, Render, Railway): listens
 *                      on a port once, after migrations have finished.
 *   api/index.js     — Vercel serverless function: no listen, and every cold
 *                      start needs its own migration check, guarded by `ready`.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const db = require('./db');
const { seed, LOGINS_FILE } = require('./seed');
const a = require('./auth');
const wf = require('./workflow');

const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // the built client is served from this origin only
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

/**
 * Migrate + seed exactly once per process. A serverless cold start and the
 * standalone server both await this before touching the database, so the
 * first request in either case never races table creation.
 */
let readyPromise = null;
let createdUsers = [];

function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      createdUsers = await seed({ quiet: true });
    })();
  }
  return readyPromise;
}

app.use((req, res, next) => {
  ready()
    .then(() => next())
    .catch(next);
});

app.use(a.attachUser);

// ------------------------------------------------------------------- api routes

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'Arrohan Living ERP',
    version: require('../package.json').version,
    database: db.describeDatabase(),
    remote: db.isRemote,
    stages: wf.STAGE_KEYS.length,
    signedIn: !!req.user,
  });
});

app.use('/api/auth', require('./routes/auth').router);
app.use('/api/users', require('./routes/users'));
app.use('/api/masters', require('./routes/masters'));
app.use('/api/enquiries', require('./routes/enquiries').router);
app.use('/api/orders', require('./routes/orders').router);
app.use('/api/purchase', require('./routes/purchase'));
app.use('/api/reports', require('./routes/reports').router);
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));

app.use('/api', (req, res) => res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` }));

// ---------------------------------------------------------------- static client

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));
  // Client-side routing: every non-API path returns the app shell.
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
} else {
  app.get('*', (req, res) =>
    res
      .status(503)
      .type('html')
      .send(
        `<pre style="font:14px ui-monospace,monospace;padding:32px;line-height:1.6">The web interface has not been built yet.

Run:

  npm run build

then restart with:

  npm start
</pre>`
      )
  );
}

// -------------------------------------------------------------- error handling

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'Something went wrong on the server.' });
});

module.exports = { app, ready, getCreatedUsers: () => createdUsers, LOGINS_FILE };
