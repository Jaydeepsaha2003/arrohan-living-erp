'use strict';

const express = require('express');
const db = require('../db');
const a = require('../auth');
const wf = require('../workflow');
const { wrap, http, str, num, round2, today } = require('../lib');

const router = express.Router();
router.use(a.requireAuth);

/** Every report resolves to { columns, rows, totals, meta } so one UI renders all of them. */
const REPORTS = {};

function report(key, def) {
  REPORTS[key] = def;
}

const D = (v) => (v ? String(v).slice(0, 10) : null);

function range(req) {
  const from = D(req.query.from) || '1900-01-01';
  const to = D(req.query.to) || '2999-12-31';
  return { from, to };
}

// ======================================================= 1 · daily enquiries

report('daily-enquiries', {
  title: 'Daily Enquiries Received',
  group: 'Sales',
  desc: 'Every enquiry logged in the period, with its current outcome.',
  dated: true,
  columns: [
    { key: 'enquiry_no', label: 'Enquiry no' },
    { key: 'enquiry_date', label: 'Date', type: 'date' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'cust_city', label: 'City' },
    { key: 'cust_phone', label: 'Phone' },
    { key: 'item_count', label: 'Items', type: 'num' },
    { key: 'expected_budget', label: 'Expected budget', type: 'money' },
    { key: 'taken_by', label: 'Taken by' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'order_no', label: 'Order no', link: 'order' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const rows = await db.all(
      `SELECT e.*, o.order_no, o.id AS order_id,
              (SELECT COUNT(*) FROM enquiry_items i WHERE i.enquiry_id = e.id) AS item_count
       FROM enquiries e LEFT JOIN orders o ON o.id = e.order_id
       WHERE date(e.enquiry_date) BETWEEN ? AND ?
       ORDER BY e.enquiry_date DESC, e.id DESC`,
      from, to
    );
    return {
      rows,
      totals: { expected_budget: sum(rows, 'expected_budget'), item_count: sum(rows, 'item_count') },
      summary: [
        { label: 'Enquiries', value: rows.length },
        { label: 'Converted', value: rows.filter((r) => r.status === 'converted').length },
        { label: 'Lost', value: rows.filter((r) => r.status === 'lost').length },
        { label: 'Still open', value: rows.filter((r) => r.status === 'open').length },
      ],
    };
  },
});

// ================================================= 2 · enquiries converted

report('enquiry-conversion', {
  title: 'Enquiries Converted to Orders',
  group: 'Sales',
  desc: 'Conversion funnel with the reason behind every loss.',
  dated: true,
  columns: [
    { key: 'enquiry_no', label: 'Enquiry no' },
    { key: 'enquiry_date', label: 'Enquiry date', type: 'date' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'stage_now', label: 'Order stage' },
    { key: 'order_value', label: 'Order value', type: 'money' },
    { key: 'status', label: 'Outcome', type: 'status' },
    { key: 'lost_reason', label: 'Reason if lost' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const raw = await db.all(
      `SELECT e.*, o.order_no, o.id AS order_id, o.current_stage,
              COALESCE(inv.grand_total, so.locked_total, q.grand_total, 0) AS order_value
       FROM enquiries e
       LEFT JOIN orders o ON o.id = e.order_id
       LEFT JOIN quotations q ON q.order_id = o.id
       LEFT JOIN sales_orders so ON so.order_id = o.id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       WHERE date(e.enquiry_date) BETWEEN ? AND ?
       ORDER BY e.id DESC`,
      from, to
    );
    const rows = raw.map((r) => ({ ...r, stage_now: r.current_stage ? wf.stageLabel(r.current_stage) : '—' }));
    const converted = rows.filter((r) => r.status === 'converted');
    const lost = rows.filter((r) => r.status === 'lost');
    const rate = rows.length ? round2((converted.length / rows.length) * 100) : 0;
    const breakdownRows = await db.all(
      `SELECT COALESCE(lost_reason, 'Not recorded') AS label, COUNT(*) AS count
       FROM enquiries WHERE status = 'lost' AND date(enquiry_date) BETWEEN ? AND ?
       GROUP BY COALESCE(lost_reason, 'Not recorded') ORDER BY count DESC`,
      from, to
    );
    return {
      rows,
      totals: { order_value: sum(rows, 'order_value') },
      summary: [
        { label: 'Total enquiries', value: rows.length },
        { label: 'Converted', value: converted.length },
        { label: 'Lost', value: lost.length },
        { label: 'Conversion rate', value: `${rate}%` },
        { label: 'Converted value', value: sum(converted, 'order_value'), type: 'money' },
      ],
      breakdown: { title: 'Why enquiries were lost', rows: breakdownRows },
    };
  },
});

// ============================================ 3 · quotations pending approval

report('quotations-pending', {
  title: 'Quotations Pending Approval',
  group: 'Sales',
  desc: 'Quotations sent to customers that are still awaiting a decision.',
  columns: [
    { key: 'quotation_no', label: 'Quotation no' },
    { key: 'quotation_date', label: 'Date', type: 'date' },
    { key: 'valid_till', label: 'Valid till', type: 'date' },
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'grand_total', label: 'Quoted value', type: 'money' },
    { key: 'age_days', label: 'Age (days)', type: 'num' },
    { key: 'expiry', label: 'Validity' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT q.*, o.order_no, o.id AS order_id, e.cust_name,
              CAST(julianday('now') - julianday(q.quotation_date) AS INTEGER) AS age_days
       FROM quotations q
       JOIN orders o ON o.id = q.order_id
       JOIN enquiries e ON e.id = o.enquiry_id
       WHERE o.current_stage = 'approval' AND o.status = 'active'
       ORDER BY q.quotation_date`
    );
    const rows = raw.map((r) => ({ ...r, expiry: r.valid_till && r.valid_till < today() ? 'Expired' : 'Valid' }));
    return {
      rows,
      totals: { grand_total: sum(rows, 'grand_total') },
      summary: [
        { label: 'Awaiting decision', value: rows.length },
        { label: 'Value in play', value: sum(rows, 'grand_total'), type: 'money' },
        { label: 'Past validity', value: rows.filter((r) => r.expiry === 'Expired').length },
      ],
    };
  },
});

// ================================================== 4 · orders in production

report('orders-in-production', {
  title: 'Orders in Production',
  group: 'Factory',
  desc: 'Everything on the shop floor between material issue and QC.',
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'stage_label', label: 'Stage' },
    { key: 'start_date', label: 'Started', type: 'date' },
    { key: 'expected_end_date', label: 'Expected', type: 'date' },
    { key: 'delivery_date', label: 'Promised delivery', type: 'date' },
    { key: 'delay_days', label: 'Delay (days)', type: 'num' },
    { key: 'value', label: 'Order value', type: 'money' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT o.id AS order_id, o.order_no, o.current_stage, e.cust_name,
              p.start_date, p.expected_end_date, pl.delivery_date,
              COALESCE(so.locked_total, q.grand_total, 0) AS value
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN productions p ON p.order_id = o.id
       LEFT JOIN plannings pl ON pl.order_id = o.id
       LEFT JOIN sales_orders so ON so.order_id = o.id
       LEFT JOIN quotations q ON q.order_id = o.id
       WHERE o.status = 'active' AND o.current_stage IN ('store','production','qc')
       ORDER BY pl.delivery_date`
    );
    const rows = raw.map((r) => ({
      ...r,
      stage_label: wf.stageLabel(r.current_stage),
      delay_days: r.delivery_date && r.delivery_date < today() ? daysBetween(r.delivery_date, today()) : 0,
    }));
    return {
      rows,
      totals: { value: sum(rows, 'value') },
      summary: [
        { label: 'On the floor', value: rows.length },
        { label: 'Past promised date', value: rows.filter((r) => r.delay_days > 0).length },
        { label: 'Value in progress', value: sum(rows, 'value'), type: 'money' },
      ],
    };
  },
});

// ============================================================ 5 · QC pending

report('qc-pending', {
  title: 'QC Pending',
  group: 'Factory',
  desc: 'Finished goods waiting for quality inspection, including reworks.',
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'end_date', label: 'Production finished', type: 'date' },
    { key: 'waiting_days', label: 'Waiting (days)', type: 'num' },
    { key: 'attempt', label: 'Previous attempts', type: 'num' },
    { key: 'rework_note', label: 'Last rework note' },
  ],
  async run() {
    const rows = await db.all(
      `SELECT o.id AS order_id, o.order_no, e.cust_name, p.end_date,
              COALESCE(qc.attempt, 0) AS attempt, qc.rework_note,
              CAST(julianday('now') - julianday(p.end_date) AS INTEGER) AS waiting_days
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN productions p ON p.order_id = o.id
       LEFT JOIN qc_checks qc ON qc.order_id = o.id
       WHERE o.status = 'active' AND o.current_stage = 'qc'
       ORDER BY p.end_date`
    );
    return { rows, summary: [{ label: 'Awaiting QC', value: rows.length }] };
  },
});

// ==================================================== 6 · ready for dispatch

report('ready-for-dispatch', {
  title: 'Ready for Dispatch',
  group: 'Logistics',
  desc: 'Packed orders waiting for a vehicle.',
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'cust_city', label: 'Deliver to' },
    { key: 'packing_date', label: 'Packed on', type: 'date' },
    { key: 'total_boxes', label: 'Boxes', type: 'num' },
    { key: 'gross_weight', label: 'Weight (kg)', type: 'num' },
    { key: 'delivery_date', label: 'Promised', type: 'date' },
    { key: 'value', label: 'Order value', type: 'money' },
  ],
  async run() {
    const rows = await db.all(
      `SELECT o.id AS order_id, o.order_no, e.cust_name, e.cust_city,
              pk.packing_date, pk.total_boxes, pk.gross_weight, pl.delivery_date,
              COALESCE(so.locked_total, 0) AS value
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       JOIN packings pk ON pk.order_id = o.id
       LEFT JOIN plannings pl ON pl.order_id = o.id
       LEFT JOIN sales_orders so ON so.order_id = o.id
       WHERE o.status = 'active' AND o.current_stage = 'dispatch'
       ORDER BY pl.delivery_date`
    );
    return {
      rows,
      totals: { total_boxes: sum(rows, 'total_boxes'), value: sum(rows, 'value') },
      summary: [
        { label: 'Ready to load', value: rows.length },
        { label: 'Total boxes', value: sum(rows, 'total_boxes') },
      ],
    };
  },
});

// ======================================================= 7 · daily deliveries

report('daily-deliveries', {
  title: 'Daily Deliveries',
  group: 'Logistics',
  desc: 'Dispatches made in the period with transporter details.',
  dated: true,
  columns: [
    { key: 'dispatch_date', label: 'Date', type: 'date' },
    { key: 'challan_no', label: 'Challan no' },
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'transporter', label: 'Transporter' },
    { key: 'vehicle_no', label: 'Vehicle' },
    { key: 'lr_no', label: 'LR no' },
    { key: 'boxes', label: 'Boxes', type: 'num' },
    { key: 'invoice_no', label: 'Invoice no' },
    { key: 'gate_pass_no', label: 'Gate pass' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const rows = await db.all(
      `SELECT d.*, o.id AS order_id, o.order_no, e.cust_name, inv.invoice_no, gp.gate_pass_no
       FROM dispatches d
       JOIN orders o ON o.id = d.order_id
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       LEFT JOIN gate_passes gp ON gp.order_id = o.id
       WHERE date(d.dispatch_date) BETWEEN ? AND ?
       ORDER BY d.dispatch_date DESC, d.order_id DESC`,
      from, to
    );
    return {
      rows,
      totals: { boxes: sum(rows, 'boxes') },
      summary: [
        { label: 'Deliveries', value: rows.length },
        { label: 'Boxes shipped', value: sum(rows, 'boxes') },
        { label: 'Gate pass issued', value: rows.filter((r) => r.gate_pass_no).length },
      ],
    };
  },
});

// ==================================================== 8 · sales invoice report

report('sales-register', {
  title: 'Sales Invoice Report',
  group: 'Accounts',
  desc: 'GST sales register for the period.',
  dated: true,
  columns: [
    { key: 'invoice_date', label: 'Date', type: 'date' },
    { key: 'invoice_no', label: 'Invoice no' },
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'cust_gstin', label: 'GSTIN' },
    { key: 'place_of_supply', label: 'Place of supply' },
    { key: 'taxable_amount', label: 'Taxable', type: 'money' },
    { key: 'gst_rate', label: 'GST %', type: 'num' },
    { key: 'gst_amount', label: 'GST', type: 'money' },
    { key: 'grand_total', label: 'Invoice total', type: 'money' },
    { key: 'paid', label: 'Received', type: 'money' },
    { key: 'outstanding', label: 'Outstanding', type: 'money' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const raw = await db.all(
      `SELECT inv.*, o.id AS order_id, o.order_no, e.cust_name, e.cust_gstin,
              (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id) AS paid
       FROM invoices inv
       JOIN orders o ON o.id = inv.order_id
       JOIN enquiries e ON e.id = o.enquiry_id
       WHERE date(inv.invoice_date) BETWEEN ? AND ?
       ORDER BY inv.invoice_date DESC, inv.invoice_no DESC`,
      from, to
    );
    const rows = raw.map((r) => ({ ...r, outstanding: round2(Math.max(0, num(r.grand_total) - num(r.paid))) }));
    return {
      rows,
      totals: {
        taxable_amount: sum(rows, 'taxable_amount'),
        gst_amount: sum(rows, 'gst_amount'),
        grand_total: sum(rows, 'grand_total'),
        paid: sum(rows, 'paid'),
        outstanding: sum(rows, 'outstanding'),
      },
      summary: [
        { label: 'Invoices', value: rows.length },
        { label: 'Net sales', value: sum(rows, 'taxable_amount'), type: 'money' },
        { label: 'GST collected', value: sum(rows, 'gst_amount'), type: 'money' },
        { label: 'Gross billed', value: sum(rows, 'grand_total'), type: 'money' },
      ],
    };
  },
});

// ==================================================== 9 · outstanding payments

report('outstanding', {
  title: 'Outstanding Payments',
  group: 'Accounts',
  desc: 'Money still to be collected, oldest first.',
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'cust_phone', label: 'Phone' },
    { key: 'ref_no', label: 'Invoice / SO' },
    { key: 'ref_date', label: 'Date', type: 'date' },
    { key: 'age_days', label: 'Age (days)', type: 'num' },
    { key: 'billed', label: 'Billed', type: 'money' },
    { key: 'paid', label: 'Received', type: 'money' },
    { key: 'outstanding', label: 'Outstanding', type: 'money' },
    { key: 'stage_label', label: 'Stage' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT o.id AS order_id, o.order_no, o.current_stage, e.cust_name, e.cust_phone,
              COALESCE(inv.invoice_no, so.so_no) AS ref_no,
              COALESCE(inv.invoice_date, so.so_date) AS ref_date,
              COALESCE(inv.grand_total, so.locked_total, 0) AS billed,
              (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id) AS paid
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       LEFT JOIN sales_orders so ON so.order_id = o.id
       WHERE o.status <> 'lost' AND COALESCE(inv.grand_total, so.locked_total, 0) > 0
       ORDER BY COALESCE(inv.invoice_date, so.so_date)`
    );
    const rows = raw
      .map((r) => ({
        ...r,
        outstanding: round2(num(r.billed) - num(r.paid)),
        age_days: r.ref_date ? daysBetween(r.ref_date, today()) : 0,
        stage_label: wf.stageLabel(r.current_stage),
      }))
      .filter((r) => r.outstanding > 0.01);

    const bucket = (lo, hi) => sum(rows.filter((r) => r.age_days >= lo && (hi === null || r.age_days <= hi)), 'outstanding');
    return {
      rows,
      totals: { billed: sum(rows, 'billed'), paid: sum(rows, 'paid'), outstanding: sum(rows, 'outstanding') },
      summary: [
        { label: 'Total outstanding', value: sum(rows, 'outstanding'), type: 'money' },
        { label: '0–30 days', value: bucket(0, 30), type: 'money' },
        { label: '31–60 days', value: bucket(31, 60), type: 'money' },
        { label: '60+ days', value: bucket(61, null), type: 'money' },
      ],
    };
  },
});

// ======================================================= 10 · low stock report

report('low-stock', {
  title: 'Low Stock Report',
  group: 'Store',
  desc: 'Materials at or below their reorder level.',
  columns: [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Material' },
    { key: 'category', label: 'Category' },
    { key: 'qty_in_stock', label: 'In stock', type: 'num' },
    { key: 'reorder_level', label: 'Reorder at', type: 'num' },
    { key: 'shortfall', label: 'Shortfall', type: 'num' },
    { key: 'unit', label: 'Unit' },
    { key: 'standard_rate', label: 'Rate', type: 'money' },
    { key: 'reorder_value', label: 'Reorder value', type: 'money' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT * FROM materials
       WHERE active = 1 AND ((reorder_level > 0 AND qty_in_stock <= reorder_level) OR qty_in_stock < 0)
       ORDER BY (qty_in_stock - reorder_level)`
    );
    const rows = raw.map((m) => {
      const shortfall = round2(Math.max(0, num(m.reorder_level) - num(m.qty_in_stock)));
      return { ...m, shortfall, reorder_value: round2(shortfall * num(m.standard_rate)) };
    });
    return {
      rows,
      totals: { reorder_value: sum(rows, 'reorder_value') },
      summary: [
        { label: 'Materials to reorder', value: rows.length },
        { label: 'Negative balances', value: rows.filter((r) => num(r.qty_in_stock) < 0).length },
        { label: 'Estimated reorder cost', value: sum(rows, 'reorder_value'), type: 'money' },
      ],
    };
  },
});

// ================================================== 11 · raw material stock

report('raw-material-stock', {
  title: 'Raw Material Stock',
  group: 'Store',
  desc: 'Current balance and valuation of every raw material.',
  columns: [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Material' },
    { key: 'category', label: 'Category' },
    { key: 'unit', label: 'Unit' },
    { key: 'purchased', label: 'Purchased', type: 'num' },
    { key: 'issued', label: 'Issued', type: 'num' },
    { key: 'wasted', label: 'Wasted', type: 'num' },
    { key: 'qty_in_stock', label: 'Balance', type: 'num' },
    { key: 'standard_rate', label: 'Rate', type: 'money' },
    { key: 'stock_value', label: 'Value', type: 'money' },
    { key: 'location', label: 'Location' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT m.*,
              (SELECT COALESCE(SUM(l.qty),0) FROM stock_ledger l WHERE l.material_id = m.id AND l.txn_type IN ('purchase','opening')) AS purchased,
              (SELECT COALESCE(SUM(-l.qty),0) FROM stock_ledger l WHERE l.material_id = m.id AND l.txn_type IN ('issue','consume')) AS issued,
              (SELECT COALESCE(SUM(-l.qty),0) FROM stock_ledger l WHERE l.material_id = m.id AND l.txn_type = 'wastage') AS wasted
       FROM materials m WHERE m.active = 1 ORDER BY m.name`
    );
    const rows = raw.map((m) => ({ ...m, stock_value: round2(num(m.qty_in_stock) * num(m.standard_rate)) }));
    return {
      rows,
      totals: { stock_value: sum(rows, 'stock_value') },
      summary: [
        { label: 'Materials tracked', value: rows.length },
        { label: 'Total stock value', value: sum(rows, 'stock_value'), type: 'money' },
        { label: 'Below reorder level', value: rows.filter((r) => num(r.reorder_level) > 0 && num(r.qty_in_stock) <= num(r.reorder_level)).length },
      ],
    };
  },
});

// ============================================== 12 · finished goods inventory

report('finished-goods', {
  title: 'Finished Goods Inventory',
  group: 'Store',
  desc: 'Produced goods held in the factory and those already shipped.',
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'product', label: 'Product' },
    { key: 'qty', label: 'Qty', type: 'num' },
    { key: 'produced_at', label: 'Produced', type: 'date' },
    { key: 'status_label', label: 'Status', type: 'status' },
    { key: 'dispatched_at', label: 'Dispatched', type: 'date' },
    { key: 'stage_label', label: 'Order stage' },
  ],
  async run(req) {
    const onlyStock = req.query.status !== 'all';
    const raw = await db.all(
      `SELECT fg.*, o.order_no, o.id AS order_id, o.current_stage, e.cust_name
       FROM finished_goods fg
       JOIN orders o ON o.id = fg.order_id
       JOIN enquiries e ON e.id = o.enquiry_id
       ${onlyStock ? `WHERE fg.status = 'in_stock'` : ''}
       ORDER BY fg.produced_at DESC, fg.id DESC`
    );
    const rows = raw.map((r) => ({
      ...r,
      status_label: r.status === 'in_stock' ? 'In factory' : 'Dispatched',
      stage_label: wf.stageLabel(r.current_stage),
    }));
    return {
      rows,
      totals: { qty: sum(rows, 'qty') },
      summary: [
        { label: 'Lines', value: rows.length },
        { label: 'Units held', value: sum(rows.filter((r) => r.status === 'in_stock'), 'qty') },
        { label: 'Units dispatched', value: sum(rows.filter((r) => r.status === 'dispatched'), 'qty') },
      ],
      filters: [{ key: 'status', label: 'Show', options: [{ value: 'in_stock', label: 'In factory only' }, { value: 'all', label: 'Include dispatched' }] }],
    };
  },
});

// ============================================ 13 · material consumption report

report('material-consumption', {
  title: 'Material Consumption Report',
  group: 'Factory',
  desc: 'Planned versus actual material use, per order and material.',
  dated: true,
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'product', label: 'Product' },
    { key: 'material', label: 'Material' },
    { key: 'qty_issued', label: 'Issued', type: 'num' },
    { key: 'qty_used', label: 'Consumed', type: 'num' },
    { key: 'variance', label: 'Variance', type: 'num' },
    { key: 'unit', label: 'Unit' },
    { key: 'end_date', label: 'Production end', type: 'date' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const raw = await db.all(
      `SELECT c.*, o.order_no, o.id AS order_id, e.cust_name, p.end_date
       FROM production_consumption c
       JOIN orders o ON o.id = c.order_id
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN productions p ON p.order_id = o.id
       WHERE date(COALESCE(p.end_date, p.start_date, date('now'))) BETWEEN ? AND ?
       ORDER BY o.id DESC, c.id`,
      from, to
    );
    const rows = raw.map((r) => ({ ...r, variance: round2(num(r.qty_used) - num(r.qty_issued)) }));
    const breakdownRows = await db.all(
      `SELECT c.material AS label, ROUND(SUM(c.qty_used), 2) AS count, c.unit
       FROM production_consumption c GROUP BY c.material, c.unit ORDER BY SUM(c.qty_used) DESC LIMIT 25`
    );
    return {
      rows,
      totals: { qty_issued: sum(rows, 'qty_issued'), qty_used: sum(rows, 'qty_used'), variance: sum(rows, 'variance') },
      summary: [
        { label: 'Consumption lines', value: rows.length },
        { label: 'Over-consumed lines', value: rows.filter((r) => r.variance > 0).length },
        { label: 'Returned to store', value: rows.filter((r) => r.variance < 0).length },
      ],
      breakdown: { title: 'Total consumption by material', rows: breakdownRows },
    };
  },
});

// ========================================================= 14 · wastage report

report('wastage', {
  title: 'Wastage Report',
  group: 'Factory',
  desc: 'Scrap recorded during production, valued at standard rate.',
  dated: true,
  columns: [
    { key: 'at', label: 'Recorded', type: 'datetime' },
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'material', label: 'Material' },
    { key: 'qty', label: 'Qty', type: 'num' },
    { key: 'unit', label: 'Unit' },
    { key: 'rate', label: 'Rate', type: 'money' },
    { key: 'value', label: 'Value lost', type: 'money' },
    { key: 'reason', label: 'Reason' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const rows = await db.all(
      `SELECT w.*, o.order_no, o.id AS order_id, e.cust_name
       FROM production_wastage w
       JOIN orders o ON o.id = w.order_id
       JOIN enquiries e ON e.id = o.enquiry_id
       WHERE date(w.at) BETWEEN ? AND ?
       ORDER BY w.id DESC`,
      from, to
    );
    const breakdownRows = await db.all(
      `SELECT COALESCE(NULLIF(TRIM(reason),''), 'Not recorded') AS label, COUNT(*) AS count,
              ROUND(SUM(value),2) AS value
       FROM production_wastage WHERE date(at) BETWEEN ? AND ?
       GROUP BY COALESCE(NULLIF(TRIM(reason),''), 'Not recorded') ORDER BY SUM(value) DESC`,
      from, to
    );
    return {
      rows,
      totals: { qty: sum(rows, 'qty'), value: sum(rows, 'value') },
      summary: [
        { label: 'Wastage entries', value: rows.length },
        { label: 'Value lost', value: sum(rows, 'value'), type: 'money' },
        { label: 'Orders affected', value: new Set(rows.map((r) => r.order_id)).size },
      ],
      breakdown: { title: 'Wastage by reason', rows: breakdownRows },
    };
  },
});

// ================================================ 15 · production status report

report('production-status', {
  title: 'Production Status Report',
  group: 'Factory',
  desc: 'Every order that has entered the factory, with cost against value.',
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'stage_label', label: 'Current stage' },
    { key: 'start_date', label: 'Started', type: 'date' },
    { key: 'end_date', label: 'Finished', type: 'date' },
    { key: 'days_taken', label: 'Days taken', type: 'num' },
    { key: 'production_days', label: 'Planned days', type: 'num' },
    { key: 'qc_result', label: 'QC' },
    { key: 'total_cost', label: 'Factory cost', type: 'money' },
    { key: 'order_value', label: 'Order value', type: 'money' },
    { key: 'margin', label: 'Margin', type: 'money' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT o.id AS order_id, o.order_no, o.current_stage, e.cust_name,
              p.start_date, p.end_date, c.production_days, c.total_cost,
              qc.result AS qc_result,
              COALESCE(inv.taxable_amount, pl.subtotal, 0) AS order_value
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN costings c ON c.order_id = o.id
       LEFT JOIN plannings pl ON pl.order_id = o.id
       LEFT JOIN productions p ON p.order_id = o.id
       LEFT JOIN qc_checks qc ON qc.order_id = o.id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       WHERE o.status <> 'lost' AND EXISTS (SELECT 1 FROM store_issues si WHERE si.order_id = o.id)
       ORDER BY o.id DESC`
    );
    const rows = raw.map((r) => ({
      ...r,
      stage_label: wf.stageLabel(r.current_stage),
      days_taken: r.start_date && r.end_date ? daysBetween(r.start_date, r.end_date) : null,
      margin: round2(num(r.order_value) - num(r.total_cost)),
      qc_result: r.qc_result ? (r.qc_result === 'pass' ? 'Passed' : 'Failed') : 'Pending',
    }));
    return {
      rows,
      totals: { total_cost: sum(rows, 'total_cost'), order_value: sum(rows, 'order_value'), margin: sum(rows, 'margin') },
      summary: [
        { label: 'Orders in factory history', value: rows.length },
        { label: 'Factory cost', value: sum(rows, 'total_cost'), type: 'money' },
        { label: 'Gross margin', value: sum(rows, 'margin'), type: 'money' },
      ],
    };
  },
});

// ============================================= 16 · customer order tracking

report('customer-tracking', {
  title: 'Customer Order Tracking',
  group: 'Sales',
  desc: 'Where every order stands, end to end.',
  columns: [
    { key: 'order_no', label: 'Order no', link: 'order' },
    { key: 'enquiry_no', label: 'Enquiry no' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'created_at', label: 'Order date', type: 'date' },
    { key: 'stage_label', label: 'Current stage' },
    { key: 'progress', label: 'Progress' },
    { key: 'delivery_date', label: 'Promised', type: 'date' },
    { key: 'billed', label: 'Billed', type: 'money' },
    { key: 'paid', label: 'Received', type: 'money' },
    { key: 'outstanding', label: 'Outstanding', type: 'money' },
    { key: 'status', label: 'Status', type: 'status' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT o.id AS order_id, o.order_no, o.current_stage, o.status, o.created_at,
              e.enquiry_no, e.cust_name, pl.delivery_date,
              COALESCE(inv.grand_total, so.locked_total, q.grand_total, 0) AS billed,
              (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id) AS paid
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN plannings pl ON pl.order_id = o.id
       LEFT JOIN quotations q ON q.order_id = o.id
       LEFT JOIN sales_orders so ON so.order_id = o.id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       ORDER BY o.id DESC`
    );
    const rows = raw.map((r) => {
      const idx = wf.stageIndex(r.current_stage);
      const done = r.status === 'closed' ? wf.STAGE_KEYS.length : Math.max(0, idx);
      return {
        ...r,
        stage_label: wf.stageLabel(r.current_stage),
        progress: `${done}/${wf.STAGE_KEYS.length}`,
        outstanding: round2(Math.max(0, num(r.billed) - num(r.paid))),
      };
    });
    return {
      rows,
      totals: { billed: sum(rows, 'billed'), paid: sum(rows, 'paid'), outstanding: sum(rows, 'outstanding') },
      summary: [
        { label: 'Total orders', value: rows.length },
        { label: 'Active', value: rows.filter((r) => r.status === 'active').length },
        { label: 'Completed', value: rows.filter((r) => r.status === 'closed').length },
        { label: 'Lost', value: rows.filter((r) => r.status === 'lost').length },
      ],
    };
  },
});

// ============================================================ extra: ledger

report('customer-ledger', {
  title: 'Customer Ledger',
  group: 'Accounts',
  desc: 'Invoices and receipts per customer with a running balance.',
  columns: [
    { key: 'cust_name', label: 'Customer' },
    { key: 'orders', label: 'Orders', type: 'num' },
    { key: 'billed', label: 'Billed', type: 'money' },
    { key: 'paid', label: 'Received', type: 'money' },
    { key: 'outstanding', label: 'Outstanding', type: 'money' },
    { key: 'last_activity', label: 'Last activity', type: 'date' },
  ],
  async run() {
    const raw = await db.all(
      `SELECT e.cust_name,
              COUNT(DISTINCT o.id) AS orders,
              COALESCE(SUM(COALESCE(inv.grand_total, so.locked_total, 0)), 0) AS billed,
              COALESCE(SUM((SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.order_id = o.id)), 0) AS paid,
              MAX(COALESCE(inv.invoice_date, so.so_date, o.created_at)) AS last_activity
       FROM orders o
       JOIN enquiries e ON e.id = o.enquiry_id
       LEFT JOIN invoices inv ON inv.order_id = o.id
       LEFT JOIN sales_orders so ON so.order_id = o.id
       WHERE o.status <> 'lost'
       GROUP BY e.cust_name
       ORDER BY 5 DESC`
    );
    const rows = raw.map((r) => ({ ...r, outstanding: round2(num(r.billed) - num(r.paid)) }));
    return {
      rows,
      totals: { billed: sum(rows, 'billed'), paid: sum(rows, 'paid'), outstanding: sum(rows, 'outstanding') },
      summary: [
        { label: 'Customers with orders', value: rows.length },
        { label: 'Total billed', value: sum(rows, 'billed'), type: 'money' },
        { label: 'Total outstanding', value: sum(rows, 'outstanding'), type: 'money' },
      ],
    };
  },
});

report('purchase-register', {
  title: 'Purchase Register',
  group: 'Store',
  desc: 'Purchase orders raised and goods received.',
  dated: true,
  columns: [
    { key: 'po_date', label: 'Date', type: 'date' },
    { key: 'po_no', label: 'PO no' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'line_count', label: 'Lines', type: 'num' },
    { key: 'subtotal', label: 'Taxable', type: 'money' },
    { key: 'gst_amount', label: 'GST', type: 'money' },
    { key: 'grand_total', label: 'Total', type: 'money' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'grn_no', label: 'GRN no' },
    { key: 'order_no', label: 'Against order', link: 'order' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const rows = await db.all(
      `SELECT po.*, o.order_no, o.id AS order_id,
              (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.id) AS line_count
       FROM purchase_orders po
       LEFT JOIN orders o ON o.id = po.order_id
       WHERE date(po.po_date) BETWEEN ? AND ?
       ORDER BY po.po_date DESC, po.id DESC`,
      from, to
    );
    return {
      rows,
      totals: { subtotal: sum(rows, 'subtotal'), gst_amount: sum(rows, 'gst_amount'), grand_total: sum(rows, 'grand_total') },
      summary: [
        { label: 'Purchase orders', value: rows.length },
        { label: 'Received', value: rows.filter((r) => r.status === 'received').length },
        { label: 'Total purchase value', value: sum(rows, 'grand_total'), type: 'money' },
      ],
    };
  },
});

report('stock-ledger', {
  title: 'Stock Movement Ledger',
  group: 'Store',
  desc: 'Every material movement in and out, with its reference.',
  dated: true,
  columns: [
    { key: 'at', label: 'When', type: 'datetime' },
    { key: 'material_name', label: 'Material' },
    { key: 'txn_type', label: 'Type', type: 'status' },
    { key: 'qty', label: 'Qty', type: 'num' },
    { key: 'unit', label: 'Unit' },
    { key: 'balance_after', label: 'Balance after', type: 'num' },
    { key: 'order_no', label: 'Order' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'user_name', label: 'By' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const rows = await db.all(
      `SELECT l.*, m.name AS material_name, u.full_name AS user_name
       FROM stock_ledger l
       JOIN materials m ON m.id = l.material_id
       LEFT JOIN users u ON u.id = l.user_id
       WHERE date(l.at) BETWEEN ? AND ?
       ORDER BY l.id DESC LIMIT 2000`,
      from, to
    );
    return {
      rows,
      summary: [
        { label: 'Movements', value: rows.length },
        { label: 'Total in', value: round2(rows.filter((r) => num(r.qty) > 0).reduce((s, r) => s + num(r.qty), 0)) },
        { label: 'Total out', value: round2(rows.filter((r) => num(r.qty) < 0).reduce((s, r) => s + Math.abs(num(r.qty)), 0)) },
      ],
    };
  },
});

report('lost-enquiries', {
  title: 'Lost Enquiry Analysis',
  group: 'Sales',
  desc: 'Every lost enquiry and quotation rejection with its reason.',
  dated: true,
  columns: [
    { key: 'enquiry_no', label: 'Enquiry no' },
    { key: 'enquiry_date', label: 'Date', type: 'date' },
    { key: 'cust_name', label: 'Customer' },
    { key: 'cust_city', label: 'City' },
    { key: 'expected_budget', label: 'Expected budget', type: 'money' },
    { key: 'quoted_value', label: 'Quoted value', type: 'money' },
    { key: 'lost_reason', label: 'Reason' },
    { key: 'lost_reason_note', label: 'Detail' },
    { key: 'lost_at', label: 'Closed on', type: 'date' },
  ],
  async run(req) {
    const { from, to } = range(req);
    const rows = await db.all(
      `SELECT e.*, e.closed_at AS lost_at, COALESCE(q.grand_total, 0) AS quoted_value
       FROM enquiries e
       LEFT JOIN orders o ON o.id = e.order_id
       LEFT JOIN quotations q ON q.order_id = o.id
       WHERE e.status = 'lost' AND date(e.enquiry_date) BETWEEN ? AND ?
       ORDER BY e.closed_at DESC`,
      from, to
    );
    const breakdownRows = await db.all(
      `SELECT COALESCE(lost_reason,'Not recorded') AS label, COUNT(*) AS count
       FROM enquiries WHERE status = 'lost' AND date(enquiry_date) BETWEEN ? AND ?
       GROUP BY COALESCE(lost_reason,'Not recorded') ORDER BY count DESC`,
      from, to
    );
    return {
      rows,
      totals: { expected_budget: sum(rows, 'expected_budget'), quoted_value: sum(rows, 'quoted_value') },
      summary: [
        { label: 'Lost enquiries', value: rows.length },
        { label: 'Value lost (quoted)', value: sum(rows, 'quoted_value'), type: 'money' },
        { label: 'After quotation', value: rows.filter((r) => num(r.quoted_value) > 0).length },
      ],
      breakdown: { title: 'Reasons ranked', rows: breakdownRows },
    };
  },
});

report('stage-workload', {
  title: 'Department Workload',
  group: 'Management',
  desc: 'How many orders each department is holding, and for how long.',
  columns: [
    { key: 'stage', label: 'Stage' },
    { key: 'dept', label: 'Department' },
    { key: 'count', label: 'Orders waiting', type: 'num' },
    { key: 'value', label: 'Value held', type: 'money' },
    { key: 'oldest_days', label: 'Oldest wait (days)', type: 'num' },
  ],
  async run() {
    const rows = [];
    for (const s of wf.STAGES) {
      const r = await db.get(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(COALESCE(inv.grand_total, so.locked_total, q.grand_total, 0)), 0) AS value,
                MAX(CAST(julianday('now') - julianday(
                  COALESCE((SELECT MAX(h.at) FROM stage_history h WHERE h.order_id = o.id), o.created_at)
                ) AS INTEGER)) AS oldest_days
         FROM orders o
         LEFT JOIN quotations q ON q.order_id = o.id
         LEFT JOIN sales_orders so ON so.order_id = o.id
         LEFT JOIN invoices inv ON inv.order_id = o.id
         WHERE o.status = 'active' AND o.current_stage = ?`,
        s.key
      );
      rows.push({ stage: `${s.step}. ${s.label}`, dept: s.dept, count: r.count, value: round2(r.value), oldest_days: r.oldest_days || 0 });
    }
    return {
      rows,
      totals: { count: sum(rows, 'count'), value: sum(rows, 'value') },
      summary: [
        { label: 'Active orders', value: sum(rows, 'count') },
        { label: 'Value in the pipeline', value: sum(rows, 'value'), type: 'money' },
        { label: 'Busiest stage', value: rows.slice().sort((x, y) => y.count - x.count)[0]?.stage || '—' },
      ],
    };
  },
});

// ------------------------------------------------------------------- endpoints

router.get(
  '/',
  wrap(async (req, res) => {
    res.json({
      reports: Object.entries(REPORTS).map(([key, r]) => ({
        key, title: r.title, group: r.group, desc: r.desc, dated: !!r.dated,
      })),
    });
  })
);

router.get(
  '/:key',
  wrap(async (req, res) => {
    const def = REPORTS[req.params.key];
    if (!def) throw http(404, 'Unknown report.');
    const out = await def.run(req);
    res.json({
      key: req.params.key,
      title: def.title,
      desc: def.desc,
      group: def.group,
      dated: !!def.dated,
      columns: def.columns,
      rows: out.rows || [],
      totals: out.totals || null,
      summary: out.summary || [],
      breakdown: out.breakdown || null,
      filters: out.filters || null,
      generatedAt: new Date().toISOString(),
      range: def.dated ? range(req) : null,
    });
  })
);

router.get(
  '/:key/export.csv',
  wrap(async (req, res) => {
    const def = REPORTS[req.params.key];
    if (!def) throw http(404, 'Unknown report.');
    const out = await def.run(req);
    const cols = def.columns;
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => esc(c.label)).join(',')];
    for (const row of out.rows || []) lines.push(cols.map((c) => esc(row[c.key])).join(','));
    if (out.totals) {
      lines.push(cols.map((c, i) => (i === 0 ? 'TOTAL' : esc(out.totals[c.key] ?? ''))).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.key}-${today()}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  })
);

// ------------------------------------------------------------------- helpers

function sum(rows, key) {
  return round2(rows.reduce((s, r) => s + num(r[key]), 0));
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 864e5);
}

module.exports = { router, REPORTS };
