'use strict';

/**
 * Seeds the company profile, workflow defaults and one login per department.
 * Safe to re-run: existing users and settings are left alone.
 *
 * Company details come from config/company.json, which is git-ignored — copy
 * config/company.example.json and fill in your own. Everything can also be
 * edited later in the app under Settings.
 *
 * Passwords are generated at random, one per account. On a local install they
 * are written to data/FIRST-RUN-LOGINS.txt so nothing sensitive lives in this
 * repository; on a serverless deployment (no writable disk) they are only
 * printed to the function log instead. Set ARROHAN_SEED_PASSWORD to use one
 * known password for every account (handy for development and for tests).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { hashPassword, findUserByUsername } = require('./auth');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const LOGINS_FILE = db.isRemote ? null : path.join(db.DATA_DIR, 'FIRST-RUN-LOGINS.txt');

const FALLBACK_COMPANY = {
  name: 'YOUR COMPANY NAME PVT LTD',
  address: '',
  city: '',
  state: '',
  pincode: '',
  mobile: '',
  email: '',
  gstin: '',
  pan: '',
  bankName: '',
  bankAccount: '',
  bankIfsc: '',
  website: '',
};

const DEFAULTS = {
  gstRate: 18,
  marginPercent: 20,
  wastagePercent: 5,
  productionDays: 10,
  quotationValidityDays: 15,
  advancePercent: 50,
  paymentTerms: '50% advance, 50% before dispatch',
  quotationTerms:
    'Prices are ex-works unless stated otherwise. Delivery timeline starts from the date of advance receipt. Taxes as applicable.',
  warranty: '12 months against manufacturing defects.',
};

// One account per department, matching the workflow in the requirement document.
const USERS = [
  { username: 'admin', full_name: 'System Administrator', role: 'admin' },
  { username: 'director', full_name: 'Management', role: 'management' },
  { username: 'sales', full_name: 'Sales Department', role: 'sales' },
  { username: 'costing', full_name: 'Factory Costing', role: 'costing' },
  { username: 'store', full_name: 'Store Department', role: 'store' },
  { username: 'production', full_name: 'Production Department', role: 'production' },
  { username: 'qc', full_name: 'Quality Control', role: 'qc' },
  { username: 'packing', full_name: 'Packaging Department', role: 'packaging' },
  { username: 'dispatch', full_name: 'Dispatch Department', role: 'dispatch' },
  { username: 'accounts', full_name: 'Accounts Department', role: 'accounts' },
];

function loadCompany() {
  for (const file of ['company.json', 'company.example.json']) {
    const p = path.join(CONFIG_DIR, file);
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      delete parsed._comment;
      return { ...FALLBACK_COMPANY, ...parsed };
    } catch (e) {
      console.warn(`[seed] Could not read config/${file}: ${e.message}`);
    }
  }
  return { ...FALLBACK_COMPANY };
}

/**
 * Readable but unguessable: two short words plus four digits, e.g. "brisk-lake-4827".
 * Easy to read out to a colleague once, hard to brute force.
 */
const WORDS = [
  'amber', 'brisk', 'cedar', 'delta', 'ember', 'flint', 'grove', 'harbor',
  'ivory', 'jasper', 'kite', 'lake', 'maple', 'north', 'onyx', 'pearl',
  'quartz', 'river', 'slate', 'timber', 'umber', 'vault', 'willow', 'zephyr',
];

function generatePassword() {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  let a = pick();
  let b = pick();
  while (b === a) b = pick();
  return `${a}-${b}-${crypto.randomInt(1000, 10000)}`;
}

async function seed({ quiet = false } = {}) {
  await db.migrate();

  if (!(await db.getSetting('company'))) await db.setSetting('company', loadCompany());
  if (!(await db.getSetting('defaults'))) await db.setSetting('defaults', DEFAULTS);

  const shared = process.env.ARROHAN_SEED_PASSWORD || null;
  const created = [];

  for (const u of USERS) {
    if (await findUserByUsername(u.username)) continue;
    const password = shared || generatePassword();
    await db.run(
      `INSERT INTO users (username, full_name, password_hash, role, must_change_pw) VALUES (?, ?, ?, ?, 1)`,
      u.username, u.full_name, hashPassword(password), u.role
    );
    created.push({ ...u, password });
  }

  if (created.length && !shared && LOGINS_FILE) writeLoginsFile(created);

  if (!quiet) {
    if (created.length) {
      console.log('\nCreated the following logins:\n');
      const w = Math.max(...created.map((u) => u.username.length));
      for (const u of created) {
        console.log(`  ${u.username.padEnd(w)}  ${u.password.padEnd(20)}  ${u.full_name}`);
      }
      if (LOGINS_FILE && !shared) console.log(`\nAlso saved to ${LOGINS_FILE}`);
      else if (!shared) console.log('\nThis is a hosted database with no writable disk — copy these now, they are not saved anywhere.');
      console.log('Each account is asked to choose its own password at first sign-in.\n');
    } else {
      console.log('All department logins already exist — nothing to seed.');
    }
  }

  return created;
}

function writeLoginsFile(created) {
  const w = Math.max(...created.map((u) => u.username.length));
  const lines = [
    'ARROHAN LIVING ERP — first-run logins',
    '='.repeat(52),
    '',
    'These passwords were generated when the database was created.',
    'Give each department its own line, and ask everyone to change their',
    'password at first sign-in (the app prompts them automatically).',
    '',
    'Delete this file once everyone has signed in and changed their password.',
    'Forgotten a password later?  npm run reset-password',
    '',
    '='.repeat(52),
    '',
  ];
  for (const u of created) {
    lines.push(`  ${u.username.padEnd(w)}   ${u.password.padEnd(20)}   ${u.full_name}`);
  }
  lines.push('');
  try {
    fs.writeFileSync(LOGINS_FILE, lines.join('\n'), 'utf8');
  } catch (e) {
    console.warn(`[seed] Could not write ${LOGINS_FILE}: ${e.message}`);
  }
}

if (require.main === module) {
  seed().then(() => console.log('Seed complete.'));
}

module.exports = { seed, loadCompany, DEFAULTS, USERS, LOGINS_FILE };
