'use strict';

/**
 * Checks whether TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are set and reachable,
 * and prints the exact commands to create them if not. Doesn't create
 * anything itself — the Turso CLI needs an interactive browser login, which
 * can't be scripted here.
 *
 *   node scripts/turso-setup.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

const GUIDE = `
Turso hosts SQLite for you — same engine, same SQL, reachable from Vercel.
The free tier (500 databases, 9 GB, 1 billion row reads/month) covers this
comfortably. Three commands, about two minutes:

  1. Install the CLI and sign in (opens your browser once):

       curl -sSfL https://get.tur.so/install.sh | bash
       turso auth login

  2. Create the database (pick a region close to your users, e.g. sin/bom):

       turso db create arrohan-erp --location bom

  3. Get the URL and an auth token:

       turso db show arrohan-erp --url
       turso db tokens create arrohan-erp

Set both as environment variables — locally in a .env file (git-ignored) and
on Vercel under Project Settings -> Environment Variables:

  TURSO_DATABASE_URL=libsql://arrohan-erp-<your-org>.turso.io
  TURSO_AUTH_TOKEN=<the long token from step 3>

Then redeploy. The app creates its tables and department logins automatically
on first request — check the Vercel function logs for the generated passwords,
since there is no writable disk to save data/FIRST-RUN-LOGINS.txt to.

Windows without curl/bash? Use WSL, or download the CLI release directly from
https://github.com/tursodatabase/turso-cli/releases and add it to PATH.
`;

(async () => {
  if (!url) {
    console.log(GUIDE);
    return;
  }

  console.log(`TURSO_DATABASE_URL is set: ${maskUrl(url)}`);
  if (!token) console.log('TURSO_AUTH_TOKEN is NOT set — Turso will likely reject the connection.\n');

  try {
    const client = createClient({ url, authToken: token || undefined });
    const r = await client.execute('SELECT sqlite_version() AS v');
    console.log(`Connected OK. Remote SQLite version: ${r.rows[0].v}`);
    const tables = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    console.log(
      tables.rows.length
        ? `${tables.rows.length} table(s) already exist — this database has been used before.`
        : 'No tables yet — the app will create them on first request.'
    );
    client.close();
  } catch (e) {
    console.error(`\nCould not connect: ${e.message}\n`);
    console.log(GUIDE);
    process.exitCode = 1;
  }
})();

function maskUrl(u) {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '(unparseable URL)';
  }
}
