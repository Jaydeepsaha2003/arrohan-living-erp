'use strict';

const express = require('express');
const { db, audit, tx, nextDocNo } = require('../db');
const a = require('../auth');
const { wrap, http, str, num, reqStr, round2, today, dateOnly, postStock, resolveMaterial } = require('../lib');

const router = express.Router();
router.use(a.requireAuth);

router.get(
  '/',
  wrap((req, res) => {
    const status = str(req.query.status);
    const sql = `
      SELECT po.*, o.order_no,
             (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.id) AS line_count
      FROM purchase_orders po
      LEFT JOIN orders o ON o.id = po.order_id
      ${status ? 'WHERE po.status = ?' : ''}
      ORDER BY po.id DESC`;
    const rows = status ? db.prepare(sql).all(status) : db.prepare(sql).all();
    res.json({
      purchaseOrders: rows.map((p) => ({
        ...p,
        items: db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id').all(p.id),
      })),
    });
  })
);

router.get(
  '/:id',
  wrap((req, res) => {
    const po = db
      .prepare('SELECT po.*, o.order_no FROM purchase_orders po LEFT JOIN orders o ON o.id = po.order_id WHERE po.id = ?')
      .get(Number(req.params.id));
    if (!po) throw http(404, 'Purchase order not found.');
    po.items = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ? ORDER BY id').all(po.id);
    po.supplier = po.supplier_id ? db.prepare('SELECT * FROM suppliers WHERE id = ?').get(po.supplier_id) : null;
    res.json({ purchaseOrder: po });
  })
);

router.post(
  '/',
  a.requireCapability('purchase.write'),
  wrap((req, res) => {
    const b = req.body;
    const supplierName = b.supplier_id
      ? (db.prepare('SELECT name FROM suppliers WHERE id = ?').get(Number(b.supplier_id)) || {}).name
      : str(b.supplier_name);
    if (!supplierName) throw http(400, 'Choose a supplier or type a supplier name.');

    const lines = Array.isArray(b.items) ? b.items.filter((i) => str(i.material)) : [];
    if (!lines.length) throw http(400, 'Add at least one material line to the purchase order.');

    const gstRate = num(b.gst_rate, 18);
    const out = tx(() => {
      const poNo = nextDocNo('PO');
      let subtotal = 0;
      const prepared = lines.map((i) => {
        const mat = resolveMaterial(i);
        const qty = num(i.qty);
        const rate = num(i.rate);
        const amount = round2(qty * rate);
        subtotal += amount;
        return { mat, material: str(i.material) || mat.name, qty, unit: str(i.unit) || mat.unit, rate, amount };
      });
      subtotal = round2(subtotal);
      const gstAmount = round2((subtotal * gstRate) / 100);
      const info = db
        .prepare(
          `INSERT INTO purchase_orders (po_no, po_date, supplier_id, supplier_name, supplier_phone, order_id,
                                        expected_date, subtotal, gst_rate, gst_amount, grand_total, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          poNo, dateOnly(b.po_date) || today(), b.supplier_id ? Number(b.supplier_id) : null, supplierName,
          str(b.supplier_phone), b.order_id ? Number(b.order_id) : null, dateOnly(b.expected_date),
          subtotal, gstRate, gstAmount, round2(subtotal + gstAmount), str(b.notes), req.user.id
        );
      const poId = info.lastInsertRowid;
      const insLine = db.prepare(
        `INSERT INTO purchase_order_items (po_id, material_id, material, qty, unit, rate, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const p of prepared) insLine.run(poId, p.mat ? p.mat.id : null, p.material, p.qty, p.unit, p.rate, p.amount);
      return { poId, poNo };
    });
    audit(req, 'purchase.create', 'purchase_order', out.poId, { po_no: out.poNo });
    res.status(201).json({ id: out.poId, po_no: out.poNo });
  })
);

/** Receive goods (GRN). Adds stock for every line and marks the PO received. */
router.post(
  '/:id/receive',
  a.requireCapability('purchase.receive'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) throw http(404, 'Purchase order not found.');
    if (po.status === 'received') throw http(409, `${po.po_no} has already been received.`);
    if (po.status === 'cancelled') throw http(409, `${po.po_no} was cancelled and cannot be received.`);

    const overrides = {};
    if (Array.isArray(req.body.lines)) {
      for (const l of req.body.lines) overrides[Number(l.id)] = num(l.qty_received);
    }

    const grn = tx(() => {
      const grnNo = nextDocNo('GRN');
      const lines = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(id);
      for (const line of lines) {
        const qty = overrides[line.id] !== undefined ? overrides[line.id] : num(line.qty);
        if (qty <= 0) continue;
        const mat = resolveMaterial({ material_id: line.material_id, material: line.material, unit: line.unit, rate: line.rate });
        db.prepare('UPDATE purchase_order_items SET qty_received = ?, material_id = ? WHERE id = ?').run(qty, mat.id, line.id);
        postStock({
          material_id: mat.id, qty, unit: line.unit, rate: line.rate,
          txn_type: 'purchase', ref_table: 'purchase_orders', ref_id: id,
          remarks: `${po.po_no} · ${po.supplier_name} · GRN ${grnNo}`, user_id: req.user.id,
        });
        // Keep the standard rate current with the latest purchase price.
        if (num(line.rate) > 0) db.prepare('UPDATE materials SET standard_rate = ? WHERE id = ?').run(num(line.rate), mat.id);
      }
      db.prepare(
        `UPDATE purchase_orders SET status = 'received', received_at = datetime('now'), received_by = ?, grn_no = ? WHERE id = ?`
      ).run(req.user.full_name, grnNo, id);
      return grnNo;
    });
    audit(req, 'purchase.receive', 'purchase_order', id, { po_no: po.po_no, grn: grn });
    res.json({ ok: true, grn_no: grn });
  })
);

router.post(
  '/:id/cancel',
  a.requireCapability('purchase.write'),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
    if (!po) throw http(404, 'Purchase order not found.');
    if (po.status === 'received') throw http(409, 'A received purchase order cannot be cancelled.');
    db.prepare(`UPDATE purchase_orders SET status = 'cancelled', notes = ? WHERE id = ?`).run(
      [po.notes, `Cancelled: ${str(req.body.reason) || 'no reason given'}`].filter(Boolean).join(' · '),
      id
    );
    audit(req, 'purchase.cancel', 'purchase_order', id, { reason: str(req.body.reason) });
    res.json({ ok: true });
  })
);

/** Suggests a PO from every material at or below its reorder level. */
router.get(
  '/suggest/reorder',
  wrap((req, res) => {
    const rows = db
      .prepare(
        `SELECT * FROM materials
         WHERE active = 1 AND reorder_level > 0 AND qty_in_stock <= reorder_level
         ORDER BY (qty_in_stock - reorder_level)`
      )
      .all();
    res.json({
      suggestions: rows.map((m) => ({
        material_id: m.id,
        material: m.name,
        unit: m.unit,
        rate: m.standard_rate,
        qty_in_stock: m.qty_in_stock,
        reorder_level: m.reorder_level,
        qty: round2(Math.max(num(m.reorder_level) * 2 - num(m.qty_in_stock), num(m.reorder_level))),
      })),
    });
  })
);

module.exports = router;
