'use strict';

/**
 * Standalone entry point — the office PC, Render, Railway, or any host that
 * keeps one long-lived process and a persistent disk. Not used on Vercel;
 * see api/index.js for the serverless entry.
 */

const os = require('os');
const db = require('./db');
const wf = require('./workflow');
const { app, ready, getCreatedUsers, LOGINS_FILE } = require('./app');

const PORT = Number(process.env.PORT) || 4180;
const HOST = process.env.HOST || '0.0.0.0';

(async () => {
  await ready();
  const createdUsers = getCreatedUsers();

  const server = app.listen(PORT, HOST, () => {
    const banner = [];
    banner.push('');
    banner.push('  ARROHAN LIVING ERP');
    banner.push('  ' + '─'.repeat(52));
    banner.push(`  Local        http://localhost:${PORT}`);
    for (const ip of lanAddresses()) banner.push(`  On your LAN  http://${ip}:${PORT}`);
    banner.push(`  Database     ${db.describeDatabase()}`);
    banner.push(`  Workflow     ${wf.STAGE_KEYS.length} stages, ${wf.ROLE_KEYS.length} roles`);
    banner.push('');
    if (createdUsers.length) {
      banner.push('  First run — these logins were created:');
      banner.push('');
      const w = Math.max(...createdUsers.map((u) => u.username.length));
      for (const u of createdUsers) banner.push(`    ${u.username.padEnd(w)}   ${u.password}`);
      banner.push('');
      if (LOGINS_FILE) banner.push(`  Saved to ${LOGINS_FILE}`);
      banner.push('  Every account is asked to choose its own password at first sign-in.');
      banner.push('');
    }
    console.log(banner.join('\n'));
  });

  function shutdown(signal) {
    console.log(`\n${signal} received — closing down.`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})().catch((e) => {
  console.error('Failed to start:', e);
  process.exit(1);
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

module.exports = app;
