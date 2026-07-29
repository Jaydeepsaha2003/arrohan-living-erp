'use strict';

const express = require('express');
const { db, audit, tx, nextDocNo } = require('../db');
const a = require('../auth');
const wf = require('../workflow');
const { wrap, http, str, num, reqStr, today, dateOnly, logStage } = require('../lib');

const router = express.Router();
router.use(a.requireAuth);

const ENQ_FIELDS = [
  'cust_name', 'cust_company', 'cust_phone', 'cust_alt_phone', 'cust_email', 'cust_gstin', 'cust_pan',
  'cust_address', 'cust_city', 'cust_state', 'cust_pincode',
  'reference', 'taken_by', 'site_name', 'site_address', 'site_city', 'site_contact', 'site_mobile',
  'visit_required', 'measurement_taken', 'measurement_by', 'measurement_date',
  'required_date', 'installation_required', 'payment_terms', 'notes', 'stage_label', 'enquiry_time',
];

router.get(
  '/',
  wrap((req, res) => {
    const status = str(req.query.status);
    const q = str(req.query.q);
    const where = [];
    const args = [];
    if (status && status !== 'all') { where.push('e.status = ?'); args.push(status); }
    if (q) {
      where.push('(e.enquiry_no LIKE ? OR e.cust_name LIKE ? OR e.cust_company LIKE ? OR e.cust_phone LIKE ? OR e.cust_city LIKE ?)');
      args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    const rows = db
      .prepare(
        `SELECT e.*, o.order_no, o.current_stage,
                (SELECT COUNT(*) FROM enquiry_items i WHERE i.enquiry_id = e.id) AS item_count,
                (SELECT COALESCE(SUM(i.qty),0) FROM enquiry_items i WHERE i.enquiry_id = e.id) AS total_qty,
                u.full_name AS created_by_name
         FROM enquiries e
         LEFT JOIN orders o ON o.id = e.order_id
         LEFT JOIN users u ON u.id = e.created_by
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY e.id DESC LIMIT 500`
      )
      .all(...args);
    res.json({ enquiries: rows });
  })
);

router.get(
  '/:id',
  wrap((req, res) => {
    const enq = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(Number(req.params.id));
    if (!enq) throw http(404, 'Enquiry not found.');
    enq.items = db.prepare('SELECT * FROM enquiry_items WHERE enquiry_id = ? ORDER BY seq, id').all(enq.id);
    enq.order = enq.order_id
      ? db.prepare('SELECT id, order_no, current_stage, status FROM orders WHERE id = ?').get(enq.order_id)
      : null;
    res.json({ enquiry: enq });
  })
);

/**
 * Create an enquiry. `send: true` immediately converts it into an order sitting
 * on Factory Costing — the requirement doc's "auto-assigned to Factory/Costing".
 */
router.post(
  '/',
  a.requireCapability('enquiry.create'),
  wrap((req, res) => {
    const b = req.body;
    const custName = reqStr(b.cust_name, 'Customer name');
    const items = normaliseItems(b.items);
    const send = !!b.send;
    if (send && !items.length) throw http(400, 'Add at least one product before sending to the factory.');

    const out = tx(() => {
      const enquiryNo = nextDocNo('ENQ');
      let customerId = b.customer_id ? Number(b.customer_id) : null;
      if (!customerId && b.save_customer) customerId = upsertCustomerFromEnquiry(b, req.user.id);

      const info = db
        .prepare(
          `INSERT INTO enquiries (enquiry_no, enquiry_date, enquiry_time, status, stage_label, customer_id,
             cust_name, cust_company, cust_phone, cust_alt_phone, cust_email, cust_gstin, cust_pan,
             cust_address, cust_city, cust_state, cust_pincode, reference, taken_by, expected_budget,
             site_name, site_address, site_city, site_contact, site_mobile, visit_required,
             measurement_taken, measurement_by, measurement_date, required_date, installation_required,
             payment_terms, notes, created_by)
           VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          enquiryNo, dateOnly(b.enquiry_date) || today(), str(b.enquiry_time),
          str(b.stage_label) || 'New', customerId,
          custName, str(b.cust_company), str(b.cust_phone), str(b.cust_alt_phone), str(b.cust_email),
          str(b.cust_gstin), str(b.cust_pan), str(b.cust_address), str(b.cust_city), str(b.cust_state),
          str(b.cust_pincode), str(b.reference), str(b.taken_by) || req.user.full_name, num(b.expected_budget),
          str(b.site_name), str(b.site_address), str(b.site_city), str(b.site_contact), str(b.site_mobile),
          str(b.visit_required) || 'No', str(b.measurement_taken) || 'No', str(b.measurement_by),
          dateOnly(b.measurement_date), dateOnly(b.required_date), str(b.installation_required) || 'No',
          str(b.payment_terms), str(b.notes), req.user.id
        );
      const enquiryId = info.lastInsertRowid;
      insertItems(enquiryId, items);

      let order = null;
      if (send) order = convertToOrder(enquiryId, req.user);
      return { enquiryId, enquiryNo, order };
    });

    audit(req, send ? 'enquiry.create+send' : 'enquiry.create', 'enquiry', out.enquiryId, {
      enquiry_no: out.enquiryNo,
      customer: custName,
    });
    res.status(201).json({ id: out.enquiryId, enquiry_no: out.enquiryNo, order: out.order });
  })
);

router.patch(
  '/:id',
  a.requireCapability('enquiry.edit'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const enq = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
    if (!enq) throw http(404, 'Enquiry not found.');
    if (enq.status === 'converted') {
      throw http(409, 'This enquiry has already become an order and can no longer be edited.');
    }
    if (enq.status === 'lost') throw http(409, 'A lost enquiry cannot be edited. Reopen it first.');

    const b = req.body;
    const sets = [];
    const vals = [];
    for (const f of ENQ_FIELDS) {
      if (b[f] !== undefined) {
        sets.push(`${f} = ?`);
        vals.push(f.includes('date') ? dateOnly(b[f]) : str(b[f]));
      }
    }
    if (b.expected_budget !== undefined) { sets.push('expected_budget = ?'); vals.push(num(b.expected_budget)); }
    if (b.enquiry_date !== undefined) { sets.push('enquiry_date = ?'); vals.push(dateOnly(b.enquiry_date) || today()); }
    sets.push(`updated_at = datetime('now')`);

    const out = tx(() => {
      db.prepare(`UPDATE enquiries SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
      if (b.items !== undefined) {
        const items = normaliseItems(b.items);
        db.prepare('DELETE FROM enquiry_items WHERE enquiry_id = ?').run(id);
        insertItems(id, items);
      }
      return b.send ? convertToOrder(id, req.user) : null;
    });

    audit(req, b.send ? 'enquiry.send' : 'enquiry.update', 'enquiry', id, { enquiry_no: enq.enquiry_no });
    res.json({ ok: true, order: out });
  })
);

/** Send an already-saved enquiry to the Factory / Costing department. */
router.post(
  '/:id/send',
  a.requireCapability('enquiry.send'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const order = tx(() => convertToOrder(id, req.user));
    audit(req, 'enquiry.send', 'enquiry', id, { order_no: order.order_no });
    res.json({ order });
  })
);

/** Close an enquiry as lost. A reason is mandatory — it drives the lost-reason report. */
router.post(
  '/:id/lost',
  a.requireCapability('enquiry.lost'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const enq = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
    if (!enq) throw http(404, 'Enquiry not found.');
    if (enq.status === 'converted') throw http(409, 'This enquiry is already an order and cannot be marked lost.');
    const reason = reqStr(req.body.lost_reason, 'Reason for rejection');
    if (!wf.LOST_REASONS.includes(reason)) throw http(400, 'Choose one of the listed rejection reasons.');
    const note = str(req.body.lost_reason_note);
    if (reason === 'Others' && !note) throw http(400, 'Describe the reason when choosing "Others".');

    db.prepare(
      `UPDATE enquiries SET status = 'lost', lost_reason = ?, lost_reason_note = ?, closed_at = datetime('now') WHERE id = ?`
    ).run(reason, note, id);
    audit(req, 'enquiry.lost', 'enquiry', id, { enquiry_no: enq.enquiry_no, reason, note });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/reopen',
  a.requireCapability('enquiry.edit'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const enq = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
    if (!enq) throw http(404, 'Enquiry not found.');
    if (enq.status !== 'lost') throw http(409, 'Only a lost enquiry can be reopened.');
    db.prepare(
      `UPDATE enquiries SET status = 'open', lost_reason = NULL, lost_reason_note = NULL, closed_at = NULL WHERE id = ?`
    ).run(id);
    audit(req, 'enquiry.reopen', 'enquiry', id, { enquiry_no: enq.enquiry_no });
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------- internals

function normaliseItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => str(i.product))
    .map((i, idx) => ({
      seq: idx + 1,
      product: str(i.product),
      size: str(i.size),
      qty: num(i.qty, 1) || 1,
      unit: str(i.unit) || 'nos',
      material: str(i.material),
      laminate: str(i.laminate),
      colour: str(i.colour),
      hardware: str(i.hardware),
      remarks: str(i.remarks),
    }));
}

function insertItems(enquiryId, items) {
  const ins = db.prepare(
    `INSERT INTO enquiry_items (enquiry_id, seq, product, size, qty, unit, material, laminate, colour, hardware, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const i of items) {
    ins.run(enquiryId, i.seq, i.product, i.size, i.qty, i.unit, i.material, i.laminate, i.colour, i.hardware, i.remarks);
  }
}

function upsertCustomerFromEnquiry(b, userId) {
  const name = str(b.cust_name);
  if (!name) return null;
  const found = db
    .prepare(`SELECT id FROM customers WHERE lower(trim(name)) = lower(trim(?)) AND IFNULL(phone,'') = IFNULL(?,'')`)
    .get(name, str(b.cust_phone));
  if (found) return found.id;
  const info = db
    .prepare(
      `INSERT INTO customers (name, company_name, phone, alt_phone, email, gstin, pan, address, city, state, pincode, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name, str(b.cust_company), str(b.cust_phone), str(b.cust_alt_phone), str(b.cust_email),
      str(b.cust_gstin), str(b.cust_pan), str(b.cust_address), str(b.cust_city), str(b.cust_state),
      str(b.cust_pincode), userId
    );
  return info.lastInsertRowid;
}

/**
 * Turn an enquiry into an order parked on the first workflow stage.
 * Must be called inside a transaction.
 */
function convertToOrder(enquiryId, user) {
  const enq = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(enquiryId);
  if (!enq) throw http(404, 'Enquiry not found.');
  if (enq.status === 'converted') throw http(409, 'This enquiry has already been sent to the factory.');
  if (enq.status === 'lost') throw http(409, 'A lost enquiry cannot be sent to the factory. Reopen it first.');
  const itemCount = db.prepare('SELECT COUNT(*) n FROM enquiry_items WHERE enquiry_id = ?').get(enquiryId).n;
  if (!itemCount) throw http(400, 'Add at least one product line before sending to the factory.');

  const orderNo = nextDocNo('ARL');
  const info = db
    .prepare(
      `INSERT INTO orders (order_no, enquiry_id, current_stage, priority, created_by)
       VALUES (?, ?, 'costing', ?, ?)`
    )
    .run(orderNo, enquiryId, 'Normal', user.id);
  const orderId = info.lastInsertRowid;

  db.prepare(
    `UPDATE enquiries SET status = 'converted', order_id = ?, stage_label = 'Quoted', closed_at = datetime('now') WHERE id = ?`
  ).run(orderId, enquiryId);

  logStage(orderId, 'enquiry', 'completed', user, `Enquiry ${enq.enquiry_no} sent to Factory / Costing`);
  return { id: orderId, order_no: orderNo, current_stage: 'costing' };
}

module.exports = { router, convertToOrder };
