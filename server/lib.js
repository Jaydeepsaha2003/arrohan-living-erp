'use strict';

const db = require('./db');

// ------------------------------------------------------------------- utilities

function num(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function str(v) {
  return v == null ? null : String(v).trim() || null;
}

function reqStr(v, field) {
  const s = str(v);
  if (!s) throw http(400, `${field} is required.`);
  return s;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(dateStr, days) {
  const d = new Date(dateStr || today());
  d.setDate(d.getDate() + num(days));
  return d.toISOString().slice(0, 10);
}

function dateOnly(v) {
  const s = str(v);
  if (!s) return null;
  return s.length > 10 ? s.slice(0, 10) : s;
}

function round2(n) {
  return Math.round((num(n) + Number.EPSILON) * 100) / 100;
}

function http(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** Wraps an async route so a rejected promise reaches the error middleware. */
function wrap(fn) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
}

// ---------------------------------------------------------------- materials io

/**
 * Find a material by id or by case-insensitive name; create it if missing.
 * Keeping this lenient means production/store staff can type a material that
 * the store master has not caught up with yet, and inventory still tracks it.
 */
async function resolveMaterial({ material_id, material, unit, rate }) {
  if (material_id) {
    const row = await db.get('SELECT * FROM materials WHERE id = ?', material_id);
    if (row) return row;
  }
  const name = str(material);
  if (!name) return null;
  const found = await db.get('SELECT * FROM materials WHERE lower(trim(name)) = lower(trim(?))', name);
  if (found) return found;
  const info = await db.run(
    `INSERT INTO materials (name, unit, qty_in_stock, reorder_level, standard_rate, category)
     VALUES (?, ?, 0, 0, ?, 'Auto-created')`,
    name,
    str(unit) || 'nos',
    num(rate)
  );
  return db.get('SELECT * FROM materials WHERE id = ?', info.lastInsertRowid);
}

/**
 * Post a stock movement and update the material balance together.
 * qty is signed: positive = receipt, negative = issue/consume/wastage.
 * Always called inside a transaction, so the balance and the ledger cannot drift.
 */
async function postStock({ material_id, qty, unit, rate, txn_type, ref_table, ref_id, order_no, remarks, user_id }) {
  const mat = await db.get('SELECT * FROM materials WHERE id = ?', material_id);
  if (!mat) throw http(400, 'Unknown material in stock movement.');
  const balance = round2(num(mat.qty_in_stock) + num(qty));
  await db.run('UPDATE materials SET qty_in_stock = ? WHERE id = ?', balance, material_id);
  await db.run(
    `INSERT INTO stock_ledger (material_id, qty, unit, rate, balance_after, txn_type, ref_table, ref_id, order_no, remarks, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    material_id,
    round2(qty),
    str(unit) || mat.unit,
    num(rate),
    balance,
    txn_type,
    ref_table || null,
    ref_id != null ? String(ref_id) : null,
    order_no || null,
    remarks || null,
    user_id || null
  );
  return balance;
}

// -------------------------------------------------------------------- ordering

const ORDER_SELECT = `
  SELECT o.*,
         e.enquiry_no, e.enquiry_date, e.cust_name, e.cust_company, e.cust_phone, e.cust_email,
         e.cust_gstin, e.cust_address, e.cust_city, e.cust_state, e.cust_pincode,
         e.site_name, e.site_address, e.site_city, e.site_contact, e.site_mobile,
         e.required_date, e.installation_required, e.payment_terms AS enquiry_payment_terms,
         e.expected_budget, e.reference, e.taken_by, e.customer_id,
         q.grand_total AS quote_total, q.quotation_no,
         so.so_no, so.locked_total,
         inv.invoice_no, inv.grand_total AS invoice_total,
         (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id) AS paid_total
  FROM orders o
  JOIN enquiries e ON e.id = o.enquiry_id
  LEFT JOIN quotations q ON q.order_id = o.id
  LEFT JOIN sales_orders so ON so.order_id = o.id
  LEFT JOIN invoices inv ON inv.order_id = o.id
`;

function getOrder(id) {
  return db.get(`${ORDER_SELECT} WHERE o.id = ?`, id);
}

function orderItems(orderId) {
  return db.all(
    `SELECT ei.* FROM enquiry_items ei
     JOIN orders o ON o.enquiry_id = ei.enquiry_id
     WHERE o.id = ? ORDER BY ei.seq, ei.id`,
    orderId
  );
}

function logStage(orderId, stage, action, user, note) {
  return db.run(
    `INSERT INTO stage_history (order_id, stage, action, user_id, username, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    orderId,
    stage,
    action,
    user ? user.id : null,
    user ? user.username : null,
    note || null
  );
}

/** Billed (invoice total, else locked SO total) vs received, for one order. */
async function billingFor(orderId) {
  const row = await db.get(
    `SELECT COALESCE(inv.grand_total, so.locked_total, 0) AS billed,
            (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id) AS paid
     FROM orders o
     LEFT JOIN invoices inv ON inv.order_id = o.id
     LEFT JOIN sales_orders so ON so.order_id = o.id
     WHERE o.id = ?`,
    orderId
  );
  return row || { billed: 0, paid: 0 };
}

module.exports = {
  num,
  str,
  reqStr,
  bool,
  today,
  nowIso,
  addDays,
  dateOnly,
  round2,
  http,
  wrap,
  resolveMaterial,
  postStock,
  ORDER_SELECT,
  getOrder,
  orderItems,
  logStage,
  billingFor,
};
