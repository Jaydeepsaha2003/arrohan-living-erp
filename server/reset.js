'use strict';

/**
 * Deletes every transaction but keeps users, masters and settings.
 * Pass --all to wipe the database file completely (users included).
 */

const fs = require('fs');
const path = require('path');
const { db, DB_PATH } = require('./db');

const wipeAll = process.argv.includes('--all');

if (wipeAll) {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    const f = DB_PATH + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log(`Deleted ${path.basename(DB_PATH)}. The next start will recreate it with fresh department logins.`);
  process.exit(0);
}

const TABLES = [
  'gate_passes', 'final_payments', 'invoices', 'dispatches', 'packing_lines', 'packings',
  'qc_items', 'qc_checks', 'additional_materials', 'production_wastage', 'production_consumption',
  'productions', 'store_issue_lines', 'store_issues', 'advances', 'payments', 'sales_orders',
  'approvals', 'quotations', 'planning_items', 'plannings', 'costing_bom', 'item_costings', 'costings',
  'finished_goods', 'order_notes', 'stage_history', 'orders', 'enquiry_items', 'enquiries',
  'purchase_order_items', 'purchase_orders', 'stock_ledger', 'audit_log', 'doc_counters',
];

db.transaction(() => {
  db.pragma('foreign_keys = OFF');
  for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();
  db.prepare('UPDATE materials SET qty_in_stock = 0').run();
  db.pragma('foreign_keys = ON');
})();

console.log('Cleared all transactions. Users, customers, suppliers, materials and settings were kept.');
console.log('Material stock balances were reset to zero — re-enter opening stock if needed.');
