'use strict';

/**
 * Deletes every transaction but keeps users, masters and settings.
 * Pass --all to wipe the database file completely (users included).
 * Only meaningful for a local file database — on a hosted Turso database,
 * use `turso db shell <name> "DELETE FROM ..."` or the Turso dashboard instead.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

const wipeAll = process.argv.includes('--all');

const TABLES = [
  'gate_passes', 'final_payments', 'invoices', 'dispatches', 'packing_lines', 'packings',
  'qc_items', 'qc_checks', 'additional_materials', 'production_wastage', 'production_consumption',
  'productions', 'store_issue_lines', 'store_issues', 'advances', 'payments', 'sales_orders',
  'approvals', 'quotations', 'planning_items', 'plannings', 'costing_bom', 'item_costings', 'costings',
  'finished_goods', 'order_notes', 'stage_history', 'orders', 'enquiry_items', 'enquiries',
  'purchase_order_items', 'purchase_orders', 'stock_ledger', 'audit_log', 'doc_counters',
];

(async () => {
  if (wipeAll) {
    if (db.isRemote) {
      console.error('Refusing to --all a hosted database from here — that would need dropping the Turso');
      console.error('database itself. Use: turso db destroy <name>   (or delete it from the dashboard).');
      process.exit(1);
    }
    await db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const f = db.DB_PATH + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    console.log(`Deleted ${path.basename(db.DB_PATH)}. The next start will recreate it with fresh department logins.`);
    process.exit(0);
  }

  await db.migrate();
  // TABLES is already listed child-first, so plain deletes respect every
  // foreign key without needing to disable them.
  await db.tx(async () => {
    for (const t of TABLES) await db.run(`DELETE FROM ${t}`);
    await db.run('UPDATE materials SET qty_in_stock = 0');
  });

  console.log('Cleared all transactions. Users, customers, suppliers, materials and settings were kept.');
  console.log('Material stock balances were reset to zero — re-enter opening stock if needed.');
  await db.close();
})().catch((e) => {
  console.error('Reset failed:', e.message);
  process.exit(1);
});
