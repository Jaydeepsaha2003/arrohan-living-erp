'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { db, DB_PATH } = require('./db');
const { seed, LOGINS_FILE } = require('./seed');
const a = require('./auth');
const wf = require('./workflow');

const PORT = Number(process.env.PORT) || 4180;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Create tables and department logins on first boot.
const createdUsers = seed({ quiet: true });

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
app.use(a.attachUser);

// ------------------------------------------------------------------- api routes

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'Arrohan Living ERP',
    version: require('../package.json').version,
    database: path.basename(DB_PATH),
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

// ------------------------------------------------------------------------- boot

const server = app.listen(PORT, HOST, () => {
  const banner = [];
  banner.push('');
  banner.push('  ARROHAN LIVING ERP');
  banner.push('  ' + '─'.repeat(52));
  banner.push(`  Local        http://localhost:${PORT}`);
  for (const ip of lanAddresses()) banner.push(`  On your LAN  http://${ip}:${PORT}`);
  banner.push(`  Database     ${DB_PATH}`);
  banner.push(`  Workflow     ${wf.STAGE_KEYS.length} stages, ${wf.ROLE_KEYS.length} roles`);
  banner.push('');
  if (createdUsers.length) {
    banner.push('  First run — these logins were created:');
    banner.push('');
    const w = Math.max(...createdUsers.map((u) => u.username.length));
    for (const u of createdUsers) banner.push(`    ${u.username.padEnd(w)}   ${u.password}`);
    banner.push('');
    banner.push(`  Saved to ${LOGINS_FILE}`);
    banner.push('  Every account is asked to choose its own password at first sign-in.');
    banner.push('');
  }
  console.log(banner.join('\n'));
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

function shutdown(signal) {
  console.log(`\n${signal} received — closing down.`);
  server.close(() => {
    try {
      db.close();
    } catch {}
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
