'use strict';

/**
 * Recovery tool for a forgotten password. Run it on the machine that hosts the
 * ERP — it edits the database directly, so it works even when nobody can sign
 * in. Only someone with access to the server can use it.
 *
 *   node scripts/reset-password.js                     list every account
 *   node scripts/reset-password.js admin NewPass123    set a password
 *   node scripts/reset-password.js admin NewPass123 --keep-sessions
 */

const bcrypt = require('bcryptjs');
const { db, migrate } = require('../server/db');

migrate();

const [username, password, ...flags] = process.argv.slice(2);

if (!username) {
  const users = db
    .prepare(
      `SELECT username, full_name, role, active, must_change_pw, last_login_at FROM users ORDER BY active DESC, role, username`
    )
    .all();

  if (!users.length) {
    console.log('\nNo users exist yet. Start the server once and they will be created.\n');
    process.exit(0);
  }

  const w = Math.max(8, ...users.map((u) => u.username.length));
  console.log('\nAccounts in this database:\n');
  console.log(`  ${'USERNAME'.padEnd(w)}  ${'ROLE'.padEnd(11)}  STATUS      NAME`);
  console.log(`  ${'-'.repeat(w)}  ${'-'.repeat(11)}  ----------  ----`);
  for (const u of users) {
    const status = !u.active ? 'disabled' : u.must_change_pw ? 'default pw' : 'active';
    console.log(`  ${u.username.padEnd(w)}  ${u.role.padEnd(11)}  ${status.padEnd(10)}  ${u.full_name}`);
  }
  console.log('\nTo set a password:\n  node scripts/reset-password.js <username> <new-password>\n');
  process.exit(0);
}

const user = db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(String(username).trim());
if (!user) {
  console.error(`\nNo account called "${username}". Run the script with no arguments to list them.\n`);
  process.exit(1);
}

if (!password) {
  console.error('\nGive the new password as the second argument:\n  node scripts/reset-password.js ' + user.username + ' <new-password>\n');
  process.exit(1);
}

if (String(password).length < 6) {
  console.error('\nThe password must be at least 6 characters.\n');
  process.exit(1);
}

db.prepare('UPDATE users SET password_hash = ?, active = 1, must_change_pw = 0 WHERE id = ?').run(
  bcrypt.hashSync(String(password), 10),
  user.id
);

let signedOut = 0;
if (!flags.includes('--keep-sessions')) {
  signedOut = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id).changes;
}

db.prepare(
  `INSERT INTO audit_log (username, action, entity, entity_id, detail)
   VALUES (?, 'password.reset.cli', 'user', ?, 'Reset from the server command line')`
).run(user.username, String(user.id));

console.log(`\nPassword updated for "${user.username}" (${user.role}).`);
if (!user.active) console.log('The account was disabled and has been reactivated.');
if (signedOut) console.log(`Signed out of ${signedOut} existing session(s).`);
console.log('\nSign in at the ERP with the new password.\n');
